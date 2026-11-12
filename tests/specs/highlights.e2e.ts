import { expect } from "@wdio/globals";
import { sliceBytes, validateDocument } from "../helpers/lexicons";
import { getRecords, publish, setup } from "../helpers/obsidian";
import type { HtmlBlock, TextBlock } from "../../src/leaflet/types";

describe("Highlights", function () {
	it("keep the color given by an emoji", async function () {
		await setup({ publishKey: "" });
		await publish("Highlights.md");
		const record = Object.values(await getRecords())[0]!;
		expect(validateDocument(record)).toBe("");

		const [text, table] = record.content.pages[0]!.blocks.map((b) => b.block) as [
			TextBlock,
			HtmlBlock,
		];
		expect(text.plaintext).toBe("rouge orange jaune vert bleu violet simple gras");
		const highlights = (text.facets ?? []).map((f) => {
			const feature = f.features.find(
				(x) => x.$type === "pub.leaflet.richtext.facet#highlight"
			) as { color?: { r: number; g: number; b: number } } | undefined;
			const color = feature?.color;
			return [
				sliceBytes(text.plaintext, f.index.byteStart, f.index.byteEnd),
				color ? `${color.r},${color.g},${color.b}` : "default",
			];
		});
		expect(highlights).toEqual([
			["rouge", "233,49,71"],
			["orange", "236,117,0"],
			["jaune", "224,172,0"],
			["vert", "8,185,78"],
			["bleu", "8,109,221"],
			["violet", "120,82,238"],
			["simple", "default"],
			["gras", "233,49,71"],
		]);
		expect(table.html).toContain('<mark style="background:rgba(8,185,78,0.35)">vert</mark>');
	});
});
