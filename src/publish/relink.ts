import type { TFile } from "obsidian";
import { isExcalidraw } from "../markdown/compilers/excalidraw";
import type LeafletAtmosphere from "../main";
import { getBoolean, getString } from "./frontmatter";
import { candidateKeys, expectedTitle, normalizeTitle } from "./recovery";

export interface PostToLink {
	uri: string;
	rkey: string;
	title: string;
	url: string;
}

/** Write the link of a post in a note. */
export async function linkNote(
	plugin: LeafletAtmosphere,
	file: TFile,
	post: PostToLink
): Promise<void> {
	const { uriKey, urlKey } = plugin.settings;
	await plugin.app.fileManager.processFrontMatter(
		file,
		(front: Record<string, unknown>) => {
			if (uriKey) front[uriKey] = post.uri;
			if (urlKey) front[urlKey] = post.url;
		}
	);
}

/** Notes that may receive a link: not linked yet, not blocked, not drawings. */
export function unlinkedNotes(plugin: LeafletAtmosphere): TFile[] {
	const { app, settings } = plugin;
	return app.vault.getMarkdownFiles().filter((file) => {
		if (isExcalidraw(app, file)) return false;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		return (
			!getString(fm, settings.uriKey) && getBoolean(fm, settings.publishKey) !== false
		);
	});
}

/**
 * Link posts without note to the notes they come from: by record key (reserved
 * address or slug), then by title when a single note and a single post match.
 */
export async function relinkNotes(
	plugin: LeafletAtmosphere,
	posts: PostToLink[]
): Promise<TFile[]> {
	const { app, settings } = plugin;
	const notes = unlinkedNotes(plugin);
	const byKey = new Map(posts.map((p) => [p.rkey, p]));
	const linked = new Map<TFile, PostToLink>();
	const used = new Set<string>();

	for (const note of notes) {
		const fm = app.metadataCache.getFileCache(note)?.frontmatter;
		const post = candidateKeys(settings, note, fm)
			.map((key) => byKey.get(key))
			.find((p) => p && !used.has(p.uri));
		if (post) {
			linked.set(note, post);
			used.add(post.uri);
		}
	}

	const group = <T>(items: T[], key: (item: T) => string) => {
		const map = new Map<string, T[]>();
		for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
		return map;
	};
	const postsByTitle = group(
		posts.filter((p) => !used.has(p.uri)),
		(p) => normalizeTitle(p.title)
	);
	const notesByTitle = group(
		notes.filter((n) => !linked.has(n)),
		(n) =>
			normalizeTitle(
				expectedTitle(app, settings, n, app.metadataCache.getFileCache(n)?.frontmatter)
			)
	);
	for (const [title, sameTitle] of notesByTitle) {
		const candidates = postsByTitle.get(title) ?? [];
		if (sameTitle.length === 1 && candidates.length === 1)
			linked.set(sameTitle[0]!, candidates[0]!);
	}

	for (const [note, post] of linked) await linkNote(plugin, note, post);
	return [...linked.keys()];
}
