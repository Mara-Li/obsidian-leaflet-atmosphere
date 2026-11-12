import { type App, TFile } from "obsidian";
import type { EmbedMode } from "../interfaces";

const FENCE =
	/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/gm;
const NOTE_EMBED = /^([ \t]*)!\[\[([^\]\n]+)\]\][ \t]*$/gm;
const MAX_DEPTH = 4;

export function stripFrontmatter(content: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(content);
	return match ? content.slice(match[0].length) : content;
}

/** Apply `fn` to every part of the text that is not inside a fenced code block. */
async function outsideCode(
	text: string,
	fn: (chunk: string) => Promise<string> | string
): Promise<string> {
	let out = "";
	let last = 0;
	for (const match of text.matchAll(FENCE)) {
		out += await fn(text.slice(last, match.index));
		out += match[0];
		last = match.index + match[0].length;
	}
	return out + (await fn(text.slice(last)));
}

function normalizeHeading(value: string): string {
	return value
		.replace(/[#^|[\]\\:]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

export class Preprocessor {
	constructor(
		private app: App,
		private embedMode: EmbedMode
	) {}

	async run(content: string, sourcePath: string, depth = 0, seen = new Set<string>()) {
		const body = stripFrontmatter(content).replace(/\r\n?/g, "\n");
		return outsideCode(body, async (chunk) => {
			let text = chunk
				.replace(/[ \t]*%%[\s\S]*?%%/g, "")
				.replace(/<!--[\s\S]*?-->/g, "")
				.replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/gm, "")
				.replace(/^\^[A-Za-z0-9-]+[ \t]*$/gm, "");
			const replacements: string[] = [];
			for (const match of text.matchAll(NOTE_EMBED))
				replacements.push(
					await this.embed(match[2]!, match[1]!, sourcePath, depth, seen)
				);
			let i = 0;
			text = text.replace(NOTE_EMBED, (whole) => replacements[i++] ?? whole);
			return text;
		});
	}

	private async embed(
		link: string,
		indent: string,
		sourcePath: string,
		depth: number,
		seen: Set<string>
	): Promise<string> {
		const original = `${indent}![[${link}]]`;
		const [rawPath, ...rest] = link.split("|");
		const [path, subpath] = splitSubpath(rawPath!.trim());
		const file = path
			? this.app.metadataCache.getFirstLinkpathDest(path, sourcePath)
			: this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile) || file.extension !== "md") return original;
		if (this.embedMode === "link") {
			const alias = rest.length ? `|${rest.join("|")}` : "";
			return `${indent}[[${rawPath}${alias}]]`;
		}
		const key = `${file.path}#${subpath ?? ""}`;
		if (depth >= MAX_DEPTH || seen.has(key)) return "";
		const content = await this.app.vault.cachedRead(file);
		const section = this.slice(file, content, subpath);
		const nested = new Set(seen).add(key);
		const processed = await this.run(section, file.path, depth + 1, nested);
		return `\n${processed.trim()}\n`;
	}

	private slice(file: TFile, content: string, subpath?: string): string {
		if (!subpath) return content;
		const cache = this.app.metadataCache.getFileCache(file);
		if (subpath.startsWith("^")) {
			const block = cache?.blocks?.[subpath.slice(1).toLowerCase()];
			return block
				? content.slice(block.position.start.offset, block.position.end.offset)
				: "";
		}
		const headings = cache?.headings ?? [];
		const wanted = normalizeHeading(subpath.split("#").pop() ?? subpath);
		const index = headings.findIndex((h) => normalizeHeading(h.heading) === wanted);
		if (index === -1) return "";
		const heading = headings[index]!;
		const next = headings.slice(index + 1).find((h) => h.level <= heading.level);
		return content.slice(
			heading.position.start.offset,
			next ? next.position.start.offset : content.length
		);
	}
}

export function splitSubpath(link: string): [string, string | undefined] {
	const hash = link.indexOf("#");
	if (hash === -1) return [link, undefined];
	return [link.slice(0, hash), link.slice(hash + 1)];
}
