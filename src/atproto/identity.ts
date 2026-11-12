import { requestUrl } from "obsidian";

const PUBLIC_API = "https://public.api.bsky.app";
const PLC_DIRECTORY = "https://plc.directory";

interface DidDocument {
	id: string;
	alsoKnownAs?: string[];
	service?: { id: string; type: string; serviceEndpoint: string }[];
}

async function getJson<T>(url: string): Promise<T | null> {
	const res = await requestUrl({ url, throw: false });
	if (res.status >= 400) return null;
	return res.json as T;
}

export async function resolveHandle(handle: string): Promise<string> {
	const clean = handle.replace(/^@/, "").trim().toLowerCase();
	const res = await getJson<{ did: string }>(
		`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(clean)}`
	);
	if (res?.did) return res.did;
	const wellKnown = await requestUrl({
		url: `https://${clean}/.well-known/atproto-did`,
		throw: false,
	});
	const did = wellKnown.status < 400 ? wellKnown.text.trim() : "";
	if (did.startsWith("did:")) return did;
	throw new Error(`Unable to resolve handle "${clean}"`);
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

export async function resolveIdentity(
	identifier: string
): Promise<{ did: string; pds: string }> {
	const did = identifier.startsWith("did:")
		? identifier
		: await resolveHandle(identifier);
	const pds = pdsFromDidDocument(await resolveDidDocument(did));
	return { did, pds };
}
