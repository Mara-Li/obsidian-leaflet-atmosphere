import { requestUrl, type RequestUrlResponse } from "obsidian";
import type { BlobRef } from "../leaflet/types";
import { resolveIdentity } from "./identity";

export class XrpcError extends Error {
	constructor(
		public status: number,
		public error: string,
		message: string
	) {
		super(`${error || status}: ${message}`);
	}
}

interface Session {
	did: string;
	handle: string;
	accessJwt: string;
	refreshJwt: string;
}

export interface Credentials {
	identifier: string;
	password: string;
	pdsUrl?: string;
}

export interface ListedRecord<T> {
	uri: string;
	cid: string;
	value: T;
}

type Params = Record<string, string | number | undefined>;

export class AtpClient {
	private session: Session | null = null;
	pds = "";

	constructor(private credentials: Credentials) {}

	get did(): string {
		if (!this.session) throw new Error("Not logged in");
		return this.session.did;
	}

	get handle(): string {
		return this.session?.handle ?? "";
	}

	async login(): Promise<Session> {
		const { identifier, password, pdsUrl } = this.credentials;
		if (!identifier || !password) throw new Error("Missing identifier or app password");
		this.pds = pdsUrl?.replace(/\/+$/, "") || (await resolveIdentity(identifier)).pds;
		const res = await this.raw("POST", "com.atproto.server.createSession", {
			body: { identifier: identifier.replace(/^@/, "").trim(), password },
		});
		this.session = res.json as Session;
		return this.session;
	}

	private async ensureSession() {
		if (!this.session) await this.login();
	}

	private async refresh(): Promise<void> {
		if (!this.session) {
			await this.login();
			return;
		}
		const res = await this.raw("POST", "com.atproto.server.refreshSession", {
			token: this.session.refreshJwt,
		}).catch(() => null);
		if (res) this.session = { ...this.session, ...(res.json as Session) };
		else await this.login();
	}

	private async raw(
		method: "GET" | "POST",
		nsid: string,
		opts: {
			params?: Params;
			body?: unknown;
			binary?: ArrayBuffer;
			contentType?: string;
			token?: string;
		} = {}
	): Promise<RequestUrlResponse> {
		const query = Object.entries(opts.params ?? {})
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
			.join("&");
		const headers: Record<string, string> = {};
		if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
		const res = await requestUrl({
			url: `${this.pds}/xrpc/${nsid}${query ? `?${query}` : ""}`,
			method,
			headers,
			contentType:
				opts.contentType ?? (opts.body !== undefined ? "application/json" : undefined),
			body:
				opts.binary ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
			throw: false,
		});
		if (res.status >= 400) {
			let error = "";
			let message = res.text;
			try {
				const json = res.json as { error?: string; message?: string };
				error = json.error ?? "";
				message = json.message ?? message;
			} catch {
				/* not json */
			}
			throw new XrpcError(res.status, error, message);
		}
		return res;
	}

	private async call(
		method: "GET" | "POST",
		nsid: string,
		opts: {
			params?: Params;
			body?: unknown;
			binary?: ArrayBuffer;
			contentType?: string;
		} = {}
	): Promise<RequestUrlResponse> {
		await this.ensureSession();
		try {
			return await this.raw(method, nsid, { ...opts, token: this.session!.accessJwt });
		} catch (e) {
			if (e instanceof XrpcError && (e.error === "ExpiredToken" || e.status === 401)) {
				await this.refresh();
				return this.raw(method, nsid, { ...opts, token: this.session!.accessJwt });
			}
			throw e;
		}
	}

	async getRecord<T>(
		collection: string,
		rkey: string,
		repo = this.did
	): Promise<ListedRecord<T> | null> {
		try {
			const res = await this.call("GET", "com.atproto.repo.getRecord", {
				params: { repo, collection, rkey },
			});
			return res.json as ListedRecord<T>;
		} catch (e) {
			if (e instanceof XrpcError && (e.error === "RecordNotFound" || e.status === 404))
				return null;
			throw e;
		}
	}

	async listRecords<T>(collection: string, repo = this.did): Promise<ListedRecord<T>[]> {
		const out: ListedRecord<T>[] = [];
		let cursor: string | undefined;
		do {
			const res = await this.call("GET", "com.atproto.repo.listRecords", {
				params: { repo, collection, limit: 100, cursor },
			});
			const json = res.json as { records: ListedRecord<T>[]; cursor?: string };
			out.push(...json.records);
			cursor = json.records.length ? json.cursor : undefined;
		} while (cursor);
		return out;
	}

	async putRecord(
		collection: string,
		rkey: string,
		record: unknown
	): Promise<{ uri: string; cid: string }> {
		const res = await this.call("POST", "com.atproto.repo.putRecord", {
			body: { repo: this.did, collection, rkey, record, validate: false },
		});
		return res.json as { uri: string; cid: string };
	}

	async deleteRecord(collection: string, rkey: string): Promise<void> {
		await this.call("POST", "com.atproto.repo.deleteRecord", {
			body: { repo: this.did, collection, rkey },
		});
	}

	async uploadBlob(data: ArrayBuffer, mimeType: string): Promise<BlobRef> {
		const res = await this.call("POST", "com.atproto.repo.uploadBlob", {
			binary: data,
			contentType: mimeType,
		});
		return (res.json as { blob: BlobRef }).blob;
	}

	async getBskyPost(uri: string): Promise<{ uri: string; cid: string } | null> {
		const res = await requestUrl({
			url: `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`,
			throw: false,
		});
		if (res.status >= 400) return null;
		const post = (res.json as { posts: { uri: string; cid: string }[] }).posts[0];
		return post ? { uri: post.uri, cid: post.cid } : null;
	}
}
