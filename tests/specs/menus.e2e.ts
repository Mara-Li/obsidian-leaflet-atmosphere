import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import {
	confirmModal,
	getRecords,
	publish,
	setup,
	waitFrontmatter,
	waitNotice,
} from "../helpers/obsidian";

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

/** Titles of the menu shown for a folder or a selection, and run the Leaflet entry if asked. */
async function selectionMenu(
	paths: string[],
	run = false
): Promise<string[]> {
	return browser.executeObsidian(
		({ app, obsidian }, { paths, run }) => {
			const items = paths.map((p) => app.vault.getAbstractFileByPath(p)!);
			const menu = new obsidian.Menu();
			if (items.length === 1) app.workspace.trigger("file-menu", menu, items[0], "file-explorer");
			else app.workspace.trigger("files-menu", menu, items, "file-explorer");
			const entries = (menu as unknown as {
				items: { titleEl?: HTMLElement; callback?: () => void }[];
			}).items;
			if (run) entries.find((i) => i.titleEl?.textContent?.includes("Leaflet"))?.callback?.();
			return entries.map((i) => i.titleEl?.textContent ?? "");
		},
		{ paths, run }
	);
}

describe("Folder and selection menus", function () {
	beforeEach(async function () {
		await setup();
	});

	it("publishes the publishable notes of a folder", async function () {
		const titles = await selectionMenu(["Series"]);
		expect(titles).toContain("Publish folder to Leaflet (2)");

		await selectionMenu(["Series"], true);
		await confirmModal();
		const notice = await waitNotice(/failed/, 30000);
		expect(notice).toContain("2 published, 0 updated, 0 failed");
		const titlesPublished = Object.values(await getRecords()).map((r) => r.title).sort();
		expect(titlesPublished).toEqual(["Part 1", "Part 2"]);
	});

	it("publishes a selection of notes", async function () {
		const titles = await selectionMenu(["Target.md", "Unmarked.md", "Blocked.md"]);
		expect(titles).toContain("Publish 2 notes to Leaflet");
	});

	it("hides the entry when nothing can be published", async function () {
		await setup({ requirePublishFlag: true });
		const titles = await selectionMenu(["Series"]);
		expect(titles.filter((t) => t.includes("Leaflet"))).toEqual([]);
	});
});
