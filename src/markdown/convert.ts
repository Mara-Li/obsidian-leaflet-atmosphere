import type { Token, Tokens } from "marked";
import { type App, TFile } from "obsidian";
import type { LeafletAtmosphereSettings } from "../interfaces";
import type { ImageUploader } from "../leaflet/images";
import { RichText } from "../leaflet/richtext";
import type {
	FacetFeature,
	ImageBlock,
	LeafletBlock,
	ListContent,
	OrderedListBlock,
	OrderedListItem,
	StrongRef,
	UnorderedListBlock,
	UnorderedListItem,
} from "../leaflet/types";
import type {
	FootnoteDefToken,
	FootnoteRefToken,
	HighlightToken,
	InlineFootnoteToken,
	MathToken,
	WikilinkToken,
} from "./extensions";
import { createLexer } from "./extensions";
import {
	applyInlineHtml,
	decodeEntities,
	escapeHtml,
	getAttribute,
	InlineCollector,
	withFeature,
} from "./inline";
import { splitSubpath } from "./preprocess";

type Generic = Tokens.Generic;

const F = {
	bold: { $type: "pub.leaflet.richtext.facet#bold" },
	italic: { $type: "pub.leaflet.richtext.facet#italic" },
	strike: { $type: "pub.leaflet.richtext.facet#strikethrough" },
	code: { $type: "pub.leaflet.richtext.facet#code" },
	highlight: { $type: "pub.leaflet.richtext.facet#highlight" },
} as const satisfies Record<string, FacetFeature>;

const link = (uri: string): FacetFeature => ({
	$type: "pub.leaflet.richtext.facet#link",
	uri,
});

const BSKY_POST =
	/^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/\s]+)\/post\/([a-z0-9]+)\/?$/i;
const YOUTUBE =
	/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i;

export interface ConverterDeps {
	app: App;
	settings: LeafletAtmosphereSettings;
	images: ImageUploader;
	sourcePath: string;
	strictLineBreaks: boolean;
	resolveBskyPost(handleOrDid: string, rkey: string): Promise<StrongRef | null>;
	/** URLs published during the current run, by file path. */
	publishedUrls?: Map<string, string>;
}

export interface ConvertResult {
	blocks: LeafletBlock[];
	title?: string;
	textContent: string;
	warnings: string[];
}

function isBlank(token: Token) {
	return token.type === "space" || (token.type === "text" && !str(token.text).trim());
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function parseSize(value: string | undefined): number | undefined {
	const match = value ? /^(\d+)(?:x\d+)?$/.exec(value.trim()) : null;
	return match ? Number.parseInt(match[1]!, 10) : undefined;
}

function basename(path: string) {
	return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export class MarkdownConverter {
	private footnotes = new Map<string, Generic[]>();
	private inlineFootnotes = 0;
	private warnings: string[] = [];

	constructor(private deps: ConverterDeps) {}

	async convert(markdown: string): Promise<ConvertResult> {
		const tokens = createLexer(!this.deps.strictLineBreaks).lexer(markdown) as Token[];
		for (const token of tokens)
			if (token.type === "footnoteDef") {
				const def = token as FootnoteDefToken;
				this.footnotes.set(def.id, def.tokens);
			}

		let title: string | undefined;
		const firstIndex = tokens.findIndex((t) => !isBlank(t));
		const first = tokens[firstIndex] as Tokens.Heading | undefined;
		if (
			this.deps.settings.firstHeadingAsTitle &&
			first?.type === "heading" &&
			first.depth === 1
		) {
			title = (await this.inline(first.tokens)).text().text.trim();
			tokens.splice(firstIndex, 1);
		}

		const blocks = await this.blocks(tokens);
		return { blocks, title, textContent: plainText(blocks), warnings: this.warnings };
	}

	private async blocks(tokens: Token[]): Promise<LeafletBlock[]> {
		const out: LeafletBlock[] = [];
		for (const token of tokens) out.push(...(await this.block(token)));
		return out;
	}

	private async block(token: Token): Promise<LeafletBlock[]> {
		switch (token.type) {
			case "heading": {
				const rich = (await this.inline(token.tokens as Generic[])).text();
				if (rich.isBlank) return [];
				return [
					{
						$type: "pub.leaflet.blocks.header",
						level: Math.min(Math.max(token.depth as number, 1), 6),
						...rich.toBlockFields(),
					},
				];
			}
			case "paragraph":
			case "text":
				return this.paragraph(token);
			case "blockquote":
				return this.blockquote(token as Tokens.Blockquote);
			case "list":
				return [await this.list(token as Tokens.List)];
			case "code": {
				const code = token as Tokens.Code;
				const language = code.lang?.trim().split(/\s+/)[0];
				return [
					{
						$type: "pub.leaflet.blocks.code",
						plaintext: code.text,
						...(language && { language }),
						...(this.deps.settings.codeTheme && {
							syntaxHighlightingTheme: this.deps.settings.codeTheme,
						}),
					},
				];
			}
			case "blockMath":
				return [{ $type: "pub.leaflet.blocks.math", tex: (token as MathToken).text }];
			case "hr":
				return [{ $type: "pub.leaflet.blocks.horizontalRule" }];
			case "table":
				return [this.table(token as Tokens.Table)];
			case "html":
				return this.htmlBlock(token as Tokens.HTML);
			default:
				return [];
		}
	}

	private async paragraph(token: Generic): Promise<LeafletBlock[]> {
		const text = str(token.text);
		const tokens = (token.tokens ?? [{ type: "text", raw: text, text }]).filter(
			(t: Generic) => !isBlank(t)
		) as Generic[];
		if (tokens.length === 1) {
			const embed = await this.standaloneEmbed(tokens[0]!);
			if (embed) return [embed];
		}
		const segments = (await this.inline(token.tokens ?? [token])).finish();
		return segments.map((seg) =>
			seg instanceof RichText
				? { $type: "pub.leaflet.blocks.text", ...seg.toBlockFields() }
				: seg
		);
	}

	private async standaloneEmbed(token: Generic): Promise<LeafletBlock | null> {
		let url: string | undefined;
		if (token.type === "link") {
			const label = (token as Tokens.Link).text.trim();
			const href = (token as Tokens.Link).href;
			if (label === href || token.raw === href || (token as Tokens.Link).autolink)
				url = href;
		} else if (token.type === "image") url = (token as Tokens.Image).href;
		if (!url || !/^https?:\/\//i.test(url)) return null;

		const youtube = YOUTUBE.exec(url);
		if (youtube && (token.type === "image" || this.deps.settings.linkCards))
			return {
				$type: "pub.leaflet.blocks.iframe",
				url: `https://www.youtube.com/embed/${youtube[1]}`,
				height: 360,
			};
		if (!this.deps.settings.linkCards) return null;
		const bsky = BSKY_POST.exec(url);
		if (bsky) {
			const postRef = await this.deps
				.resolveBskyPost(bsky[1]!, bsky[2]!)
				.catch(() => null);
			if (postRef) return { $type: "pub.leaflet.blocks.bskyPost", postRef };
		}
		if (token.type === "link") return { $type: "pub.leaflet.blocks.website", src: url };
		return null;
	}

	private async blockquote(token: Tokens.Blockquote): Promise<LeafletBlock[]> {
		const children = [...token.tokens];
		const callout = extractCallout(children);
		const inner = await this.blocks(children);
		const out: LeafletBlock[] = [];
		let quote: RichText | null = null;
		let separator = "\n\n";
		if (callout) {
			const col = new InlineCollector();
			if (callout.title) await this.renderInline(callout.title, col, [F.bold]);
			quote = col.text().trim();
			if (quote.isBlank)
				quote.append(callout.type.charAt(0).toUpperCase() + callout.type.slice(1), [
					F.bold,
				]);
			separator = "\n";
		}
		const flush = () => {
			if (quote && !quote.isBlank)
				out.push({ $type: "pub.leaflet.blocks.blockquote", ...quote.toBlockFields() });
			quote = null;
		};
		for (const block of inner) {
			if (
				block.$type === "pub.leaflet.blocks.text" ||
				block.$type === "pub.leaflet.blocks.blockquote" ||
				block.$type === "pub.leaflet.blocks.header"
			) {
				const rich =
					block.$type === "pub.leaflet.blocks.header"
						? new RichText().append(block.plaintext, [F.bold])
						: RichText.from(block.plaintext, block.facets);
				quote ??= new RichText();
				if (!quote.isBlank) quote.append(separator);
				separator = "\n\n";
				quote.appendRich(rich);
			} else {
				flush();
				out.push(block);
			}
		}
		flush();
		return out;
	}

	private async list(token: Tokens.List): Promise<UnorderedListBlock | OrderedListBlock> {
		if (token.ordered) {
			const start = typeof token.start === "number" ? token.start : 1;
			const children: OrderedListItem[] = [];
			for (const item of token.items) {
				const { content, nested } = await this.listItem(item);
				const entry: OrderedListItem = {
					$type: "pub.leaflet.blocks.orderedList#listItem",
					content,
					...(item.task && { checked: !!item.checked }),
				};
				for (const sub of nested) {
					if (sub.$type === "pub.leaflet.blocks.orderedList")
						entry.children = [...(entry.children ?? []), ...sub.children];
					else entry.unorderedListChildren ??= sub;
				}
				children.push(entry);
			}
			return {
				$type: "pub.leaflet.blocks.orderedList",
				...(start !== 1 && { startIndex: start }),
				children,
			};
		}
		const children: UnorderedListItem[] = [];
		for (const item of token.items) {
			const { content, nested } = await this.listItem(item);
			const entry: UnorderedListItem = {
				$type: "pub.leaflet.blocks.unorderedList#listItem",
				content,
				...(item.task && { checked: !!item.checked }),
			};
			for (const sub of nested) {
				if (sub.$type === "pub.leaflet.blocks.unorderedList")
					entry.children = [...(entry.children ?? []), ...sub.children];
				else entry.orderedListChildren ??= sub;
			}
			children.push(entry);
		}
		return { $type: "pub.leaflet.blocks.unorderedList", children };
	}

	private async listItem(item: Tokens.ListItem): Promise<{
		content: ListContent;
		nested: (UnorderedListBlock | OrderedListBlock)[];
	}> {
		const col = new InlineCollector();
		const nested: (UnorderedListBlock | OrderedListBlock)[] = [];
		for (const token of item.tokens) {
			if (token.type === "checkbox" || token.type === "space") continue;
			if (token.type === "list") {
				nested.push(await this.list(token as Tokens.List));
				continue;
			}
			if (col.current.text) col.append("\n", []);
			if (token.type === "text" || token.type === "paragraph" || token.type === "heading")
				await this.renderInline((token as Generic).tokens ?? [token], col, []);
			else if (token.type === "code") col.append((token as Tokens.Code).text, [F.code]);
			else col.append(decodeEntities(((token as Generic).text as string) ?? ""), []);
		}
		const segments = col.finish();
		const text = new RichText();
		for (const seg of segments) {
			if (!(seg instanceof RichText)) continue;
			if (text.text) text.append("\n");
			text.appendRich(seg);
		}
		const image = segments.find((s): s is ImageBlock => !(s instanceof RichText));
		const content: ListContent =
			text.isBlank && image
				? image
				: { $type: "pub.leaflet.blocks.text", ...text.toBlockFields() };
		return { content, nested };
	}

	private table(token: Tokens.Table): LeafletBlock {
		if (this.deps.settings.tableMode === "code")
			return {
				$type: "pub.leaflet.blocks.code",
				plaintext: token.raw.trim(),
				language: "markdown",
			};
		const align = (a: string | null) => (a ? ` style="text-align:${a}"` : "");
		const head = token.header
			.map((c) => `<th${align(c.align)}>${htmlInline(c.tokens)}</th>`)
			.join("");
		const rows = token.rows
			.map(
				(r) =>
					`<tr>${r.map((c) => `<td${align(c.align)}>${htmlInline(c.tokens)}</td>`).join("")}</tr>`
			)
			.join("");
		const style =
			"body{margin:0;font-family:system-ui,sans-serif;font-size:15px;color:#222}" +
			"table{border-collapse:collapse;width:100%}" +
			"th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}" +
			"th{background:#f4f4f4}code{font-family:monospace}";
		return {
			$type: "pub.leaflet.blocks.html",
			html: `<style>${style}</style><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
			height: Math.min(1600, Math.max(16, (token.rows.length + 1) * 36 + 8)),
		};
	}

	private async htmlBlock(token: Tokens.HTML): Promise<LeafletBlock[]> {
		const raw = token.raw.trim();
		if (/^<iframe\b/i.test(raw)) {
			const url = getAttribute(raw, "src");
			const height = Number.parseInt(getAttribute(raw, "height") ?? "", 10);
			if (url && /^https?:\/\//i.test(url))
				return [
					{
						$type: "pub.leaflet.blocks.iframe",
						url,
						...(height >= 16 && height <= 1600 && { height }),
					},
				];
		}
		const img = /^<img\b[^>]*>/i.exec(raw);
		if (img) {
			const src = getAttribute(img[0], "src");
			const image = src
				? await this.image(
						src,
						getAttribute(img[0], "alt"),
						parseSize(getAttribute(img[0], "width"))
					)
				: null;
			if (image) return [image];
		}
		const text = decodeEntities(
			raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
		).trim();
		return text ? [{ $type: "pub.leaflet.blocks.text", plaintext: text }] : [];
	}

	private async image(
		src: string,
		alt?: string,
		width?: number
	): Promise<ImageBlock | null> {
		try {
			const uploaded = await this.deps.images.upload(src, this.deps.sourcePath);
			if (!uploaded) {
				this.warnings.push(src);
				return null;
			}
			return {
				$type: "pub.leaflet.blocks.image",
				image: uploaded.blob,
				aspectRatio: uploaded.aspectRatio,
				...(alt && { alt }),
				...(width && { width }),
			};
		} catch (e) {
			console.error("[Leaflet] image upload failed", src, e);
			this.warnings.push(src);
			return null;
		}
	}

	private async inline(tokens: Generic[]): Promise<InlineCollector> {
		const col = new InlineCollector();
		await this.renderInline(tokens, col, []);
		return col;
	}

	private async renderInline(
		tokens: Generic[],
		col: InlineCollector,
		features: FacetFeature[]
	) {
		for (const token of tokens) await this.renderToken(token, col, features);
	}

	private async renderToken(
		token: Generic,
		col: InlineCollector,
		features: FacetFeature[]
	) {
		switch (token.type) {
			case "text":
				if (token.tokens?.length) return this.renderInline(token.tokens, col, features);
				return col.append(this.softBreaks(decodeEntities(str(token.text))), features);
			case "escape":
				return col.append(str(token.text), features);
			case "strong":
				return this.renderInline(token.tokens!, col, withFeature(features, F.bold));
			case "em":
				return this.renderInline(token.tokens!, col, withFeature(features, F.italic));
			case "del":
				return this.renderInline(token.tokens!, col, withFeature(features, F.strike));
			case "highlight":
				return this.renderInline(
					(token as HighlightToken).tokens,
					col,
					withFeature(features, F.highlight)
				);
			case "codespan":
				return col.append(decodeEntities(str(token.text)), withFeature(features, F.code));
			case "inlineMath":
				return col.append((token as MathToken).text, withFeature(features, F.code));
			case "br":
				return col.append("\n", features);
			case "link":
				return this.renderLink(token as Tokens.Link, col, features);
			case "wikilink":
				return this.renderWikilink(token as WikilinkToken, col, features);
			case "embed":
				return this.renderEmbed(token as WikilinkToken, col, features);
			case "image": {
				const img = token as Tokens.Image;
				const youtube = YOUTUBE.exec(img.href);
				if (youtube) return col.append(img.href, withFeature(features, link(img.href)));
				const [alt, size] = splitAltSize(img.text);
				const image = await this.image(img.href, alt, size);
				if (image) col.pushImage(image);
				return;
			}
			case "html": {
				const src = applyInlineHtml(col, token as Tokens.HTML);
				if (src) {
					const image = await this.image(src, getAttribute(token.raw, "alt"));
					if (image) col.pushImage(image);
				}
				return;
			}
			case "footnoteRef":
				return this.renderFootnote(token as FootnoteRefToken, col);
			case "inlineFootnote": {
				const id = `inline-${++this.inlineFootnotes}`;
				return this.appendFootnote(id, (token as InlineFootnoteToken).tokens, col);
			}
			case "checkbox":
				return;
			default:
				if (token.tokens?.length) return this.renderInline(token.tokens, col, features);
				if (typeof token.text === "string")
					col.append(decodeEntities(token.text), features);
		}
	}

	private softBreaks(text: string) {
		return this.deps.strictLineBreaks ? text.replace(/[ \t]*\n[ \t]*/g, " ") : text;
	}

	private async renderLink(
		token: Tokens.Link,
		col: InlineCollector,
		features: FacetFeature[]
	) {
		let href = token.href;
		if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#")) {
			const url = this.publishedUrl(decodeURIComponent(href));
			if (!url) return this.renderInline(token.tokens, col, features);
			href = url;
		}
		if (href.startsWith("#")) return this.renderInline(token.tokens, col, features);
		return this.renderInline(token.tokens, col, withFeature(features, link(href)));
	}

	private renderWikilink(
		token: WikilinkToken,
		col: InlineCollector,
		features: FacetFeature[]
	) {
		const [path, sub] = splitSubpath(token.target);
		const display =
			token.alias ||
			(path
				? sub
					? `${basename(path)} > ${sub.replace(/^\^/, "")}`
					: basename(path)
				: (sub ?? ""));
		const url = path ? this.publishedUrl(token.target) : null;
		col.append(display, url ? withFeature(features, link(url)) : features);
	}

	private async renderEmbed(
		token: WikilinkToken,
		col: InlineCollector,
		features: FacetFeature[]
	) {
		if (this.deps.images.resolveFile(token.target, this.deps.sourcePath)) {
			const [alt, size] = splitAltSize(token.alias ?? "");
			const image = await this.image(token.target, alt || undefined, size);
			if (image) col.pushImage(image);
			return;
		}
		this.renderWikilink({ ...token, type: "wikilink" }, col, features);
	}

	private async renderFootnote(token: FootnoteRefToken, col: InlineCollector) {
		const def = this.footnotes.get(token.id);
		if (!def) return col.append(token.raw, []);
		return this.appendFootnote(`fn-${token.id}`, def, col);
	}

	private async appendFootnote(id: string, tokens: Generic[], col: InlineCollector) {
		const content = (await this.inline(tokens)).text();
		col.current.append("*", [
			{
				$type: "pub.leaflet.richtext.facet#footnote",
				footnoteId: id,
				contentPlaintext: content.text,
				...(content.facets.length > 0 && { contentFacets: content.facets }),
			},
		]);
	}

	/** URL of an already published note, used for internal links. */
	private publishedUrl(target: string): string | null {
		if (this.deps.settings.wikilinkMode !== "published") return null;
		const [path] = splitSubpath(target);
		const file = this.deps.app.metadataCache.getFirstLinkpathDest(
			path.replace(/\.md$/i, ""),
			this.deps.sourcePath
		);
		if (!(file instanceof TFile)) return null;
		const known = this.deps.publishedUrls?.get(file.path);
		if (known) return known;
		const fm = this.deps.app.metadataCache.getFileCache(file)?.frontmatter;
		const url = fm?.[this.deps.settings.urlKey] as unknown;
		return typeof url === "string" && /^https?:\/\//.test(url) ? url : null;
	}
}

function splitAltSize(alt: string): [string, number | undefined] {
	const match = /^(.*?)\|?\s*(\d+)(?:x\d+)?\s*$/.exec(alt);
	if (match && (match[1] === "" || alt.includes("|")))
		return [match[1]!.trim(), Number.parseInt(match[2]!, 10)];
	return [alt.trim(), undefined];
}

interface Callout {
	type: string;
	title: Generic[] | null;
}

/** Detect an Obsidian callout (`> [!type] title`) and strip its marker from the tokens. */
function extractCallout(children: Token[]): Callout | null {
	const paragraph = children[0] as Tokens.Paragraph | undefined;
	if (paragraph?.type !== "paragraph") return null;
	const first = paragraph.tokens[0];
	if (first?.type !== "text") return null;
	const match = /^\[!([\w-]+)\][+-]?[ \t]*/.exec(first.text as string);
	if (!match) return null;

	const rest: Generic[] = [
		{ type: "text", raw: "", text: (first.text as string).slice(match[0].length) },
		...(paragraph.tokens.slice(1) as Generic[]),
	];
	const title: Generic[] = [];
	let body: Generic[] = [];
	for (let i = 0; i < rest.length; i++) {
		const token = rest[i]!;
		if (token.type === "br") {
			body = rest.slice(i + 1);
			break;
		}
		const newline = token.type === "text" ? (token.text as string).indexOf("\n") : -1;
		if (newline !== -1) {
			title.push({
				type: "text",
				raw: "",
				text: (token.text as string).slice(0, newline),
			});
			body = [
				{ type: "text", raw: "", text: (token.text as string).slice(newline + 1) },
				...rest.slice(i + 1),
			];
			break;
		}
		title.push(token);
	}
	if (body.length > 0) children[0] = { ...paragraph, tokens: body };
	else children.shift();
	const hasTitle = title.some(
		(t) => (t.text as string | undefined)?.trim() || t.type !== "text"
	);
	return { type: match[1]!.toLowerCase(), title: hasTitle ? title : null };
}

function htmlInline(tokens: Token[]): string {
	return tokens
		.map((token) => {
			const t = token as Generic;
			const inner = () =>
				t.tokens ? htmlInline(t.tokens) : escapeHtml(decodeEntities(str(t.text)));
			switch (t.type) {
				case "strong":
					return `<strong>${inner()}</strong>`;
				case "em":
					return `<em>${inner()}</em>`;
				case "del":
					return `<s>${inner()}</s>`;
				case "highlight":
					return `<mark>${inner()}</mark>`;
				case "codespan":
				case "inlineMath":
					return `<code>${escapeHtml(decodeEntities(str(t.text)))}</code>`;
				case "link":
					return /^https?:/i.test(str(t.href))
						? `<a href="${escapeHtml(str(t.href))}" target="_blank">${inner()}</a>`
						: inner();
				case "wikilink":
				case "embed":
					return escapeHtml(str(t.alias) || str(t.target));
				case "br":
					return "<br>";
				case "html":
					return /^<\/?(br|b|i|u|s|em|strong|code|mark|sub|sup)\b[^>]*>$/i.test(
						t.raw.trim()
					)
						? t.raw
						: "";
				default:
					return inner();
			}
		})
		.join("");
}

function plainText(blocks: LeafletBlock[]): string {
	const parts: string[] = [];
	const visitItems = (items: (UnorderedListItem | OrderedListItem)[]) => {
		for (const item of items) {
			if ("plaintext" in item.content) parts.push(item.content.plaintext);
			if (item.children) visitItems(item.children);
			if ("orderedListChildren" in item && item.orderedListChildren)
				visitItems(item.orderedListChildren.children);
			if ("unorderedListChildren" in item && item.unorderedListChildren)
				visitItems(item.unorderedListChildren.children);
		}
	};
	for (const block of blocks) {
		if ("plaintext" in block) parts.push(block.plaintext);
		else if (
			block.$type === "pub.leaflet.blocks.unorderedList" ||
			block.$type === "pub.leaflet.blocks.orderedList"
		)
			visitItems(block.children);
		else if (block.$type === "pub.leaflet.blocks.math") parts.push(block.tex);
	}
	return parts.join("\n\n");
}
