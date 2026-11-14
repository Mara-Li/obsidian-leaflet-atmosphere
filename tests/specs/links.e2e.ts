import { expect } from "@wdio/globals";
import { sliceBytes } from "../helpers/lexicons";
import {
	commandAvailable,
	getFrontmatter,
	getRecords,
	PUBLICATION,
	publish,
	setup,
	waitFrontmatter,
} from "../helpers/obsidian";
import type { TextBlock } from "../../src/types";

describe("Links between notes", function () {
	beforeEach(async function () {
		await setup();
	});

	it("reserves the future address of a marked note", async function () {
		await publish("Linker.md");
		const records = await getRecords();
		expect(Object.keys(records)).toHaveLength(1);

		const reserved = await waitFrontmatter("Target.md", "leaflet_url");
		const linkerUrl = await waitFrontmatter("Linker.md", "leaflet_url");
		expect(String(reserved).startsWith(`${PUBLICATION.url}/`)).toBe(true);

		const text = Object.values(records)[0]!.content.pages[0]!.blocks[0]!.block as TextBlock;
		const links = (text.facets ?? []).map((f) => [
			sliceBytes(text.plaintext, f.index.byteStart, f.index.byteEnd),
			(f.features[0] as { uri?: string }).uri,
		]);
		expect(text.plaintext).toBe("Read the target, Unmarked and myself.");
		expect(links).toEqual([
			["the target", reserved],
			["myself", linkerUrl],
		]);
		expect((await getFrontmatter("Unmarked.md")).leaflet_url).toBeUndefined();
	});

	it("publishes the linked note at its reserved address", async function () {
		await publish("Linker.md");
		const reservedUrl = await waitFrontmatter("Target.md", "leaflet_url");

		// Only reserved: a URL but no URI, so no link to copy and nothing to delete
		expect((await getFrontmatter("Target.md")).leaflet_uri).toBeUndefined();
		for (const command of ["copy-link", "open-in-browser", "unpublish-note"])
			expect(await commandAvailable(command, "Target.md")).toBe(false);

		const notice = await publish("Target.md");
		expect(notice).toContain("Published to Leaflet");
		await waitFrontmatter("Target.md", "leaflet_uri");
		for (const command of ["copy-link", "open-in-browser", "unpublish-note"])
			expect(await commandAvailable(command, "Target.md")).toBe(true);
		const rkey = String(reservedUrl).split("/").pop();
		expect(Object.keys(await getRecords())).toContain(`site.standard.document/${rkey}`);
		expect((await getFrontmatter("Target.md")).leaflet_url).toBe(reservedUrl);
	});
});
