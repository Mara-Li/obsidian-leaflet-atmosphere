import { expect } from "@wdio/globals";
import { sliceBytes, validateDocument } from "../helpers/lexicons";
import { getRecords, publish, setup } from "../helpers/obsidian";
import type { TextBlock } from "../../src/types";

async function publishMentions(mentions: boolean): Promise<TextBlock> {
	await setup({ publishKey: "", mentions });
	await publish("Mentions.md");
	const record = Object.values(await getRecords())[0]!;
	expect(validateDocument(record)).toBe("");
	return record.content.pages[0]!.blocks[0]!.block as TextBlock;
}

const featuresOf = (text: TextBlock) =>
	(text.facets ?? []).map((f) => [
		sliceBytes(text.plaintext, f.index.byteStart, f.index.byteEnd),
		f.features.map((x) => ("did" in x ? `mention:${x.did}` : x.$type.split("#")[1])).join(","),
	]);

describe("Mentions", function () {
	it("turn @handle into a mention of the account", async function () {
		const text = await publishMentions(true);
		expect(featuresOf(text)).toEqual([
			["@alice.bsky.social", "mention:did:plc:alicetest"],
			// Unknown handles, emails (linked like in Obsidian), links and code are no mentions
			["me@example.com", "link"],
			["@alice.bsky.social", "link"],
			["@alice.bsky.social", "code"],
		]);
		expect(text.plaintext).toContain("@nobody.example.com");
		expect(text.plaintext).toContain("me@example.com");
	});

	it("stay plain text when disabled", async function () {
		const text = await publishMentions(false);
		expect(featuresOf(text).map(([, f]) => f)).toEqual(["link", "link", "code"]);
	});
});
