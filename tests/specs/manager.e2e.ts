import { browser, expect } from "@wdio/globals";
import {
	confirmModal,
	getFrontmatter,
	getRecords,
	PUBLICATION,
	publish,
	runCommand,
	setup,
	waitFrontmatter,
} from "../helpers/obsidian";

const COLLECTION = "site.standard.document";

/** Add a post that no note of the vault links to. */
async function addOrphanPost(): Promise<void> {
	await browser.executeObsidian((_, site) => {
		const store = (window as unknown as { leafletTest: { records: Record<string, unknown> } })
			.leafletTest;
		store.records["site.standard.document/3orphan"] = {
			$type: "site.standard.document",
			site,
			path: "/3orphan",
			title: "Orphan post",
			publishedAt: "2026-01-01T00:00:00.000Z",
			content: { $type: "pub.leaflet.content", pages: [] },
		};
	}, PUBLICATION.uri);
}

async function rows(): Promise<{ title: string; meta: string }[]> {
	return browser.executeObsidian(() =>
		Array.from(activeDocument.querySelectorAll(".leaflet-atmosphere-manager-row")).map((row) => ({
			title: row.querySelector(".leaflet-atmosphere-manager-title")?.textContent ?? "",
			meta: row.querySelector(".leaflet-atmosphere-manager-meta")?.textContent ?? "",
		}))
	);
}

async function waitRows(count: number): Promise<void> {
	await browser.waitUntil(async () => (await rows()).length === count, {
		timeout: 10000,
		timeoutMsg: `Expected ${count} rows`,
	});
}

async function closeManager(): Promise<void> {
	await browser.executeObsidian(({ app }) => {
		app.workspace.detachLeavesOfType("leaflet-atmosphere-posts");
	});
}

describe("Posts manager", function () {
	beforeEach(async function () {
		await setup();
		await closeManager();
	});

	it("lists the posts with their notes", async function () {
		await publish("Target.md");
		await waitFrontmatter("Target.md", "leaflet_uri");
		await addOrphanPost();
		await runCommand("manage-posts");
		await waitRows(2);

		const list = await rows();
		const orphan = list.find((r) => r.title === "Orphan post")!;
		const target = list.find((r) => r.title === "Target")!;
		expect(orphan.meta).toContain("No note in the vault");
		expect(orphan.meta).toContain("Test garden");
		expect(target.meta).toContain("Target.md");
	});

	it("deletes a post without note", async function () {
		await addOrphanPost();
		await runCommand("manage-posts");
		await waitRows(1);
		await browser.$(".leaflet-atmosphere-manager-row button[aria-label='Delete']").click();
		await confirmModal();
		await waitRows(0);
		expect(await getRecords()).toEqual({});
	});

	it("deletes the selected posts and unlinks their notes", async function () {
		await publish("Target.md");
		await waitFrontmatter("Target.md", "leaflet_uri");
		await runCommand("manage-posts");
		await waitRows(1);
		await browser.$(".leaflet-atmosphere-manager-row input[type='checkbox']").click();
		await browser.$("button=Delete (1)").click();
		await confirmModal();
		await waitRows(0);
		expect(await getRecords()).toEqual({});
		await browser.waitUntil(
			async () => (await getFrontmatter("Target.md")).leaflet_uri === undefined
		);
	});
});

describe("Deleted notes", function () {
	async function deleteNote(path: string): Promise<void> {
		await browser.executeObsidian(async ({ app }, file) => {
			await app.vault.delete(app.vault.getFileByPath(file)!);
		}, path);
	}

	async function publishTarget(mode: "ask" | "delete" | "keep"): Promise<void> {
		await setup({ onNoteDeleted: mode });
		await publish("Target.md");
		await waitFrontmatter("Target.md", "leaflet_uri");
		expect(Object.keys(await getRecords())).toHaveLength(1);
	}

	it("delete their post when set to", async function () {
		await publishTarget("delete");
		await deleteNote("Target.md");
		await browser.waitUntil(async () => Object.keys(await getRecords()).length === 0, {
			timeout: 10000,
		});
	});

	it("ask before deleting their post", async function () {
		await publishTarget("ask");
		await deleteNote("Target.md");
		await confirmModal();
		await browser.waitUntil(async () => Object.keys(await getRecords()).length === 0, {
			timeout: 10000,
		});
	});

	it("keep their post when set to", async function () {
		await publishTarget("keep");
		await deleteNote("Target.md");
		await browser.pause(2000);
		expect(Object.keys(await getRecords())).toEqual([
			expect.stringContaining(`${COLLECTION}/`) as unknown as string,
		]);
	});
});
