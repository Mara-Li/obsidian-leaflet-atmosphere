import { expect } from "@wdio/globals";
import {
	forgetLink,
	getFrontmatter,
	getRecords,
	publish,
	runCommand,
	setup,
	waitFrontmatter,
	waitNotice,
} from "../helpers/obsidian";

const COLLECTION = "site.standard.document";

describe("Notes that lost their link", function () {
	beforeEach(async function () {
		await setup();
	});

	it("updates the post at the slug instead of failing", async function () {
		await publish("Slugged.md");
		const before = await getRecords();
		await forgetLink("Slugged.md");

		const notice = await publish("Slugged.md");
		expect(notice).toContain("Updated on Leaflet");
		await waitNotice(/lost its link/);

		const after = await getRecords();
		expect(Object.keys(after)).toEqual([`${COLLECTION}/my-custom-slug`]);
		const key = `${COLLECTION}/my-custom-slug`;
		expect(after[key]!.publishedAt).toBe(before[key]!.publishedAt);
		expect(await waitFrontmatter("Slugged.md", "leaflet_uri")).toBe(
			`at://did:plc:leaflettest/${key}`
		);
	});

	it("finds the post by its title", async function () {
		await publish("Target.md");
		const [key] = Object.keys(await getRecords());
		await forgetLink("Target.md");

		await publish("Target.md");
		expect(Object.keys(await getRecords())).toEqual([key]);
		expect(await waitFrontmatter("Target.md", "leaflet_uri")).toBe(
			`at://did:plc:leaflettest/${key}`
		);
	});

	it("never takes the post of another note", async function () {
		await publish("Target.md");
		await waitFrontmatter("Target.md", "leaflet_uri");
		const notice = await publish("Copies/Same title.md");
		expect(notice).toContain("Published to Leaflet");
		expect(Object.keys(await getRecords())).toHaveLength(2);
	});

	it("restores the link without publishing", async function () {
		await publish("Target.md");
		const records = await getRecords();
		const uri = await waitFrontmatter("Target.md", "leaflet_uri");
		await forgetLink("Target.md");

		await runCommand("pull-note", "Target.md");
		await waitNotice(/Leaflet link restored/);
		expect(await waitFrontmatter("Target.md", "leaflet_uri")).toBe(uri);
		expect((await getFrontmatter("Target.md")).leaflet_url).toBeDefined();
		expect(await getRecords()).toEqual(records);
	});
});
