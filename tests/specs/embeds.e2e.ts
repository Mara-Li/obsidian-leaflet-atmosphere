import { expect } from "@wdio/globals";
import { validateDocument } from "../helpers/lexicons";
import { browser } from "@wdio/globals";
import { getRecords, publish, setup } from "../helpers/obsidian";
import type { EmbedMode } from "../../src/interfaces";
import type { LeafletBlock, StandardDocument } from "../../src/leaflet/types";

async function publishEmbeds(mode: EmbedMode): Promise<StandardDocument> {
	await setup({ embedMode: mode, publishKey: "" });
	await publish("Embeds.md");
	const record = Object.values(await getRecords())[0]!;
	expect(validateDocument(record)).toBe("");
	return record;
}

function page(record: StandardDocument, id: string): LeafletBlock[] {
	return record.content.pages.find((p) => p.id === id)!.blocks.map((b) => b.block);
}

const summary = (blocks: LeafletBlock[]) =>
	blocks.map((b) => {
		const type = b.$type.split(".").pop();
		if ("plaintext" in b) return `${type}:${b.plaintext}`;
		if (b.$type === "pub.leaflet.blocks.page") return `page:${b.id}`;
		return type;
	});

describe("Embedded notes", function () {
	it("are inserted in the post by default", async function () {
		const record = await publishEmbeds("inline");
		expect(record.content.pages).toHaveLength(1);
		expect(summary(page(record, record.content.pages[0]!.id))).toContain(
			"text:A paragraph worth quoting."
		);
	});

	it("become sub-pages holding only the embedded part", async function () {
		const record = await publishEmbeds("page");
		const main = record.content.pages[0]!;
		expect(summary(main.blocks.map((b) => b.block))).toEqual([
			"text:Intro.",
			"page:embed-1",
			"page:embed-2",
			"page:embed-3",
			// A sub-page cannot live in a list: the embed stays inline there
			"unorderedList",
			"page:embed-4",
		]);
		// Whole note, with its own heading
		expect(summary(page(record, "embed-1"))).toEqual([
			"header:Snippet",
			"header:Part",
			"text:Embedded part text.",
		]);
		// Section
		expect(summary(page(record, "embed-2"))).toEqual(["header:Part", "text:Embedded part text."]);
		// Block
		expect(summary(page(record, "embed-3"))).toEqual(["text:A paragraph worth quoting."]);
		// Whole note with an alias as heading, footnotes kept unique
		const aliased = page(record, "embed-4");
		expect(summary(aliased).slice(0, 3)).toEqual([
			"header:Custom title",
			"text:A paragraph worth quoting.",
			"text:Another paragraph with a note.*",
		]);
		expect(JSON.stringify(aliased)).toContain('"footnoteId":"embed-4-fn-1"');
		expect(record.textContent).toContain("Another paragraph with a note.");
	});

	it("handle notes with Windows line endings", async function () {
		await setup({ embedMode: "page", publishKey: "" });
		await browser.executeObsidian(async ({ app }) => {
			for (const path of ["Embeds.md", "Snippet.md", "Source.md"]) {
				const file = app.vault.getFileByPath(path)!;
				const text = await app.vault.read(file);
				await app.vault.modify(file, text.replace(/\r?\n/g, "\r\n"));
			}
		});
		await browser.waitUntil(() =>
			browser.executeObsidian(({ app }) => {
				const file = app.vault.getFileByPath("Embeds.md")!;
				return (app.metadataCache.getFileCache(file)?.embeds?.length ?? 0) > 0;
			})
		);
		await publish("Embeds.md");
		const record = Object.values(await getRecords())[0]!;
		expect(validateDocument(record)).toBe("");
		expect(summary(record.content.pages[0]!.blocks.map((b) => b.block))).toEqual([
			"text:Intro.",
			"page:embed-1",
			"page:embed-2",
			"page:embed-3",
			"unorderedList",
			"page:embed-4",
		]);
		expect(summary(page(record, "embed-2"))).toEqual(["header:Part", "text:Embedded part text."]);
		expect(summary(page(record, "embed-3"))).toEqual(["text:A paragraph worth quoting."]);
	});
});
