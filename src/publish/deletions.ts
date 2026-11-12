import i18next from "i18next";
import { debounce, Notice, TFile } from "obsidian";
import type LeafletAtmosphere from "../main";
import { ConfirmModal } from "../ui/confirmModal";
import { getString } from "./frontmatter";
import { Publisher } from "./publisher";

interface DeletedPost {
	name: string;
	uri: string;
}

/**
 * Watch the notes linked to a post: when one is deleted from the vault, its post is
 * deleted, kept, or the user is asked, depending on the settings.
 */
export class DeletionWatcher {
	/** Record URI of every published note, by path: a deleted note has no metadata left. */
	private links = new Map<string, string>();
	private pending: DeletedPost[] = [];
	private flush = debounce(() => void this.handle(), 800, true);

	constructor(private plugin: LeafletAtmosphere) {}

	register() {
		const { app } = this.plugin;
		app.workspace.onLayoutReady(() => {
			for (const file of app.vault.getMarkdownFiles()) this.index(file);
			this.plugin.registerEvent(
				app.metadataCache.on("changed", (file) => this.index(file))
			);
			this.plugin.registerEvent(
				app.vault.on("rename", (file, oldPath) => {
					const uri = this.links.get(oldPath);
					this.links.delete(oldPath);
					if (uri && file instanceof TFile) this.links.set(file.path, uri);
				})
			);
			this.plugin.registerEvent(
				app.vault.on("delete", (file) => {
					const uri = this.links.get(file.path);
					if (!uri) return;
					this.links.delete(file.path);
					if (this.plugin.settings.onNoteDeleted === "keep") return;
					this.pending.push({ name: file.name.replace(/\.md$/, ""), uri });
					this.flush();
				})
			);
		});
	}

	private index(file: TFile) {
		const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const uri = getString(fm, this.plugin.settings.uriKey);
		if (uri) this.links.set(file.path, uri);
		else this.links.delete(file.path);
	}

	private async handle(): Promise<void> {
		const posts = this.pending.splice(0);
		if (posts.length === 0) return;
		if (this.plugin.settings.onNoteDeleted === "delete") {
			await deletePosts(this.plugin, posts);
			return;
		}
		new ConfirmModal(
			this.plugin.app,
			i18next.t("deletion.title"),
			i18next.t("deletion.desc", { list: posts.map((p) => p.name).join(", ") }),
			() => void deletePosts(this.plugin, posts)
		).open();
	}
}

/** Delete posts, through their notes when they still exist. */
export async function deletePosts(
	plugin: LeafletAtmosphere,
	posts: { name: string; uri: string; file?: TFile | null }[]
): Promise<number> {
	const publisher = new Publisher(plugin);
	const failed: string[] = [];
	for (const post of posts) {
		try {
			await publisher.deletePost(post.uri, post.file);
		} catch (e) {
			console.error("[Leaflet] delete", post.uri, e);
			failed.push(post.name);
		}
	}
	const deleted = posts.length - failed.length;
	if (deleted > 0) new Notice(i18next.t("manager.deleted", { count: deleted }));
	if (failed.length > 0)
		new Notice(i18next.t("manager.failed", { list: failed.join(", ") }), 10000);
	return deleted;
}
