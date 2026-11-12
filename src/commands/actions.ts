import i18next from "i18next";
import { Notice, type TAbstractFile, TFile, TFolder } from "obsidian";
import { isExcalidraw } from "../markdown/compilers/excalidraw";
import type LeafletAtmosphere from "../main";
import { getBoolean, getString } from "../publish/frontmatter";
import { Publisher } from "../publish/publisher";
import { ConfirmModal } from "../ui/confirmModal";
import { PublishProgress } from "../ui/progress";
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
	const progress = new PublishProgress(plugin.statusBarEl);
	progress.update(i18next.t("notice.publishingNote", { name: file.basename }));
	try {
		const result = await new Publisher(plugin).publish(file, { site });
		progress.done();
		linkNotice(
			i18next.t(result.created ? "notice.published" : "notice.updated"),
			result.url
		);
		if (result.recovered) new Notice(i18next.t("notice.recovered"), 8000);
		if (result.warnings.length > 0)
			new Notice(
				i18next.t("notice.missingImages", { list: result.warnings.join(", ") }),
				8000
			);
		if (plugin.settings.copyLinkAfterPublish)
			await navigator.clipboard.writeText(result.url);
		if (plugin.settings.openAfterPublish) window.open(result.url);
	} catch (e) {
		progress.done();
		showError(e);
	}
}

export async function pullFile(plugin: LeafletAtmosphere, file: TFile) {
	try {
		const found = await new Publisher(plugin).pull(file);
		if (found) linkNotice(i18next.t("notice.pulled"), found.url);
		else new Notice(i18next.t("notice.pullNotFound"));
	} catch (e) {
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

/** The URI is only written by a real publication; a reserved note has just a URL. */
export function isPublished(plugin: LeafletAtmosphere, file: TFile): boolean {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	return !!getString(fm, plugin.settings.uriKey);
}

export function publishedUrl(plugin: LeafletAtmosphere, file: TFile): string | undefined {
	if (!isPublished(plugin, file)) return undefined;
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	return getString(fm, plugin.settings.urlKey);
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
	confirmBatch(
		plugin,
		i18next.t("modal.batchTitle"),
		i18next.t("modal.batchDesc", { count: files.length, key }),
		() => void runBatch(plugin, publisher, files)
	);
}

/** Whether a note may be published: not blocked, marked when required, not a drawing. */
export function canPublish(plugin: LeafletAtmosphere, file: TFile): boolean {
	if (file.extension !== "md" || isExcalidraw(plugin.app, file)) return false;
	const { publishKey, requirePublishFlag } = plugin.settings;
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	const flag = getBoolean(fm, publishKey);
	if (flag === false) return false;
	return !(publishKey && requirePublishFlag && flag !== true);
}

/** Publishable notes of a selection, folders included. */
export function publishableNotes(
	plugin: LeafletAtmosphere,
	items: TAbstractFile[]
): TFile[] {
	const notes = new Map<string, TFile>();
	const visit = (item: TAbstractFile) => {
		if (item instanceof TFolder) item.children.forEach(visit);
		else if (item instanceof TFile && canPublish(plugin, item))
			notes.set(item.path, item);
	};
	items.forEach(visit);
	return [...notes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function publishSelection(plugin: LeafletAtmosphere, items: TAbstractFile[]) {
	const files = publishableNotes(plugin, items);
	if (files.length === 0) {
		new Notice(i18next.t("notice.noSelection"));
		return;
	}
	const shown = files.slice(0, 5).map((f) => f.basename);
	if (files.length > shown.length)
		shown.push(i18next.t("modal.more", { count: files.length - shown.length }));
	confirmBatch(
		plugin,
		i18next.t("modal.selectionTitle", { count: files.length }),
		i18next.t("modal.selectionDesc", { list: shown.join(", ") }),
		() => void runBatch(plugin, new Publisher(plugin), files)
	);
}

/** Ask before publishing several notes, unless disabled in the settings. */
function confirmBatch(
	plugin: LeafletAtmosphere,
	title: string,
	message: string,
	run: () => void
) {
	if (!plugin.settings.confirmBatch) {
		run();
		return;
	}
	new ConfirmModal(
		plugin.app,
		title,
		message,
		run,
		i18next.t("modal.publish"),
		false
	).open();
}

async function runBatch(plugin: LeafletAtmosphere, publisher: Publisher, files: TFile[]) {
	const progress = new PublishProgress(plugin.statusBarEl);
	const created = new Set<string>();
	const failed: string[] = [];
	let updated = 0;
	for (const [i, file] of files.entries()) {
		progress.update(
			i18next.t("notice.batchProgress", {
				current: i + 1,
				total: files.length,
				name: file.basename,
			}),
			i,
			files.length
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

	progress.done();
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
