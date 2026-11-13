import type { App, FrontMatterCache, TFile } from "obsidian";
import type { AtpClient, ListedRecord } from "../atproto/client";
import { isValidRecordKey, parseAtUri } from "../atproto/tid";
import { DOCUMENT_COLLECTION, type GazetteSettings } from "../interfaces";
import type { StandardDocument } from "../leaflet/types";
import { getString, slugify } from "./frontmatter";
import { getStrings } from "./targets";

export interface FoundPost {
	rkey: string;
	record: ListedRecord<StandardDocument>;
	/** How the post was matched to the note. */
	by: "key" | "title";
}

export interface RecoveryContext {
	app: App;
	client: AtpClient;
	settings: GazetteSettings;
	/** Documents of the repository, listed once per run. */
	listDocuments: () => Promise<ListedRecord<StandardDocument>[]>;
	/** Note that already owns a record key in the current run. */
	ownerOf: (rkey: string) => string | undefined;
}

export function normalizeTitle(title: string): string {
	return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function stripMarkdown(text: string): string {
	return text
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/[*_~=`]/g, "");
}

/** Title the post of a note should have, without converting the note. */
export function expectedTitle(
	app: App,
	settings: GazetteSettings,
	file: TFile,
	fm: FrontMatterCache | undefined
): string {
	const fromProperty = getString(fm, settings.titleKey);
	if (fromProperty) return fromProperty;
	if (settings.firstHeadingAsTitle) {
		const cache = app.metadataCache.getFileCache(file);
		const first = cache?.sections?.find((s) => s.type !== "yaml");
		const heading = cache?.headings?.[0];
		if (
			first?.type === "heading" &&
			heading?.level === 1 &&
			heading.position.start.line === first.position.start.line
		)
			return stripMarkdown(heading.heading).trim();
	}
	return file.basename;
}

/** Record keys the post of a note may already use: reserved address, then slug. */
export function candidateKeys(
	settings: GazetteSettings,
	file: TFile,
	fm: FrontMatterCache | undefined
): string[] {
	const keys: string[] = [];
	const url = getString(fm, settings.urlKey);
	if (url) keys.push(decodeURIComponent(url.replace(/\/+$/, "").split("/").pop() ?? ""));
	const slug = getString(fm, settings.slugKey);
	if (slug || settings.useSlugAsRecordKey) keys.push(slugify(slug ?? file.basename));
	return [...new Set(keys.filter(isValidRecordKey))];
}

/** Whether another note of the vault already points to this record. */
function claimedByAnotherNote(ctx: RecoveryContext, file: TFile, rkey: string): boolean {
	const owner = ctx.ownerOf(rkey);
	if (owner && owner !== file.path) return true;
	const { uriKey } = ctx.settings;
	return ctx.app.vault.getMarkdownFiles().some((other) => {
		if (other.path === file.path) return false;
		const uris = getStrings(
			ctx.app.metadataCache.getFileCache(other)?.frontmatter,
			uriKey
		);
		return uris.some((uri) => {
			const parsed = parseAtUri(uri);
			return parsed?.collection === DOCUMENT_COLLECTION && parsed.rkey === rkey;
		});
	});
}

/**
 * Find the post of a note that lost its link (sync issue, failed write…): first at
 * the key it should use, then by title when exactly one free post matches.
 */
export async function findExistingPost(
	ctx: RecoveryContext,
	file: TFile,
	fm: FrontMatterCache | undefined,
	site?: string
): Promise<FoundPost | null> {
	const inSite = (record: StandardDocument) => site === undefined || record.site === site;
	const keys = candidateKeys(ctx.settings, file, fm);
	// A post in another publication than the first one may use the slug and its name
	const pub = ctx.settings.publications.find((p) => p.uri === site);
	const explicit = getString(fm, ctx.settings.slugKey);
	const slug =
		explicit || ctx.settings.useSlugAsRecordKey ? slugify(explicit ?? file.basename) : "";
	if (slug && pub) keys.push(slugify(`${slug}-${pub.name}`));
	for (const rkey of keys) {
		if (claimedByAnotherNote(ctx, file, rkey)) continue;
		const record = await ctx.client.getRecord<StandardDocument>(
			DOCUMENT_COLLECTION,
			rkey
		);
		if (record && inSite(record.value)) return { rkey, record, by: "key" };
	}
	const title = normalizeTitle(expectedTitle(ctx.app, ctx.settings, file, fm));
	const matches = (await ctx.listDocuments()).filter((r) => {
		const rkey = parseAtUri(r.uri)?.rkey;
		return (
			!!rkey &&
			inSite(r.value) &&
			normalizeTitle(r.value.title ?? "") === title &&
			!claimedByAnotherNote(ctx, file, rkey)
		);
	});
	if (matches.length !== 1) return null;
	const record = matches[0]!;
	return { rkey: parseAtUri(record.uri)!.rkey, record, by: "title" };
}
