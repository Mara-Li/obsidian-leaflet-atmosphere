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

export function publishMarkedFiles(plugin: LeafletAtmosphere) {
	const key = plugin.settings.publishKey;
	const publisher = new Publisher(plugin);
	const files = key
		? plugin.app.vault.getMarkdownFiles().filter((f) => publisher.isMarked(f))
		: [];
	if (files.length === 0) {
		new Notice(i18next.t("notice.noMarked", { key }));
		return;
	}
	new ConfirmModal(
		plugin.app,
		i18next.t("modal.batchTitle"),
		i18next.t("modal.batchDesc", { count: files.length, key }),
		() => void runBatch(plugin, publisher, files),
		i18next.t("modal.publish"),
		false
	).open();
}

async function runBatch(plugin: LeafletAtmosphere, publisher: Publisher, files: TFile[]) {
	const progress = new Notice("", 0);
	const created = new Set<string>();
	const failed: string[] = [];
	let updated = 0;
	for (const [i, file] of files.entries()) {
		progress.setMessage(
			i18next.t("notice.batchProgress", {
				current: i + 1,
				total: files.length,
				name: file.basename,
			})
		);
		try {
			const result = await publisher.publish(file);
			if (result.created) created.add(file.path);
			else updated++;
		} catch (e) {
			console.error("[Leaflet]", file.path, e);
			failed.push(file.basename);
		}
	}

	// Notes linking to a note created in this run get its URL on a second pass
	if (plugin.settings.wikilinkMode === "published" && created.size > 0) {
		const links = plugin.app.metadataCache.resolvedLinks;
		for (const file of files) {
			if (failed.includes(file.basename) || !publisher.published.has(file.path)) continue;
			const targets = Object.keys(links[file.path] ?? {});
			if (!targets.some((t) => t !== file.path && created.has(t))) continue;
			await publisher
				.publish(file)
				.catch((e) => console.error("[Leaflet]", file.path, e));
		}
	}

	progress.hide();
	new Notice(
		i18next.t("notice.batchDone", {
			created: created.size,
			updated,
			failed: failed.length,
		}),
		8000
	);
	if (failed.length > 0)
		new Notice(i18next.t("notice.batchFailed", { list: failed.join(", ") }), 10000);
}
