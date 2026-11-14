import type { Tokens } from "marked";
import type { App, TFile } from "obsidian";
import type { ImageUploader } from "../leaflet/images";
import type { RichText } from "../leaflet/richtext";
import type { LinkPreview, PostTheme } from "./content";
import type { ImageBlock, LeafletBlock, LinearDocumentPage, StrongRef } from "./lexicons";
import type { GazetteSettings } from "./settings";

export interface WikilinkToken extends Tokens.Generic {
	type: "wikilink" | "embed";
	target: string;
	alias?: string;
}

export interface HighlightToken extends Tokens.Generic {
	type: "highlight";
	tokens: Tokens.Generic[];
}

export interface MathToken extends Tokens.Generic {
	type: "inlineMath" | "blockMath";
	text: string;
}

export interface FootnoteRefToken extends Tokens.Generic {
	type: "footnoteRef";
	id: string;
}

export interface InlineFootnoteToken extends Tokens.Generic {
	type: "inlineFootnote";
	tokens: Tokens.Generic[];
}

export interface FootnoteDefToken extends Tokens.Generic {
	type: "footnoteDef";
	id: string;
	tokens: Tokens.Generic[];
}

export interface ConverterDeps {
	app: App;
	settings: GazetteSettings;
	images: ImageUploader;
	sourcePath: string;
	strictLineBreaks: boolean;
	resolveBskyPost(handleOrDid: string, rkey: string): Promise<StrongRef | null>;
	/** SVG markup of a rendered Mermaid diagram. */
	renderDiagram?: (source: string) => Promise<string | null>;
	/** Title, image and standard.site records of a web page, for link cards. */
	linkPreview?: (url: string) => Promise<LinkPreview>;
	/** DID of a mentioned handle, or null when it does not exist. */
	resolveMention?: (handle: string) => Promise<string | null>;
	/** Notes embedded as sub-pages by the preprocessor. */
	embeds?: Map<string, EmbeddedNote>;
	/** Fonts and colors of the publication, for HTML blocks. */
	theme?: PostTheme;
	/** Published (or reserved) URL of a note, used for internal links. */
	noteUrl?: (file: TFile) => Promise<string | null>;
}

export interface ConvertResult {
	blocks: LeafletBlock[];
	/** Secondary pages, opened from page blocks (callouts in "page" mode). */
	pages: LinearDocumentPage[];
	title?: string;
	textContent: string;
	warnings: string[];
}

export type Segment = RichText | ImageBlock;

export interface EmbeddedNote {
	markdown: string;
	/** Heading added on top of the sub-page, when the content has none. */
	title?: string;
}

export interface CalloutStyle {
	emoji: string;
	color: { r: number; g: number; b: number };
}
