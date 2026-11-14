import type { Facet, FacetFeature } from "../types";

const encoder = new TextEncoder();

export function utf8Length(text: string): number {
	return encoder.encode(text).length;
}

function sameFeatures(a: FacetFeature[], b: FacetFeature[]): boolean {
	return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

/** Plain text with facets indexed in UTF-8 bytes. */
export class RichText {
	text = "";
	facets: Facet[] = [];
	private bytes = 0;

	static from(text: string, facets: Facet[] = []): RichText {
		const out = new RichText();
		out.text = text;
		out.bytes = utf8Length(text);
		out.facets = facets.map((f) => ({
			index: { ...f.index },
			features: [...f.features],
		}));
		return out;
	}

	append(text: string, features: FacetFeature[] = []): this {
		if (!text) return this;
		const length = utf8Length(text);
		if (features.length > 0) {
			const last = this.facets[this.facets.length - 1];
			if (
				last &&
				last.index.byteEnd === this.bytes &&
				sameFeatures(last.features, features)
			)
				last.index.byteEnd += length;
			else
				this.facets.push({
					index: { byteStart: this.bytes, byteEnd: this.bytes + length },
					features: [...features],
				});
		}
		this.text += text;
		this.bytes += length;
		return this;
	}

	appendRich(other: RichText): this {
		for (const facet of other.facets)
			this.facets.push({
				index: {
					byteStart: facet.index.byteStart + this.bytes,
					byteEnd: facet.index.byteEnd + this.bytes,
				},
				features: facet.features,
			});
		this.text += other.text;
		this.bytes += utf8Length(other.text);
		return this;
	}

	get isBlank(): boolean {
		return this.text.trim().length === 0;
	}

	/** Remove leading and trailing whitespace while keeping facets aligned. */
	trim(): RichText {
		const leading = this.text.length - this.text.trimStart().length;
		const trimmed = this.text.trim();
		const startByte = utf8Length(this.text.slice(0, leading));
		const endByte = startByte + utf8Length(trimmed);
		const out = new RichText();
		out.text = trimmed;
		out.bytes = endByte - startByte;
		out.facets = this.facets
			.map((f) => ({
				index: {
					byteStart: Math.max(f.index.byteStart, startByte) - startByte,
					byteEnd: Math.min(f.index.byteEnd, endByte) - startByte,
				},
				features: f.features,
			}))
			.filter((f) => f.index.byteEnd > f.index.byteStart);
		return out;
	}

	toBlockFields(): { plaintext: string; facets?: Facet[] } {
		return this.facets.length > 0
			? { plaintext: this.text, facets: this.facets }
			: { plaintext: this.text };
	}
}
