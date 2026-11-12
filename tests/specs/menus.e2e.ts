import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { publish, setup, waitFrontmatter } from "../helpers/obsidian";

/** Titles of the editor context menu of a note. */
async function editorMenu(file: string): Promise<string[]> {
	await obsidianPage.openFile(file);
	return browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) return [];
		const menu = new obsidian.Menu();
		app.workspace.trigger("editor-menu", menu, view.editor, view);
		const items = (menu as unknown as { items: { titleEl?: HTMLElement }[] }).items;
		return items.map((i) => i.titleEl?.textContent ?? "");
	});
}

describe("Editor menu", function () {
	beforeEach(async function () {
		await setup();
	});

	it("offers to publish a note", async function () {
		expect(await editorMenu("Target.md")).toContain("Publish to Leaflet");
	});

	it("offers to update a published note", async function () {
		await publish("Target.md");
		await waitFrontmatter("Target.md", "leaflet_uri");
		const items = await editorMenu("Target.md");
		expect(items).toContain("Update on Leaflet");
		expect(items).not.toContain("Publish to Leaflet");
	});

	it("hides the entry for a note with leaflet_publish: false", async function () {
		const items = await editorMenu("Blocked.md");
		expect(items.filter((i) => i.includes("Leaflet"))).toEqual([]);
	});
});
