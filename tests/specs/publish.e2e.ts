import { expect } from "@wdio/globals";
import {
	confirmModal,
	getFrontmatter,
	getRecords,
	getStore,
	PUBLICATION,
	publish,
	runCommand,
	setup,
	waitFrontmatter,
	waitNotice,
} from "../helpers/obsidian";
import { sliceBytes, validateDocument } from "../helpers/lexicons";
import type { LeafletBlock } from "../../src/types";

const COLLECTION = "site.standard.document";

function blocksOf(record: { content: { pages: { blocks: { block: LeafletBlock }[] }[] } }) {
	return record.content.pages[0]!.blocks.map((b) => b.block);
}

describe("Publishing a note", function () {
	beforeEach(async function () {
		await setup();
	});

	it("creates a valid document and saves its link", async function () {
		await publish("Rich.md");
		const records = await getRecords();
		const [key, record] = Object.entries(records)[0]!;
		const rkey = key.split("/")[1]!;

		expect(Object.keys(records)).toHaveLength(1);
		expect(key.startsWith(`${COLLECTION}/`)).toBe(true);
		expect(validateDocument(record)).toBe("");
		expect(record.site).toBe(PUBLICATION.uri);
		expect(record.path).toBe(`/${rkey}`);
		expect(record.title).toBe("Rich note");
		expect(record.description).toBe("A note with every kind of block.");
		expect(record.tags).toEqual(["test", "leaflet"]);
		expect(record.preferences?.showComments).toBe(true);
		expect(record.textContent).not.toContain("hidden");

		expect(await waitFrontmatter("Rich.md", "leaflet_url")).toBe(`${PUBLICATION.url}/${rkey}`);
		expect((await getFrontmatter("Rich.md")).leaflet_uri).toBe(
			`at://did:plc:leaflettest/${COLLECTION}/${rkey}`
		);
	});

	it("converts Obsidian Markdown to Leaflet blocks", async function () {
		await publish("Rich.md");
		const record = Object.values(await getRecords())[0]!;
		const blocks = blocksOf(record);
		const types = blocks.map((b) => b.$type.replace("pub.leaflet.blocks.", ""));

		const text = blocks[0]!;
		if (text.$type !== "pub.leaflet.blocks.text") throw new Error("expected a text block");
		expect(text.plaintext).toBe("Café gras é and italic with highlight and code.*");
		const features = (text.facets ?? []).map((f) => [
			sliceBytes(text.plaintext, f.index.byteStart, f.index.byteEnd),
			f.features.map((x) => x.$type.split("#")[1]).join(","),
		]);
		expect(features).toEqual([
			["gras é", "bold"],
			["italic", "italic"],
			["highlight", "highlight"],
			["code", "code"],
			["*", "footnote"],
		]);

		expect(types).toEqual([
			"text",
			"blockquote",
			"unorderedList",
			"html",
			"image",
			"code",
			"image",
			"header",
			"text",
		]);
		const quote = blocks[1] as { plaintext: string };
		expect(quote.plaintext).toBe("💡 Callout title\nCallout body");
		const list = blocks[2] as { children: { checked?: boolean }[] };
		expect(list.children.map((c) => c.checked)).toEqual([true, false]);
		expect((blocks[5] as { language: string }).language).toBe("dataview");
		expect(blocks[6]).toMatchObject({ alt: "A pixel", width: 200 });
		expect((blocks[8] as { plaintext: string }).plaintext).toBe("Embedded part text.");

		// The Mermaid diagram and the embedded image are uploaded
		const { blobs } = await getStore();
		expect(blobs).toHaveLength(2);
	});

	it("updates the same record when published again", async function () {
		await publish("Rich.md");
		const first = Object.entries(await getRecords());
		await waitFrontmatter("Rich.md", "leaflet_uri");
		const notice = await publish("Rich.md");
		expect(notice).toContain("Updated on Leaflet");

		const second = Object.entries(await getRecords());
		expect(second.map(([k]) => k)).toEqual(first.map(([k]) => k));
		expect(second[0]![1].publishedAt).toBe(first[0]![1].publishedAt);
		expect(second[0]![1].updatedAt).toBeDefined();
	});

	it("uses the slug property as record key", async function () {
		await publish("Slugged.md");
		expect(Object.keys(await getRecords())).toEqual([`${COLLECTION}/my-custom-slug`]);
		expect(await waitFrontmatter("Slugged.md", "leaflet_url")).toBe(
			`${PUBLICATION.url}/my-custom-slug`
		);
	});

	it("refuses a note with leaflet_publish: false", async function () {
		const notice = await publish("Blocked.md");
		expect(notice).toContain("leaflet_publish: false");
		expect(await getRecords()).toEqual({});
	});

	it("refuses an unmarked note when only marked notes can be published", async function () {
		await setup({ requirePublishFlag: true });
		const notice = await publish("Unmarked.md");
		expect(notice).toContain("not marked");
		expect(await getRecords()).toEqual({});
	});

	it("deletes the document and clears the note", async function () {
		await publish("Target.md");
		await waitFrontmatter("Target.md", "leaflet_uri");
		await runCommand("unpublish-note", "Target.md");
		await confirmModal();
		await waitNotice(/Deleted from Leaflet/);

		expect(await getRecords()).toEqual({});
		const fm = await getFrontmatter("Target.md");
		expect(fm.leaflet_uri).toBeUndefined();
		expect(fm.leaflet_publish).toBe(false);
	});
});
