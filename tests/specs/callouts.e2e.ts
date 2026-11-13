import { expect } from "@wdio/globals";
import { sliceBytes, validateDocument } from "../helpers/lexicons";
import { browser } from "@wdio/globals";
import { getRecords, PUBLICATION, publish, setup } from "../helpers/obsidian";
import type { BlockquoteBlock, CalloutMode, HtmlBlock, StandardDocument } from "../../src/types";

async function publishCallouts(
	mode: CalloutMode,
	theme: { bodyFont?: string; textColor?: string } = {},
	foldableCalloutsAsPages = false
): Promise<StandardDocument> {
	// Callouts.md is not marked: allow publishing it by hand
	await setup({
		calloutMode: mode,
		foldableCalloutsAsPages,
		publishKey: "",
		publications: [{ ...PUBLICATION, ...theme }],
	});
	await publish("Callouts.md");
	const record = Object.values(await getRecords())[0]!;
	expect(validateDocument(record)).toBe("");
	return record;
}

const blocksOf = (record: StandardDocument, page = 0) =>
	record.content.pages[page]!.blocks.map((b) => b.block);

describe("Callouts", function () {
	it("become quotes with an emoji and a colored title", async function () {
		const blocks = blocksOf(await publishCallouts("quote"));
		const quotes = blocks.filter(
			(b): b is BlockquoteBlock => b.$type === "pub.leaflet.blocks.blockquote"
		);
		expect(quotes.map((q) => q.plaintext)).toEqual([
			"💡 Bake with patience\nLet the dough rest for an hour.",
			"⚠️ Warning",
			"❓ Why sourdough?\nBecause it tastes better.",
		]);
		const highlight = quotes[0]!.facets!.find((f) =>
			f.features.some((x) => x.$type === "pub.leaflet.richtext.facet#highlight")
		)!;
		expect(
			sliceBytes(quotes[0]!.plaintext, highlight.index.byteStart, highlight.index.byteEnd)
		).toBe("Bake with patience");
		expect(highlight.features).toContainEqual({
			$type: "pub.leaflet.richtext.facet#highlight",
			color: { $type: "pub.leaflet.theme.color#rgba", r: 0, g: 191, b: 188, a: 25 },
		});
		// The list of the warning stays a list after its title
		expect(blocks.map((b) => b.$type.split(".").pop())).toEqual([
			"text",
			"blockquote",
			"blockquote",
			"unorderedList",
			"blockquote",
		]);
	});

	it("become sub-pages when foldable, whatever the mode", async function () {
		for (const mode of ["quote", "html"] as const) {
			const record = await publishCallouts(mode, {}, true);
			const blocks = blocksOf(record);
			// Only [!faq]- is foldable
			expect(blocks.filter((b) => b.$type === "pub.leaflet.blocks.page")).toEqual([
				{ $type: "pub.leaflet.blocks.page", id: "callout-1" },
			]);
			expect(blocks.at(-1)).toEqual({ $type: "pub.leaflet.blocks.page", id: "callout-1" });
			expect(blocksOf(record, 1)[0]).toMatchObject({
				$type: "pub.leaflet.blocks.header",
				plaintext: "❓ Why sourdough?",
			});
			const others = mode === "quote" ? "pub.leaflet.blocks.blockquote" : "pub.leaflet.blocks.html";
			expect(blocks.filter((b) => b.$type === others)).toHaveLength(2);
		}
	});

	it("become colored HTML boxes", async function () {
		const blocks = blocksOf(await publishCallouts("html"));
		const boxes = blocks.filter((b): b is HtmlBlock => b.$type === "pub.leaflet.blocks.html");
		expect(boxes).toHaveLength(3);
		expect(boxes[0]!.html).toContain("rgba(0,191,188,.1)");
		expect(boxes[0]!.html).toContain("💡 Bake with <strong>patience</strong>");
		expect(boxes[0]!.html).toContain('<a href="https://example.com" target="_blank">an hour</a>');
		expect(boxes[1]!.html).toContain("<ul><li>Hot oven</li><li>Sharp knife</li></ul>");
		for (const box of boxes) expect(box.height).toBeGreaterThan(60);
		// Default Leaflet font, served by leaflet.pub
		expect(boxes[0]!.html).toContain("url('https://leaflet.pub/fonts/iaw-quattro-vf.woff2')");
		expect(boxes[0]!.html).toContain("font-size:16px");
	});

	it("use the font and text color of the publication", async function () {
		const blocks = blocksOf(
			await publishCallouts("html", { bodyFont: "lora", textColor: "rgb(40,60,90)" })
		);
		const box = blocks.find((b): b is HtmlBlock => b.$type === "pub.leaflet.blocks.html")!;
		expect(box.html).toContain("https://fonts.googleapis.com/css2?family=Lora:");
		expect(box.html).toContain("font-family:'Lora',Georgia, serif;font-size:17px");
		expect(box.html).toContain("color:rgb(40,60,90)");
		expect(box.html).not.toContain("iaw-quattro");
	});

	it("stay readable on a dark publication", async function () {
		await setup({ calloutMode: "html", publishKey: "", publications: [PUBLICATION] });
		// The theme changed on Leaflet after the last refresh: it is read again on publish
		await browser.executeObsidian((_, uri) => {
			const store = (window as unknown as { leafletTest: { records: Record<string, unknown> } })
				.leafletTest;
			store.records[`site.standard.publication/${uri.split("/").pop()}`] = {
				$type: "site.standard.publication",
				name: "Test garden",
				url: "https://garden.example.com",
				theme: {
					$type: "pub.leaflet.publication#theme",
					backgroundColor: { $type: "pub.leaflet.theme.color#rgb", r: 28, g: 27, b: 28 },
				},
			};
		}, PUBLICATION.uri);
		await publish("Callouts.md");
		const record = Object.values(await getRecords()).find(
			(r) => r.$type === "site.standard.document"
		)!;
		const box = blocksOf(record).find(
			(b): b is HtmlBlock => b.$type === "pub.leaflet.blocks.html"
		)!;
		expect(box.html).toContain("color:#ececec");
		expect(box.html).toContain("a{color:#8ab4f8}");
	});

	it("reads the theme of the publications", async function () {
		await setup();
		const pub = await browser.executeObsidian(async ({ plugins }, uri) => {
			const store = (window as unknown as { leafletTest: { records: Record<string, unknown> } })
				.leafletTest;
			store.records[`site.standard.publication/${uri.split("/").pop()}`] = {
				$type: "site.standard.publication",
				name: "Test garden",
				url: "https://garden.example.com",
				theme: {
					$type: "pub.leaflet.publication#theme",
					bodyFont: "lora",
					headingFont: "montserrat",
					primary: { $type: "pub.leaflet.theme.color#rgb", r: 40, g: 60, b: 90 },
				},
			};
			await plugins.gazette.refreshPublications();
			return plugins.gazette.settings.publications[0];
		}, PUBLICATION.uri);
		expect(pub).toMatchObject({
			bodyFont: "lora",
			headingFont: "montserrat",
			textColor: "rgb(40,60,90)",
		});
	});

	it("become cards opening sub-pages", async function () {
		const record = await publishCallouts("page");
		const blocks = blocksOf(record);
		expect(blocks.filter((b) => b.$type === "pub.leaflet.blocks.page")).toEqual([
			{ $type: "pub.leaflet.blocks.page", id: "callout-1" },
			{ $type: "pub.leaflet.blocks.page", id: "callout-2" },
			{ $type: "pub.leaflet.blocks.page", id: "callout-3" },
		]);
		expect(record.content.pages.map((p) => p.id).slice(1)).toEqual([
			"callout-1",
			"callout-2",
			"callout-3",
		]);
		const first = blocksOf(record, 1);
		expect(first[0]).toMatchObject({
			$type: "pub.leaflet.blocks.header",
			plaintext: "💡 Bake with patience",
		});
		expect(blocksOf(record, 2)[1]!.$type).toBe("pub.leaflet.blocks.unorderedList");
		expect(record.textContent).toContain("Because it tastes better.");
	});
});
