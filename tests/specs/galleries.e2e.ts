import { expect } from "@wdio/globals";
import { validateDocument } from "../helpers/lexicons";
import { getRecords, publish, setup } from "../helpers/obsidian";
import type { CalloutMode } from "../../src/interfaces";
import type { LeafletBlock } from "../../src/leaflet/types";

async function publishGrids(calloutMode: CalloutMode): Promise<LeafletBlock[]> {
	await setup({ publishKey: "", calloutMode });
	await publish("Grids.md");
	const record = Object.values(await getRecords())[0]!;
	expect(validateDocument(record)).toBe("");
	return record.content.pages[0]!.blocks.map((b) => b.block);
}

const summary = (blocks: LeafletBlock[]): string[] =>
	blocks.map((b) => {
		if (b.$type === "pub.leaflet.blocks.imageGallery")
			return `gallery:${b.format}:${b.images.length}`;
		if ("plaintext" in b) return `${b.$type.split(".").pop()}:${b.plaintext}`;
		return b.$type.split(".").pop() ?? b.$type;
	});

describe("Grid callouts", function () {
	it("become image galleries when they hold images", async function () {
		const blocks = await publishGrids("quote");
		expect(summary(blocks)).toEqual([
			"gallery:grid:2",
			// The title and the text of the callout stay around the gallery
			"text:Holiday photos",
			"gallery:masonry:2",
			"text:A caption after the photos.",
			// A single image needs no gallery
			"image",
			// Without image, a grid callout keeps the default conversion
			"blockquote:📝 Grid\nNo image here, just text.",
		]);
		const first = blocks[0]!;
		if (first.$type !== "pub.leaflet.blocks.imageGallery") throw new Error("gallery expected");
		expect(first.images[1]).toMatchObject({
			$type: "pub.leaflet.blocks.imageGallery#image",
			alt: "Second",
			aspectRatio: { width: 300, height: 200 },
		});
	});

	it("without image follow the callout mode", async function () {
		const blocks = await publishGrids("html");
		expect(blocks.at(-1)!.$type).toBe("pub.leaflet.blocks.html");
		expect(summary(blocks).filter((s) => s.startsWith("gallery"))).toHaveLength(2);
	});
});
