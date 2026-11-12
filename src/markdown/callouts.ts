import { type PostTheme, themeCss } from "../leaflet/fonts";
import { utf8Length } from "../leaflet/richtext";
import type {
	Facet,
	LeafletBlock,
	OrderedListItem,
	UnorderedListItem,
} from "../leaflet/types";
import { escapeHtml } from "./inline";

export interface CalloutStyle {
	emoji: string;
	color: { r: number; g: number; b: number };
}

const BLUE = { r: 8, g: 109, b: 221 };
const CYAN = { r: 0, g: 191, b: 188 };
const GREEN = { r: 8, g: 185, b: 78 };
const ORANGE = { r: 236, g: 117, b: 0 };
const RED = { r: 233, g: 49, b: 71 };
const PURPLE = { r: 120, g: 82, b: 238 };
const GRAY = { r: 158, g: 158, b: 158 };

/** Obsidian callout types (and their aliases) with their default colors. */
const STYLES: [string[], CalloutStyle][] = [
	[["note"], { emoji: "📝", color: BLUE }],
	[["abstract", "summary", "tldr"], { emoji: "📋", color: CYAN }],
	[["info"], { emoji: "ℹ️", color: BLUE }],
	[["todo"], { emoji: "☑️", color: BLUE }],
	[["tip", "hint", "important"], { emoji: "💡", color: CYAN }],
	[["success", "check", "done"], { emoji: "✅", color: GREEN }],
	[["question", "help", "faq"], { emoji: "❓", color: ORANGE }],
	[["warning", "caution", "attention"], { emoji: "⚠️", color: ORANGE }],
	[["failure", "fail", "missing"], { emoji: "❌", color: RED }],
	[["danger", "error"], { emoji: "⚡", color: RED }],
	[["bug"], { emoji: "🐛", color: RED }],
	[["example"], { emoji: "📌", color: PURPLE }],
	[["quote", "cite"], { emoji: "💬", color: GRAY }],
];

export function calloutStyle(type: string): CalloutStyle {
	return STYLES.find(([names]) => names.includes(type))?.[1] ?? STYLES[0]![1];
}

const TAGS: Record<string, [string, string]> = {
	bold: ["<strong>", "</strong>"],
	italic: ["<em>", "</em>"],
	strikethrough: ["<s>", "</s>"],
	underline: ["<u>", "</u>"],
	code: ["<code>", "</code>"],
	highlight: ["<mark>", "</mark>"],
};

/** Rich text as HTML, facets turned back into tags. */
export function richTextToHtml(text: string, facets: Facet[] = []): string {
	const bytes = new TextEncoder().encode(text);
	const decoder = new TextDecoder();
	const cuts = new Set<number>([0, bytes.length]);
	for (const f of facets) cuts.add(f.index.byteStart).add(f.index.byteEnd);
	const points = [...cuts].filter((c) => c <= bytes.length).sort((a, b) => a - b);
	let html = "";
	for (let i = 0; i < points.length - 1; i++) {
		const start = points[i]!;
		const end = points[i + 1]!;
		let piece = escapeHtml(decoder.decode(bytes.slice(start, end))).replace(
			/\n/g,
			"<br>"
		);
		for (const facet of facets) {
			if (facet.index.byteStart > start || facet.index.byteEnd < end) continue;
			for (const feature of facet.features) {
				const name = feature.$type.split("#")[1] ?? "";
				if (feature.$type === "pub.leaflet.richtext.facet#link")
					piece = `<a href="${escapeHtml(feature.uri)}" target="_blank">${piece}</a>`;
				else if (TAGS[name]) piece = `${TAGS[name][0]}${piece}${TAGS[name][1]}`;
			}
		}
		html += piece;
	}
	return html;
}

function listToHtml(
	tag: "ul" | "ol",
	items: (UnorderedListItem | OrderedListItem)[]
): string {
	const lis = items.map((item) => {
		const content = "plaintext" in item.content ? item.content : null;
		const box = item.checked === undefined ? "" : item.checked ? "☑ " : "☐ ";
		let html = box + (content ? richTextToHtml(content.plaintext, content.facets) : "");
		if (item.children) html += listToHtml(tag, item.children);
		if ("orderedListChildren" in item && item.orderedListChildren)
			html += listToHtml("ol", item.orderedListChildren.children);
		if ("unorderedListChildren" in item && item.unorderedListChildren)
			html += listToHtml("ul", item.unorderedListChildren.children);
		return `<li>${html}</li>`;
	});
	return `<${tag}>${lis.join("")}</${tag}>`;
}

/** HTML of the blocks of a callout body, with a rough line count for the height. */
export function blocksToHtml(
	blocks: LeafletBlock[],
	fontSize = 16
): { html: string; lines: number } {
	let lines = 0;
	// Characters per line in a ~620px wide post, for this font size
	const perLine = Math.round(980 / fontSize);
	const count = (text: string) =>
		text
			.split("\n")
			.reduce((n, line) => n + Math.max(1, Math.ceil(utf8Length(line) / perLine)), 0);
	const parts = blocks.map((block) => {
		switch (block.$type) {
			case "pub.leaflet.blocks.text":
			case "pub.leaflet.blocks.blockquote":
				lines += count(block.plaintext) + 0.5;
				return `<p>${richTextToHtml(block.plaintext, block.facets)}</p>`;
			case "pub.leaflet.blocks.header":
				lines += count(block.plaintext) + 0.5;
				return `<p><strong>${richTextToHtml(block.plaintext, block.facets)}</strong></p>`;
			case "pub.leaflet.blocks.code":
				lines += block.plaintext.split("\n").length + 1;
				return `<pre><code>${escapeHtml(block.plaintext)}</code></pre>`;
			case "pub.leaflet.blocks.math":
				lines += 1.5;
				return `<p><code>${escapeHtml(block.tex)}</code></p>`;
			case "pub.leaflet.blocks.unorderedList":
			case "pub.leaflet.blocks.orderedList": {
				const html = listToHtml(
					block.$type === "pub.leaflet.blocks.orderedList" ? "ol" : "ul",
					block.children
				);
				lines += (html.match(/<li>/g)?.length ?? 0) + 0.5;
				return html;
			}
			default:
				return "";
		}
	});
	return { html: parts.join(""), lines };
}

export function calloutHtml(
	style: CalloutStyle,
	titleHtml: string,
	blocks: LeafletBlock[],
	theme?: PostTheme
): { html: string; height: number } {
	const { r, g, b } = style.color;
	const font = themeCss(theme);
	const body = blocksToHtml(blocks, font.fontSize);
	const css =
		font.css +
		`.callout{background:rgba(${r},${g},${b},.1);border-radius:6px;padding:12px 16px}` +
		`.title{color:rgb(${r},${g},${b});font-weight:700;margin-bottom:4px}` +
		"p{margin:0 0 8px}p:last-child{margin:0}ul,ol{margin:0 0 8px;padding-left:22px}" +
		"pre{background:rgba(128,128,128,.15);padding:8px;border-radius:4px;overflow:auto;margin:0 0 8px}" +
		`a{color:rgb(${r},${g},${b})}`;
	const html =
		`<style>${css}</style><div class="callout"><div class="title heading">${style.emoji} ${titleHtml}</div>` +
		`${body.html}</div>`;
	const height = Math.round(24 + font.lineHeight + 4 + body.lines * font.lineHeight);
	return { html, height: Math.min(1600, Math.max(16, height)) };
}
