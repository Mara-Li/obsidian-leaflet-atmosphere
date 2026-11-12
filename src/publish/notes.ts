import type { App, TFile } from "obsidian";
import type { LeafletAtmosphereSettings } from "../interfaces";
import { getString } from "./frontmatter";

/** Notes of the vault linked to a post, by record URI. */
export function notesByUri(
	app: App,
	settings: LeafletAtmosphereSettings
): Map<string, TFile> {
	const out = new Map<string, TFile>();
	if (!settings.uriKey) return out;
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		const uri = getString(fm, settings.uriKey);
		if (uri) out.set(uri, file);
	}
	return out;
}
