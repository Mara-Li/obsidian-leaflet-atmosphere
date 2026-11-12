import i18next from "i18next";
import { Notice, TFile } from "obsidian";
import type LeafletAtmosphere from "../main";
import {
	isPublished,
	publishedUrl,
	publishFile,
	publishFileTo,
	publishMarkedFiles,
	unpublishFile,
} from "./actions";

function markdownFile(plugin: LeafletAtmosphere): TFile | null {
	const file = plugin.app.workspace.getActiveFile();
	return file?.extension === "md" ? file : null;
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
					.then(() => new Notice(t("notice.linkCopied")));
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
		id: "refresh-publications",
		name: t("commands.refreshPublications"),
		icon: "refresh-cw",
		callback: () => void plugin.refreshPublications(),
	});

	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			menu.addItem((item) =>
				item
					.setTitle(t("commands.fileMenu"))
					.setIcon("send")
					.onClick(() => void publishFile(plugin, file))
			);
		})
	);

	plugin.addRibbonIcon("send", t("commands.ribbon"), () => {
		const file = markdownFile(plugin);
		if (file) void publishFile(plugin, file);
	});
}
