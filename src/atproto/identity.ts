import i18next from "i18next";
import type { RequestUrlResponse } from "obsidian";
import { httpErrorMessage, NetworkError, request } from "./http";

const PUBLIC_API = "https://public.api.bsky.app";
const PLC_DIRECTORY = "https://plc.directory";
/** Bluesky entryway: accepts a login by email and hands over to the real PDS. */
export const ENTRYWAY = "https://bsky.social";

export interface DidDocument {
	id: string;
	alsoKnownAs?: string[];
	service?: { id: string; type: string; serviceEndpoint: string }[];
}

/** JSON body of a response, with a readable error when the server sent something else. */
export function readJson<T>(res: RequestUrlResponse, url: string): T {
	const text = res.text.trim();
	if (!text) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(httpErrorMessage(res.status, url));
	}
}

async function getJson<T>(url: string): Promise<T | null> {
	const res = await request({ url });
	if (res.status >= 400) return null;
	try {
		return readJson<T>(res, url);
	} catch {
		return null;
	}
}

export function isEmail(identifier: string): boolean {
	return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier);
}

/** Accept "@handle", a bsky.app profile URL, a DID or an email. */
export function normalizeIdentifier(input: string): string {
	let value = input.trim();
	const profile = /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/?#]+)/i.exec(value);
	if (profile) value = decodeURIComponent(profile[1]!);
	if (isEmail(value)) return value;
	value = value.replace(/^@/, "");
	return value.startsWith("did:") ? value : value.toLowerCase();
}

/** Accept a PDS written without scheme or with the /xrpc suffix. */
export function normalizePdsUrl(input: string): string {
	let value = input.trim();
	if (!value) return "";
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	return value.replace(/\/+$/, "").replace(/\/xrpc$/i, "");
}

export async function resolveHandle(handle: string): Promise<string> {
	const clean = normalizeIdentifier(handle);
	const res = await getJson<{ did?: string }>(
		`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(clean)}`
	);
	if (res?.did) return res.did;
	const wellKnown = await request({
		url: `https://${clean}/.well-known/atproto-did`,
	}).catch((e: unknown) => {
		// A handle that is not a domain fails here; only network trouble is worth reporting
		if (e instanceof NetworkError && e.code !== "ERR_NAME_NOT_RESOLVED") throw e;
		return null;
	});
	const did = wellKnown && wellKnown.status < 400 ? wellKnown.text.trim() : "";
	if (did.startsWith("did:")) return did;
	throw new Error(i18next.t("error.unknownHandle", { handle: clean }));
}

export async function resolveDidDocument(did: string): Promise<DidDocument> {
	let url: string;
	if (did.startsWith("did:plc:")) url = `${PLC_DIRECTORY}/${did}`;
	else if (did.startsWith("did:web:"))
		url = `https://${decodeURIComponent(did.slice("did:web:".length))}/.well-known/did.json`;
	else throw new Error(`Unsupported DID method: ${did}`);
	const doc = await getJson<DidDocument>(url);
	if (!doc) throw new Error(`Unable to resolve DID document for ${did}`);
	return doc;
}

export function pdsFromDidDocument(doc: DidDocument): string {
	const service = doc.service?.find(
		(s) => s.id.endsWith("#atproto_pds") || s.type === "AtprotoPersonalDataServer"
	);
	if (!service) throw new Error(`No PDS declared for ${doc.id}`);
	return service.serviceEndpoint.replace(/\/+$/, "");
}

/** PDS to log in to: the declared one, or the Bluesky entryway for an email. */
export async function resolvePds(identifier: string): Promise<string> {
	if (isEmail(identifier)) return ENTRYWAY;
	const did = identifier.startsWith("did:")
		? identifier
		: await resolveHandle(identifier);
	return pdsFromDidDocument(await resolveDidDocument(did));
}
