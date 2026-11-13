import { expect } from "@wdio/globals";
import { validateDocument } from "../helpers/lexicons";
import { getRecords, publish, setup } from "../helpers/obsidian";
import type { TextBlock } from "../../src/types";

describe("Dates", function () {
	it("alone on their line look like the Leaflet date block", async function () {
		await setup({ publishKey: "" });
		await publish("Dates.md");
		const record = Object.values(await getRecords())[0]!;
		expect(validateDocument(record)).toBe("");

		const texts = record.content.pages[0]!.blocks.map((b) => (b.block as TextBlock).plaintext);
		expect(texts).toEqual([
			"📅 November 13, 2026",
			"📅 November 13, 2026 at 2:30 PM",
			// In a sentence, or not a real date: left as written
			"Meeting on @2026-11-13 in a sentence.",
			"@2026-02-30",
			"@2026-11-13 25:00",
		]);
	});
});
