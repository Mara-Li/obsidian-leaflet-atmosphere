import { expect } from "@wdio/globals";
import { validateDocument } from "../helpers/lexicons";
import { getRecords, publish, setup, waitNotice } from "../helpers/obsidian";

const POST = "at://did:plc:alicetest/app.bsky.feed.post/3mzy3t22ggc2b";

describe("Bluesky posts", function () {
	it("become embeds whatever the form of the link", async function () {
		await setup({ publishKey: "" });
		await publish("Bluesky.md");
		const record = Object.values(await getRecords())[0]!;
		expect(validateDocument(record)).toBe("");

		const blocks = record.content.pages[0]!.blocks.map((b) => b.block);
		const summary = blocks.map((b) => {
			if (b.$type === "pub.leaflet.blocks.bskyPost") return `post:${b.postRef.uri}`;
			if (b.$type === "pub.leaflet.blocks.website") return `card:${b.src}`;
			if (b.$type === "pub.leaflet.blocks.text") return `text:${b.plaintext}`;
			return b.$type;
		});
		expect(summary).toEqual([
			// bare URL, link with a label, query string, other client, at:// URI, Bluesky embed code
			...Array(6).fill(`post:${POST}`),
			// A post that cannot be found falls back to a card, with a warning
			"card:https://bsky.app/profile/alice.bsky.social/post/3notfound2222",
			// A labelled website link stays a link
			"text:A website",
		]);
		await waitNotice(/could not be converted: .*3notfound2222/);
	});
});
