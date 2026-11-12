import i18next from "i18next";
import type { BlobRef } from "../leaflet/types";
import { httpErrorMessage, request } from "./http";
import {
	type DidDocument,
	normalizeIdentifier,
	normalizePdsUrl,
	pdsFromDidDocument,
	readJson,
	resolvePds,
} from "./identity";

export class XrpcError extends Error {
	constructor(
		public status: number,
		public error: string,
		message: string,
		options?: ErrorOptions
	) {
		super(error ? `${error}: ${message}` : message, options);
	}
}

interface Session {
	did: string;
	handle: string;
	accessJwt: string;
	refreshJwt: string;
	didDoc?: DidDocument;
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
		const identifier = normalizeIdentifier(this.credentials.identifier);
		const { password } = this.credentials;
		if (!identifier || !password) throw new Error(i18next.t("error.missingCredentials"));
		this.pds =
			normalizePdsUrl(this.credentials.pdsUrl ?? "") || (await resolvePds(identifier));
		try {
			this.session = await this.raw<Session>("POST", "com.atproto.server.createSession", {
				body: { identifier, password: password.trim() },
			});
		} catch (e) {
			if (e instanceof XrpcError && e.error === "AuthenticationRequired")
				throw new Error(i18next.t("error.badCredentials", { identifier }), { cause: e });
			throw e;
		}
		// A login through the entryway (email) continues on the account's own PDS
		if (this.session.didDoc) {
			try {
				this.pds = pdsFromDidDocument(this.session.didDoc);
			} catch {
				/* keep the current PDS */
			}
		}
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
		const res = await this.raw<Session>("POST", "com.atproto.server.refreshSession", {
			token: this.session.refreshJwt,
		}).catch(() => null);
		if (res) this.session = { ...this.session, ...res };
		else await this.login();
	}

	private async raw<T>(
		method: "GET" | "POST",
		nsid: string,
		opts: {
			params?: Params;
			body?: unknown;
			binary?: ArrayBuffer;
			contentType?: string;
			token?: string;
		} = {}
	): Promise<T> {
		const query = Object.entries(opts.params ?? {})
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
			.join("&");
		const headers: Record<string, string> = {};
		if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
		const url = `${this.pds}/xrpc/${nsid}${query ? `?${query}` : ""}`;
		const res = await request({
			url,
			method,
			headers,
			contentType:
				opts.contentType ?? (opts.body !== undefined ? "application/json" : undefined),
			body:
				opts.binary ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
			throw: false,
		});
		if (res.status >= 400) {
			let json: { error?: string; message?: string };
			try {
				json = readJson(res, url);
			} catch (e) {
				// An HTML page from a proxy or a website, not an AT Protocol answer
				throw new XrpcError(res.status, "", (e as Error).message, { cause: e });
			}
			// Outages and rate limits get a plain explanation, whatever the server said
			if (res.status >= 500 || res.status === 429 || !json.error)
				throw new XrpcError(res.status, "", httpErrorMessage(res.status, url));
			throw new XrpcError(res.status, json.error, json.message ?? `HTTP ${res.status}`);
		}
		return readJson<T>(res, url);
	}

	private async call<T>(
		method: "GET" | "POST",
		nsid: string,
		opts: {
			params?: Params;
			body?: unknown;
			binary?: ArrayBuffer;
			contentType?: string;
		} = {}
	): Promise<T> {
		await this.ensureSession();
		try {
			return await this.raw<T>(method, nsid, { ...opts, token: this.session!.accessJwt });
		} catch (e) {
			if (e instanceof XrpcError && (e.error === "ExpiredToken" || e.status === 401)) {
				await this.refresh();
				return this.raw<T>(method, nsid, { ...opts, token: this.session!.accessJwt });
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
			return await this.call<ListedRecord<T>>("GET", "com.atproto.repo.getRecord", {
				params: { repo, collection, rkey },
			});
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
			const json = await this.call<{ records: ListedRecord<T>[]; cursor?: string }>(
				"GET",
				"com.atproto.repo.listRecords",
				{ params: { repo, collection, limit: 100, cursor } }
			);
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
		return this.call<{ uri: string; cid: string }>("POST", "com.atproto.repo.putRecord", {
			body: { repo: this.did, collection, rkey, record, validate: false },
		});
	}

	async deleteRecord(collection: string, rkey: string): Promise<void> {
		await this.call("POST", "com.atproto.repo.deleteRecord", {
			body: { repo: this.did, collection, rkey },
		});
	}

	async uploadBlob(data: ArrayBuffer, mimeType: string): Promise<BlobRef> {
		const res = await this.call<{ blob: BlobRef }>(
			"POST",
			"com.atproto.repo.uploadBlob",
			{
				binary: data,
				contentType: mimeType,
			}
		);
		return res.blob;
	}

	async getBskyPost(uri: string): Promise<{ uri: string; cid: string } | null> {
		const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`;
		const res = await request({ url });
		if (res.status >= 400) return null;
		const post = readJson<{ posts?: { uri: string; cid: string }[] }>(res, url)
			.posts?.[0];
		return post ? { uri: post.uri, cid: post.cid } : null;
	}
}
