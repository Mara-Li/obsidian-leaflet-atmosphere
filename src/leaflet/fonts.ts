/**
 * Fonts of Leaflet themes, mirrored from Leaflet (src/fonts.ts) so that HTML blocks
 * use the same font and size as the rest of the post.
 */

interface FontConfig {
	family: string;
	size: number;
	fallback: string;
	/** Google Fonts family parameter, or null for the font served by leaflet.pub. */
	google: string | null;
}

const SANS = "system-ui, sans-serif";

const FONTS: Record<string, FontConfig> = {
	quattro: { family: "iA Writer Quattro V", size: 16, fallback: SANS, google: null },
	lora: {
		family: "Lora",
		size: 17,
		fallback: "Georgia, serif",
		google: "Lora:ital,wght@0,400..700;1,400..700",
	},
	"atkinson-hyperlegible": {
		family: "Atkinson Hyperlegible Next",
		size: 18,
		fallback: SANS,
		google: "Atkinson+Hyperlegible+Next:ital,wght@0,200..800;1,200..800",
	},
	"sometype-mono": {
		family: "Sometype Mono",
		size: 17,
		fallback: "monospace",
		google: "Sometype+Mono:ital,wght@0,400;0,700;1,400;1,700",
	},
	montserrat: {
		family: "Montserrat",
		size: 17,
		fallback: SANS,
		google: "Montserrat:ital,wght@0,400;0,700;1,400;1,700",
	},
	"source-sans": {
		family: "Source Sans 3",
		size: 18,
		fallback: SANS,
		google: "Source+Sans+3:ital,wght@0,400;0,700;1,400;1,700",
	},
};

const DEFAULT_FONT = "quattro";
const QUATTRO_URL = "https://leaflet.pub/fonts/iaw-quattro-vf";

function fontConfig(id: string | undefined): FontConfig {
	// Custom fonts: "custom:Font Name:Google+Family:spec"
	const custom = id?.startsWith("custom:") ? /^custom:([^:]+):(.+)$/.exec(id) : null;
	if (custom) return { family: custom[1]!, size: 16, fallback: SANS, google: custom[2]! };
	return FONTS[id ?? DEFAULT_FONT] ?? FONTS[DEFAULT_FONT]!;
}

export interface PostTheme {
	bodyFont?: string;
	headingFont?: string;
	/** Colors of the publication, as CSS. */
	textColor?: string;
	backgroundColor?: string;
	accentColor?: string;
}

/** Whether a CSS rgb()/rgba() color is dark. */
function isDark(color: string | undefined): boolean {
	const [r, g, b] = (color?.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
	if (r === undefined || g === undefined || b === undefined) return false;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** Text color of the publication, or one readable on its background. */
export function textColorOf(theme: PostTheme): string {
	return theme.textColor ?? (isDark(theme.backgroundColor) ? "#ececec" : "#272727");
}

function fontImports(fonts: FontConfig[]): string {
	return fonts
		.map((font) =>
			font.google
				? `@import url('https://fonts.googleapis.com/css2?family=${font.google}&display=swap');`
				: ""
		)
		.join("");
}

function fontFaces(fonts: FontConfig[]): string {
	if (!fonts.some((f) => f.google === null)) return "";
	return (
		`@font-face{font-family:'${FONTS.quattro!.family}';src:url('${QUATTRO_URL}.woff2') format('woff2');font-weight:100 900;font-style:normal}` +
		`@font-face{font-family:'${FONTS.quattro!.family}';src:url('${QUATTRO_URL}-Italic.woff2') format('woff2');font-weight:100 900;font-style:italic}`
	);
}

/** CSS giving an HTML block the fonts, size and text color of the post, with its metrics. */
export function themeCss(theme: PostTheme = {}): {
	css: string;
	fontSize: number;
	lineHeight: number;
} {
	const body = fontConfig(theme.bodyFont);
	const heading = fontConfig(theme.headingFont ?? theme.bodyFont);
	const unique = [...new Map([body, heading].map((f) => [f.family, f])).values()];
	const lineHeight = Math.round(body.size * 1.5);
	const css =
		fontImports(unique) +
		fontFaces(unique) +
		`body{margin:0;font-family:'${body.family}',${body.fallback};font-size:${body.size}px;` +
		`line-height:${lineHeight}px;color:${textColorOf(theme)}}` +
		`a{color:${theme.accentColor ?? (isDark(theme.backgroundColor) ? "#8ab4f8" : "#1d5fb4")}}` +
		`.heading{font-family:'${heading.family}',${heading.fallback}}` +
		"code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.875em}";
	return { css, fontSize: body.size, lineHeight };
}
