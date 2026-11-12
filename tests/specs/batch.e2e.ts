import { expect } from "@wdio/globals";
import * as path from "path";
import { validateDocuments } from "../helpers/lexicons";
import {
	confirmModal,
	getFrontmatter,
	getRecords,
	PUBLICATION,
	runCommand,
	setup,
	waitNotice,
} from "../helpers/obsidian";
import type { StandardDocument } from "../../src/leaflet/types";

async function publishMarked(): Promise<string> {
	await runCommand("publish-marked-notes");
	await confirmModal();
	return waitNotice(/failed/, 60000);
}

/** Link URLs of every rich text in the record, lists included. */
function linksOf(record: StandardDocument): string[] {
	const out: string[] = [];
	const visit = (value: unknown) => {
		if (Array.isArray(value)) value.forEach(visit);
		else if (value && typeof value === "object") {
			const uri = (value as { $type?: string; uri?: string }).uri;
			if ((value as { $type?: string }).$type === "pub.leaflet.richtext.facet#link" && uri)
				out.push(uri);
			Object.values(value).forEach(visit);
		}
	};
	visit(record.content);
	return out;
}

describe("Publishing marked notes", function () {
	it("publishes only the notes with leaflet_publish: true", async function () {
		await setup();
		const notice = await publishMarked();
		expect(notice).toContain("4 published, 0 updated, 0 failed");

		const records = await getRecords();
		expect(Object.keys(records)).toHaveLength(4);
		expect(validateDocuments(Object.values(records))).toEqual(["", "", "", ""]);
		expect((await getFrontmatter("Blocked.md")).leaflet_uri).toBeUndefined();
		expect((await getFrontmatter("Snippet.md")).leaflet_uri).toBeUndefined();
	});

	it("updates the notes when run again", async function () {
		await setup();
		await publishMarked();
		const notice = await publishMarked();
		expect(notice).toContain("0 published, 4 updated, 0 failed");
		expect(Object.keys(await getRecords())).toHaveLength(4);
	});

	it("publishes the showcase blog with working links", async function () {
		this.timeout(180000);
		await setup({}, path.resolve("showcase-blog"));
		const notice = await publishMarked();
		expect(notice).toMatch(/7 published, 0 updated, 0 failed/);

		const records = Object.values(await getRecords());
		expect(records).toHaveLength(7);
		expect(validateDocuments(records)).toEqual(Array(7).fill(""));

		const welcome = records.find((r) => r.title === "Welcome to the Garden")!;
		const internal = linksOf(welcome).filter((u) => u.startsWith(PUBLICATION.url));
		const urls = new Set(
			await Promise.all(
				[
					"A Week of Sourdough.md",
					"Notes on Note-Taking.md",
					"Field Guide to Math and Code.md",
					"Reading List.md",
					"Sketchbook.md",
				].map(async (file) => (await getFrontmatter(file)).leaflet_url as string)
			)
		);
		expect(new Set(internal)).toEqual(urls);
	});
});
