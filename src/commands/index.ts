import i18next from "i18next";
import { type Menu, type TAbstractFile, TFile, TFolder } from "obsidian";
import type LeafletAtmosphere from "../main";
import { openPostsManager } from "../ui/manager/view";
import { richNotice } from "../ui/notices";
import {
	canPublish,
	isPublished,
	publishedUrl,
	publishFile,
	publishFileTo,
	publishableNotes,
	publishMarkedFiles,
	publishSelection,
	pullFile,
	unpublishFile,
} from "./actions";

function markdownFile(plugin: LeafletAtmosphere): TFile | null {
	const file = plugin.app.workspace.getActiveFile();
	return file?.extension === "md" ? file : null;
}

/** "Publish" entry of the file and editor menus, hidden for notes that cannot be published. */
function addPublishItem(
	plugin: LeafletAtmosphere,
	menu: Menu,
	file: TAbstractFile | null
) {
	if (file instanceof TFolder)
		return addSelectionItem(plugin, menu, [file], "commands.folderMenu");
	if (!(file instanceof TFile) || !canPublish(plugin, file)) return;
	const published = isPublished(plugin, file);
	menu.addItem((item) =>
		item
			.setTitle(i18next.t(published ? "commands.updateMenu" : "commands.fileMenu"))
			.setIcon("send")
			.setSection("action")
			.onClick(() => void publishFile(plugin, file))
	);
}

function addSelectionItem(
	plugin: LeafletAtmosphere,
	menu: Menu,
	items: TAbstractFile[],
	title: "commands.folderMenu" | "commands.filesMenu"
) {
	const count = publishableNotes(plugin, items).length;
	if (count === 0) return;
	menu.addItem((item) =>
		item
			.setTitle(i18next.t(title, { count }))
			.setIcon("send")
			.setSection("action")
			.onClick(() => publishSelection(plugin, items))
	);
}

export function registerCommands(plugin: LeafletAtmosphere) {
	const t = i18next.t;

	plugin.addCommand({
		id: "publish-note",
		name: t("commands.publish"),
		icon: "send",
		checkCallback: (checking) => {
			const file = markdownFile(plugin);
			if (!file) return false;
			if (!checking) void publishFile(plugin, file);
			return true;
		},
	});

	plugin.addCommand({
		id: "publish-note-to",
		name: t("commands.publishTo"),
		icon: "send",
		checkCallback: (checking) => {
			const file = markdownFile(plugin);
			if (!file) return false;
			if (!checking) publishFileTo(plugin, file);
			return true;
		},
	});

	plugin.addCommand({
		id: "publish-marked-notes",
		name: t("commands.publishMarked"),
		icon: "send",
		callback: () => publishMarkedFiles(plugin),
	});

	plugin.addCommand({
		id: "pull-note",
		name: t("commands.pull"),
		icon: "download",
		checkCallback: (checking) => {
			const file = markdownFile(plugin);
			if (!file) return false;
			if (!checking) void pullFile(plugin, file);
			return true;
		},
	});

	plugin.addCommand({
		id: "unpublish-note",
		name: t("commands.unpublish"),
		icon: "trash",
		checkCallback: (checking) => {
			const file = markdownFile(plugin);
			if (!file || !isPublished(plugin, file)) return false;
			if (!checking) unpublishFile(plugin, file);
			return true;
		},
	});

	plugin.addCommand({
		id: "copy-link",
		name: t("commands.copyLink"),
		icon: "link",
		checkCallback: (checking) => {
			const file = markdownFile(plugin);
			const url = file ? publishedUrl(plugin, file) : undefined;
			if (!url) return false;
			if (!checking)
				void navigator.clipboard
					.writeText(url)
					.then(() => richNotice({ tone: "success", heading: t("notice.linkCopied") }));
			return true;
		},
	});

	plugin.addCommand({
		id: "open-in-browser",
		name: t("commands.open"),
		icon: "globe",
		checkCallback: (checking) => {
			const file = markdownFile(plugin);
			const url = file ? publishedUrl(plugin, file) : undefined;
			if (!url) return false;
			if (!checking) window.open(url);
			return true;
		},
	});

	plugin.addCommand({
		id: "manage-posts",
		name: t("commands.manage"),
		icon: "newspaper",
		callback: () => void openPostsManager(plugin),
	});

	plugin.addCommand({
		id: "refresh-publications",
		name: t("commands.refreshPublications"),
		icon: "refresh-cw",
		callback: () => void plugin.refreshPublications(),
	});

	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) =>
			addPublishItem(plugin, menu, file)
		)
	);
	plugin.registerEvent(
		plugin.app.workspace.on("files-menu", (menu, files) =>
			addSelectionItem(plugin, menu, files, "commands.filesMenu")
		)
	);
	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu, _editor, info) =>
			addPublishItem(plugin, menu, info.file)
		)
	);

	plugin.addRibbonIcon("newspaper", t("commands.manage"), () => {
		void openPostsManager(plugin);
	});

	plugin.addRibbonIcon("send", t("commands.ribbon"), () => {
		const file = markdownFile(plugin);
		if (file) void publishFile(plugin, file);
	});
}
