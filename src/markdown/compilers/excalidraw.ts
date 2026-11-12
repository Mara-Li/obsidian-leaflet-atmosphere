/**
 * Excalidraw drawings exported as images with the Excalidraw Automate API.
 * Adapted from Enveloppe (Mara-Li).
 * @source https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/conversion/compiler/excalidraw.ts
 */
import type { App, TFile } from "obsidian";

interface ExcalidrawAutomate {
	getExportSettings(withBackground: boolean, withTheme: boolean): unknown;
	getEmbeddedFilesLoader(isDark?: boolean): unknown;
	createPNG?(
		path?: string,
		scale?: number,
		settings?: unknown,
		loader?: unknown
	): Promise<Blob>;
	createSVG(
		path?: string,
		embedFont?: boolean,
		settings?: unknown,
		loader?: unknown
	): Promise<SVGSVGElement>;
}

export function isExcalidraw(app: App, file: TFile): boolean {
	if (file.extension === "excalidraw" || file.path.endsWith(".excalidraw.md"))
		return true;
	if (file.extension !== "md") return false;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return fm?.["excalidraw-plugin"] !== undefined;
}

/** PNG (or SVG as fallback) of a drawing, null when Excalidraw is not installed. */
export async function exportExcalidraw(
	app: App,
	file: TFile
): Promise<{ data: ArrayBuffer; mime: string } | null> {
	const plugin = app.plugins.getPlugin("obsidian-excalidraw-plugin") as {
		ea?: ExcalidrawAutomate;
	} | null;
	const ea = plugin?.ea;
	if (!ea) return null;
	const settings = ea.getExportSettings(true, false);
	const loader = ea.getEmbeddedFilesLoader(false);
	if (typeof ea.createPNG === "function") {
		const png = await ea.createPNG(file.path, 2, settings, loader);
		if (png) return { data: await png.arrayBuffer(), mime: png.type || "image/png" };
	}
	const svg = await ea.createSVG(file.path, true, settings, loader);
	return {
		data: new TextEncoder().encode(svg.outerHTML).slice().buffer,
		mime: "image/svg+xml",
	};
}
