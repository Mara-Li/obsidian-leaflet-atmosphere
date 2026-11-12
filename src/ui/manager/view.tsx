import i18next from "i18next";
import { ItemView, type WorkspaceLeaf } from "obsidian";
import { render } from "preact";
import type LeafletAtmosphere from "../../main";
import { PostsManager } from "./PostsManager";

export const MANAGER_VIEW = "leaflet-atmosphere-posts";

export class PostsManagerView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LeafletAtmosphere
	) {
		super(leaf);
	}

	getViewType(): string {
		return MANAGER_VIEW;
	}

	getDisplayText(): string {
		return i18next.t("manager.title");
	}

	getIcon(): string {
		return "send";
	}

	async onOpen() {
		render(<PostsManager plugin={this.plugin} />, this.contentEl);
	}

	async onClose() {
		render(null, this.contentEl);
	}
}

/** Show the manager, reusing an open one. */
export async function openPostsManager(plugin: LeafletAtmosphere): Promise<void> {
	const { workspace } = plugin.app;
	const existing = workspace.getLeavesOfType(MANAGER_VIEW)[0];
	if (existing) {
		await workspace.revealLeaf(existing);
		return;
	}
	const leaf = workspace.getLeaf("tab");
	await leaf.setViewState({ type: MANAGER_VIEW, active: true });
	await workspace.revealLeaf(leaf);
}
