import type { AtpClient } from "../atproto/client";
import { parseAtUri } from "../atproto/tid";
import type {
	Color,
	LegacyPublication,
	PublicationInfo,
	StandardPublication,
	Theme,
} from "../types";

function toCss(color: Color | undefined): string | undefined {
	if (!color || [color.r, color.g, color.b].some((c) => typeof c !== "number"))
		return undefined;
	return typeof color.a === "number"
		? `rgba(${color.r},${color.g},${color.b},${color.a / 100})`
		: `rgb(${color.r},${color.g},${color.b})`;
}

/** Fonts and colors of a publication theme, without empty values. */
export function themeOf(theme: Theme | undefined): Partial<PublicationInfo> {
	const out: Partial<PublicationInfo> = {};
	if (theme?.bodyFont) out.bodyFont = theme.bodyFont;
	if (theme?.headingFont) out.headingFont = theme.headingFont;
	const textColor = toCss(theme?.primary);
	if (textColor) out.textColor = textColor;
	// The page has its own background only when the theme shows it
	const background = toCss(
		theme?.showPageBackground ? theme.pageBackground : theme?.backgroundColor
	);
	if (background) out.backgroundColor = background;
	const accent = toCss(theme?.accentBackground);
	if (accent) out.accentColor = accent;
	return out;
}

/** Theme of a publication read from its record, for an up-to-date look. */
export async function fetchPublicationTheme(
	client: AtpClient,
	uri: string
): Promise<Partial<PublicationInfo> | null> {
	const parsed = parseAtUri(uri);
	if (!parsed) return null;
	const record = await client
		.getRecord<{ theme?: Theme }>(parsed.collection, parsed.rkey, parsed.repo)
		.catch(() => null);
	return record ? themeOf(record.value.theme) : null;
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
			...themeOf(r.value.theme),
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
			...themeOf(r.value.theme),
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
