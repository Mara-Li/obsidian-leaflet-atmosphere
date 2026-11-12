import { Marked, type TokenizerExtension, type Tokens } from "marked";

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

function splitWikilink(inner: string): { target: string; alias?: string } {
	// Dataview escapes the pipe of links written in tables
	const match = /\\?\|/.exec(inner);
	if (!match) return { target: inner.trim() };
	return {
		target: inner.slice(0, match.index).trim(),
		alias: inner.slice(match.index + match[0].length).trim(),
	};
}

const embed: TokenizerExtension = {
	name: "embed",
	level: "inline",
	start: (src) => src.indexOf("![["),
	tokenizer(src) {
		const match = /^!\[\[([^\]\n]+?)\]\]/.exec(src);
		if (!match) return undefined;
		return { type: "embed", raw: match[0], ...splitWikilink(match[1]!) };
	},
};

const wikilink: TokenizerExtension = {
	name: "wikilink",
	level: "inline",
	start: (src) => src.indexOf("[["),
	tokenizer(src) {
		const match = /^\[\[([^\]\n]+?)\]\]/.exec(src);
		if (!match) return undefined;
		return { type: "wikilink", raw: match[0], ...splitWikilink(match[1]!) };
	},
};

const highlight: TokenizerExtension = {
	name: "highlight",
	level: "inline",
	start: (src) => src.indexOf("=="),
	tokenizer(src) {
		const match = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
		if (!match) return undefined;
		return {
			type: "highlight",
			raw: match[0],
			tokens: this.lexer.inlineTokens(match[1]!),
		};
	},
};

const inlineMath: TokenizerExtension = {
	name: "inlineMath",
	level: "inline",
	start: (src) => src.indexOf("$"),
	tokenizer(src) {
		const match = /^\$(?!\s)((?:\\\$|[^$\n])+?)\$(?!\d)/.exec(src);
		if (!match || /\s$/.test(match[1]!)) return undefined;
		return { type: "inlineMath", raw: match[0], text: match[1]! };
	},
};

const blockMath: TokenizerExtension = {
	name: "blockMath",
	level: "block",
	start: (src) => src.match(/^ {0,3}\$\$/m)?.index,
	tokenizer(src) {
		const match = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
		if (!match) return undefined;
		return { type: "blockMath", raw: match[0], text: match[1]!.trim() };
	},
};

const footnoteRef: TokenizerExtension = {
	name: "footnoteRef",
	level: "inline",
	start: (src) => src.indexOf("[^"),
	tokenizer(src) {
		const match = /^\[\^([^\]\s]+)\]/.exec(src);
		if (!match) return undefined;
		return { type: "footnoteRef", raw: match[0], id: match[1]! };
	},
};

const inlineFootnote: TokenizerExtension = {
	name: "inlineFootnote",
	level: "inline",
	start: (src) => src.indexOf("^["),
	tokenizer(src) {
		const match = /^\^\[((?:[^[\]]|\[[^\]]*\])+)\]/.exec(src);
		if (!match) return undefined;
		return {
			type: "inlineFootnote",
			raw: match[0],
			tokens: this.lexer.inlineTokens(match[1]!),
		};
	},
};

const footnoteDef: TokenizerExtension = {
	name: "footnoteDef",
	level: "block",
	start: (src) => src.match(/^\[\^[^\]\s]+\]:/m)?.index,
	tokenizer(src) {
		const match =
			/^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?: {2,}|\t)[^\n]*)*)(?:\n+|$)/.exec(src);
		if (!match) return undefined;
		const text = match[2]!
			.split("\n")
			.map((line) => line.trim())
			.join("\n");
		return {
			type: "footnoteDef",
			raw: match[0],
			id: match[1]!,
			tokens: this.lexer.inlineTokens(text),
		};
	},
};

export function createLexer(breaks: boolean): Marked {
	return new Marked({
		gfm: true,
		breaks,
		extensions: [
			blockMath,
			footnoteDef,
			embed,
			wikilink,
			footnoteRef,
			inlineFootnote,
			highlight,
			inlineMath,
		],
	});
}
