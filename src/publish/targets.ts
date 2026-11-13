import i18next from "i18next";
import type { FrontMatterCache } from "obsidian";
import type { GazetteSettings } from "../interfaces";
import { standaloneSite } from "../leaflet/publications";
import { getBoolean, PREFERENCE_KEYS } from "./frontmatter";

/** A post of a note: its record, its address and the site it belongs to (when known). */
export interface PostLink {
	uri: string;
	url?: string;
	site?: string;
}

/** Values of a property written as a single value or as a list. */
export function getStrings(fm: FrontMatterCache | undefined, key: string): string[] {
	if (!fm || !key) return [];
	const value = fm[key] as unknown;
	const values = Array.isArray(value) ? value : [value];
	return values
		.filter((v): v is string | number => typeof v === "string" || typeof v === "number")
		.map((v) => String(v).trim())
		.filter(Boolean);
}

/** Posts of a note, from its URI and URL properties (lists for several publications). */
export function readLinks(
	fm: FrontMatterCache | undefined,
	settings: GazetteSettings
): PostLink[] {
	const urls = getStrings(fm, settings.urlKey);
	return getStrings(fm, settings.uriKey).map((uri, i) => ({
		uri,
		...(urls[i] && { url: urls[i] }),
	}));
}

/** Save the posts of a note: a single value for one post, lists for several. */
export function writeLinks(
	front: Record<string, unknown>,
	settings: GazetteSettings,
	links: PostLink[]
) {
	const { uriKey, urlKey } = settings;
	const set = (key: string, values: string[]) => {
		if (!key) return;
		if (values.length === 0) delete front[key];
		else front[key] = values.length === 1 ? values[0] : values;
	};
	set(
		uriKey,
		links.map((l) => l.uri)
	);
	set(
		urlKey,
		links.map((l) => l.url ?? "")
	);
}

/** Site of a publication named in a note: its name, address or AT-URI, or "none". */
function siteOf(settings: GazetteSettings, value: string, did: string): string {
	const lower = value.toLowerCase();
	if (lower === "none" || lower === "standalone") return standaloneSite(did);
	const pub = settings.publications.find(
		(p) => p.uri === value || p.name.toLowerCase() === lower || p.url === value
	);
	if (!pub) throw new Error(i18next.t("error.unknownPublication", { name: value }));
	return pub.uri;
}

/**
 * Publications a note asks for: listed in its publication property, or marked by the
 * publish property of a publication. Null when the note asks for none.
 */
export function noteTargets(
	settings: GazetteSettings,
	fm: FrontMatterCache | undefined,
	did: string
): string[] | null {
	const sites = getStrings(fm, PREFERENCE_KEYS.publication).map((v) =>
		siteOf(settings, v, did)
	);
	for (const pub of settings.publications)
		if (pub.publishKey && getBoolean(fm, pub.publishKey) === true) sites.push(pub.uri);
	return sites.length > 0 ? [...new Set(sites)] : null;
}

/** Whether a note is marked for publishing, globally or for one of the publications. */
export function isMarkedNote(
	settings: GazetteSettings,
	fm: FrontMatterCache | undefined
): boolean {
	if (settings.publishKey && getBoolean(fm, settings.publishKey) === true) return true;
	return settings.publications.some(
		(p) => !!p.publishKey && getBoolean(fm, p.publishKey) === true
	);
}
