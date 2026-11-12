import i18next from "i18next";
import { Notice, type TFile } from "obsidian";
import type LeafletAtmosphere from "../main";
import { getString } from "../publish/frontmatter";
import { Publisher } from "../publish/publisher";
import { ConfirmModal } from "../ui/confirmModal";
import { PublicationModal } from "../ui/publicationModal";

export function showError(error: unknown) {
	console.error("[Leaflet]", error);
	const message = error instanceof Error ? error.message : String(error);
	new Notice(i18next.t("error.prefix", { message }), 8000);
}

function linkNotice(text: string, url: string) {
	const fragment = createFragment((f) => {
		f.appendText(`${text} `);
		f.createEl("a", { text: url, href: url });
	});
	new Notice(fragment, 8000);
}

export async function publishFile(plugin: LeafletAtmosphere, file: TFile, site?: string) {
	const progress = new Notice(i18next.t("notice.publishing"), 0);
	try {
		const result = await new Publisher(plugin).publish(file, { site });
		progress.hide();
		linkNotice(
			i18next.t(result.created ? "notice.published" : "notice.updated"),
			result.url
		);
		if (result.warnings.length > 0)
			new Notice(
				i18next.t("notice.missingImages", { list: result.warnings.join(", ") }),
				8000
			);
		if (plugin.settings.copyLinkAfterPublish)
			await navigator.clipboard.writeText(result.url);
		if (plugin.settings.openAfterPublish) window.open(result.url);
	} catch (e) {
		progress.hide();
		showError(e);
	}
}

export function publishFileTo(plugin: LeafletAtmosphere, file: TFile) {
	new PublicationModal(plugin.app, plugin.settings.publications, (site) => {
		void publishFile(plugin, file, site);
	}).open();
}

export function unpublishFile(plugin: LeafletAtmosphere, file: TFile) {
	new ConfirmModal(
		plugin.app,
		i18next.t("modal.unpublishTitle"),
		i18next.t("modal.unpublishDesc", { title: file.basename }),
		() => {
			new Publisher(plugin)
				.unpublish(file)
				.then(
					(deleted) =>
						new Notice(i18next.t(deleted ? "notice.unpublished" : "notice.notPublished"))
				)
				.catch(showError);
		}
	).open();
}

export function publishedUrl(plugin: LeafletAtmosphere, file: TFile): string | undefined {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	return getString(fm, plugin.settings.urlKey);
}

export function isPublished(plugin: LeafletAtmosphere, file: TFile): boolean {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	return !!getString(fm, plugin.settings.uriKey);
}
