/**
 * Embed baking adapted from obsidian-easy-bake (mgmeyers, GPL-3.0) through Enveloppe.
 * @source https://github.com/mgmeyers/obsidian-easy-bake
 * @source https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/conversion/compiler/embeds.ts
 */
import {
	type App,
	type BlockSubpathResult,
	type CachedMetadata,
	type HeadingSubpathResult,
	parseLinktext,
	resolveSubpath,
	TFile,
} from "obsidian";
import type { EmbedMode } from "../interfaces";
import { DataviewCompiler } from "./compilers/dataview";
import { isExcalidraw } from "./compilers/excalidraw";

const FENCE =
	/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/gm;
const MAX_DEPTH = 4;

export function stripFrontmatter(content: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(content);
	return match ? content.slice(match[0].length) : content;
}

/** Apply `fn` to every part of the text that is not inside a fenced code block. */
function outsideCode(text: string, fn: (chunk: string) => string): string {
	let out = "";
	let last = 0;
	for (const match of text.matchAll(FENCE)) {
		out += fn(text.slice(last, match.index));
		out += match[0];
		last = match.index + match[0].length;
	}
	return out + fn(text.slice(last));
}

function applyIndent(text: string, indent: string): string {
	return text.trim().replace(/(\r?\n)/g, `$1${indent}`);
}

function stripFirstBullet(text: string): string {
	return text.replace(/^[ \t]*(?:[-*+]|[0-9]+[.)]) +/, "");
}

function dedent(text: string): string {
	const indent = /^([ \t]*)/.exec(text)?.[1];
	if (!indent) return text;
	return text.replace(new RegExp(`^${indent}`, "gm"), "");
}

/** Range of a heading or block, a list block keeps its nested items. */
function subpathRange(
	result: HeadingSubpathResult | BlockSubpathResult,
	cache: CachedMetadata,
	length: number
): { start: number; end: number; list: boolean } {
	if (result.type === "block" && result.list && cache.listItems) {
		const target = result.list;
		const ancestors = new Set<number>([target.position.start.line]);
		let end = target.position.end.offset;
		let found = false;
		for (const item of cache.listItems) {
			if (item === target) {
				found = true;
				continue;
			}
			if (!found) continue;
			if (!ancestors.has(item.parent)) break;
			ancestors.add(item.position.start.line);
			end = item.position.end.offset;
		}
		return {
			start: target.position.start.offset - target.position.start.col,
			end,
			list: true,
		};
	}
	return { start: result.start.offset, end: result.end?.offset ?? length, list: false };
}

export class Preprocessor {
	private dataview: DataviewCompiler | null;

	/** DataviewJS queries left out because DataviewJS is disabled in Dataview. */
	get skippedDataviewJs(): number {
		return this.dataview?.skippedJs ?? 0;
	}

	constructor(
		private app: App,
		private embedMode: EmbedMode,
		convertDataview: boolean
	) {
		this.dataview = DataviewCompiler.create(app, convertDataview);
	}

	async run(file: TFile): Promise<string> {
		const text = await this.expand(file, null, new Set(), 0);
		return outsideCode(text.replace(/\r\n?/g, "\n"), (chunk) =>
			chunk
				.replace(/[ \t]*%%[\s\S]*?%%/g, "")
				.replace(/<!--[\s\S]*?-->/g, "")
				.replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/gm, "")
				.replace(/^\^[A-Za-z0-9-]+[ \t]*$/gm, "")
		);
	}

	/** Content of a note (or of one of its sections) with its embeds baked in. */
	private async expand(
		file: TFile,
		subpath: string | null,
		ancestors: Set<string>,
		depth: number
	): Promise<string> {
		const text = await this.app.vault.cachedRead(file);
		const cache = this.app.metadataCache.getFileCache(file);
		let start = 0;
		let end = text.length;
		let list = false;
		if (subpath) {
			const result = cache ? resolveSubpath(cache, subpath) : null;
			if (!cache || !result || result.type === "footnote") return "";
			({ start, end, list } = subpathRange(result, cache, text.length));
		}

		let slice = text.slice(start, end);
		const embeds = (cache?.embeds ?? [])
			.filter((e) => e.position.start.offset >= start && e.position.end.offset <= end)
			.sort((a, b) => b.position.start.offset - a.position.start.offset);
		const key = `${file.path}#${subpath ?? ""}`;
		const nested = new Set(ancestors).add(key);

		for (const embed of embeds) {
			const { path, subpath: sub } = parseLinktext(embed.link);
			const linked = path
				? this.app.metadataCache.getFirstLinkpathDest(path, file.path)
				: file;
			if (
				!(linked instanceof TFile) ||
				linked.extension !== "md" ||
				isExcalidraw(this.app, linked)
			)
				continue;
			const from = embed.position.start.offset - start;
			const to = embed.position.end.offset - start;
			const before = slice.slice(0, from);
			const after = slice.slice(to);
			let replacement: string;
			if (this.embedMode === "link") replacement = embed.original.replace(/^!/, "");
			else if (depth >= MAX_DEPTH || nested.has(`${linked.path}#${sub || ""}`))
				replacement = "";
			else {
				let baked = stripFrontmatter(
					await this.expand(linked, sub || null, nested, depth + 1)
				).trim();
				const listMatch = /(?:^|\n)([ \t]*)(?:[-*+]|[0-9]+[.)]) +$/.exec(before);
				const quoteMatch = /(?:^|\n)((?:[ \t]*>[ \t]?)+)$/.exec(before);
				if (listMatch) baked = applyIndent(stripFirstBullet(baked), listMatch[1]!);
				else if (quoteMatch) baked = applyIndent(baked, quoteMatch[1]!);
				else if (/(?:^|\n)[ \t]*$/.test(before) && /^[ \t]*(?:\n|$)/.test(after))
					baked = `\n${baked}\n`;
				replacement = baked;
			}
			slice = before + replacement + after;
		}

		if (list) slice = dedent(slice);
		if (start === 0) slice = stripFrontmatter(slice);
		return this.dataview ? this.dataview.convert(slice, file.path) : slice;
	}
}

export function splitSubpath(link: string): [string, string | undefined] {
	const hash = link.indexOf("#");
	if (hash === -1) return [link, undefined];
	return [link.slice(0, hash), link.slice(hash + 1)];
}
