import type { FrontMatterCache } from "obsidian";

export const PREFERENCE_KEYS = {
	publication: "leaflet_publication",
	showInDiscover: "leaflet_discover",
	showComments: "leaflet_comments",
	showMentions: "leaflet_mentions",
	showRecommends: "leaflet_recommends",
} as const;

export function getString(
	fm: FrontMatterCache | undefined,
	key: string
): string | undefined {
	if (!fm || !key) return undefined;
	const value = fm[key] as unknown;
	if (typeof value === "string") return value.trim() || undefined;
	if (typeof value === "number") return String(value);
	if (Array.isArray(value) && typeof value[0] === "string")
		return value[0].trim() || undefined;
	return undefined;
}

export function getBoolean(
	fm: FrontMatterCache | undefined,
	key: string
): boolean | undefined {
	const value = fm?.[key] as unknown;
	if (typeof value === "boolean") return value;
	if (typeof value === "string" && /^(true|false)$/i.test(value.trim()))
		return value.trim().toLowerCase() === "true";
	return undefined;
}

export function getTags(fm: FrontMatterCache | undefined, key: string): string[] {
	const value = fm?.[key] as unknown;
	const raw: unknown[] = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(/[,\s]+/)
			: [];
	const tags = raw
		.filter((t): t is string => typeof t === "string")
		.map((t) => t.trim().replace(/^#/, ""))
		.filter((t) => t.length > 0)
		.map((t) => t.slice(0, 100));
	return [...new Set(tags)];
}

export function getDate(
	fm: FrontMatterCache | undefined,
	key: string
): string | undefined {
	const value = fm?.[key] as unknown;
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Strip the wikilink or markdown wrapper of a frontmatter link. */
export function unwrapLink(value: string): string {
	const wiki = /^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(value);
	if (wiki) return wiki[1]!.trim();
	const md = /^!?\[[^\]]*\]\(([^)]+)\)$/.exec(value);
	if (md) return md[1]!.trim().replace(/^<|>$/g, "");
	return value;
}

export function slugify(text: string): string {
	return text
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 100);
}
