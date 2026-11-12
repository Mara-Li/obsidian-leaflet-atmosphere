import type { AtpClient } from "../atproto/client";
import { parseAtUri } from "../atproto/tid";
import type { PublicationInfo } from "./types";

export const DOCUMENT_COLLECTION = "site.standard.document";

interface StandardPublication {
	name?: string;
	url?: string;
}

interface LegacyPublication {
	name?: string;
	base_path?: string;
}

export async function fetchPublications(client: AtpClient): Promise<PublicationInfo[]> {
	const [standard, legacy] = await Promise.all([
		client.listRecords<StandardPublication>("site.standard.publication"),
		client.listRecords<LegacyPublication>("pub.leaflet.publication").catch(() => []),
	]);
	const out: PublicationInfo[] = standard.map((r) => {
		const name = r.value.name ?? parseAtUri(r.uri)?.rkey ?? r.uri;
		return {
			uri: r.uri,
			name,
			url:
				r.value.url?.replace(/\/+$/, "") ||
				`https://leaflet.pub/lish/${client.did}/${encodeURIComponent(name)}`,
		};
	});
	const known = new Set(out.map((p) => parseAtUri(p.uri)?.rkey));
	for (const r of legacy) {
		const rkey = parseAtUri(r.uri)?.rkey;
		// Migrated publications keep their rkey in the site.standard collection
		if (rkey && known.has(rkey)) continue;
		const name = r.value.name ?? rkey ?? r.uri;
		out.push({
			uri: r.uri,
			name,
			url: r.value.base_path
				? `https://${r.value.base_path.replace(/\/+$/, "")}`
				: `https://leaflet.pub/lish/${client.did}/${encodeURIComponent(name)}`,
		});
	}
	return out;
}

export function standaloneSite(did: string): string {
	return `https://leaflet.pub/p/${did}`;
}

export function documentUrl(
	site: string,
	path: string,
	publications: PublicationInfo[]
): string {
	let base = site;
	if (site.startsWith("at://")) {
		const pub = publications.find((p) => p.uri === site);
		const parsed = parseAtUri(site);
		base =
			pub?.url ||
			`https://leaflet.pub/lish/${parsed?.repo}/${encodeURIComponent(pub?.name ?? parsed?.rkey ?? "")}`;
	}
	return base.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`);
}
