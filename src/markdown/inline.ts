import type { Tokens } from "marked";
import { RichText } from "../leaflet/richtext";
import type { FacetFeature, ImageBlock, Segment } from "../types";

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	ndash: "–",
	mdash: "—",
	hellip: "…",
	laquo: "«",
	raquo: "»",
	copy: "©",
	reg: "®",
	trade: "™",
};

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
		if (code[0] === "#") {
			const value =
				code[1] === "x" || code[1] === "X"
					? Number.parseInt(code.slice(2), 16)
					: Number.parseInt(code.slice(1), 10);
			return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
		}
		return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
	});
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function withFeature(
	features: FacetFeature[],
	feature: FacetFeature
): FacetFeature[] {
	if (features.some((f) => JSON.stringify(f) === JSON.stringify(feature)))
		return features;
	return [...features, feature];
}

/** Accumulates rich text, splitting it whenever an image block is met. */
export class InlineCollector {
	segments: Segment[] = [];
	current = new RichText();
	htmlFeatures: FacetFeature[] = [];

	append(text: string, features: FacetFeature[]) {
		const all = this.htmlFeatures.reduce(withFeature, features);
		this.current.append(text, all);
	}

	pushImage(image: ImageBlock) {
		this.flush();
		this.segments.push(image);
	}

	flush() {
		if (!this.current.isBlank) this.segments.push(this.current.trim());
		this.current = new RichText();
	}

	finish(): Segment[] {
		this.flush();
		return this.segments;
	}

	/** Every text segment merged, images dropped. */
	text(): RichText {
		const out = new RichText();
		for (const seg of this.finish()) {
			if (!(seg instanceof RichText)) continue;
			if (out.text) out.append("\n");
			out.appendRich(seg);
		}
		return out;
	}
}

const HTML_FEATURES: Record<string, FacetFeature> = {
	u: { $type: "pub.leaflet.richtext.facet#underline" },
	ins: { $type: "pub.leaflet.richtext.facet#underline" },
	b: { $type: "pub.leaflet.richtext.facet#bold" },
	strong: { $type: "pub.leaflet.richtext.facet#bold" },
	i: { $type: "pub.leaflet.richtext.facet#italic" },
	em: { $type: "pub.leaflet.richtext.facet#italic" },
	s: { $type: "pub.leaflet.richtext.facet#strikethrough" },
	del: { $type: "pub.leaflet.richtext.facet#strikethrough" },
	strike: { $type: "pub.leaflet.richtext.facet#strikethrough" },
	mark: { $type: "pub.leaflet.richtext.facet#highlight" },
	code: { $type: "pub.leaflet.richtext.facet#code" },
	kbd: { $type: "pub.leaflet.richtext.facet#code" },
};

export function getAttribute(html: string, name: string): string | undefined {
	const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(
		html
	);
	return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? "") : undefined;
}

/** Handle an inline HTML tag; returns an image source when the tag is an `<img>`. */
export function applyInlineHtml(col: InlineCollector, tag: Tokens.HTML | Tokens.Tag) {
	const match = /^<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>$/i.exec(tag.raw.trim());
	if (!match) return undefined;
	const [, closing, rawName] = match;
	const name = rawName!.toLowerCase();
	if (name === "br") {
		col.append("\n", []);
		return undefined;
	}
	if (name === "img") return getAttribute(tag.raw, "src");
	let feature: FacetFeature | undefined = HTML_FEATURES[name];
	if (name === "a") {
		const href = getAttribute(tag.raw, "href");
		feature = closing
			? [...col.htmlFeatures]
					.reverse()
					.find((f) => f.$type === "pub.leaflet.richtext.facet#link")
			: href
				? { $type: "pub.leaflet.richtext.facet#link", uri: href }
				: undefined;
	}
	if (!feature) return undefined;
	if (closing) {
		const key = JSON.stringify(feature);
		const index = col.htmlFeatures.map((f) => JSON.stringify(f)).lastIndexOf(key);
		if (index !== -1) col.htmlFeatures.splice(index, 1);
	} else col.htmlFeatures.push(feature);
	return undefined;
}
