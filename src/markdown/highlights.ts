import type { Tokens } from "marked";
import type { RgbaColor } from "../leaflet/types";

/** Colored highlights of Obsidian (==🔴text==), with Obsidian's default colors. */
const COLORS: [string, [number, number, number]][] = [
	["🔴", [233, 49, 71]],
	["🟠", [236, 117, 0]],
	["🟡", [224, 172, 0]],
	["🟢", [8, 185, 78]],
	["🔵", [8, 109, 221]],
	["🟣", [120, 82, 238]],
];

/** Color given by a leading emoji, and the tokens without it. */
export function splitHighlightColor(tokens: Tokens.Generic[]): {
	color?: RgbaColor;
	tokens: Tokens.Generic[];
} {
	const [first, ...rest] = tokens;
	const text = first?.type === "text" && typeof first.text === "string" ? first.text : "";
	const match = COLORS.find(([emoji]) => text.startsWith(emoji));
	if (!first || !match) return { tokens };
	const remaining = text.slice(match[0].length).replace(/^️/, "");
	const [r, g, b] = match[1];
	return {
		color: { $type: "pub.leaflet.theme.color#rgba", r, g, b, a: 35 },
		tokens: [{ ...first, raw: remaining, text: remaining }, ...rest],
	};
}

export function cssColor(color: RgbaColor): string {
	return `rgba(${color.r},${color.g},${color.b},${color.a / 100})`;
}
