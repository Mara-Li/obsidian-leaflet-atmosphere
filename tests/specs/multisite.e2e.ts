import { browser, expect } from "@wdio/globals";
import * as path from "path";
import { validateDocuments } from "../helpers/lexicons";
import {
	confirmModal,
	DID,
	getFrontmatter,
	getRecords,
	PUBLICATION,
	publish,
	runCommand,
	setup,
	waitNotice,
} from "../helpers/obsidian";

const COLLECTION = "site.standard.document";
const SECOND = {
	uri: `at://${DID}/site.standard.publication/3second`,
	name: "Second blog",
	url: "https://second.example.com",
	publishKey: "publish_second",
};

async function setupSites(): Promise<void> {
	await setup(
		{ publications: [PUBLICATION, SECOND] },
		path.resolve("tests/vault-multisite")
	);
}

async function waitLinks(file: string, count: number): Promise<unknown> {
	let value: unknown;
	await browser.waitUntil(
		async () => {
			value = (await getFrontmatter(file)).leaflet_uri;
			const n = Array.isArray(value) ? value.length : value === undefined ? 0 : 1;
			return n === count;
		},
		{ timeout: 15000, timeoutMsg: `${file} never had ${count} links` }
	);
	return value;
}

describe("Publishing to several publications", function () {
	beforeEach(async function () {
		await setupSites();
	});

	it("publishes a note to every listed publication", async function () {
		await publish("Both.md");
		const records = await getRecords();
		expect(Object.keys(records).sort()).toEqual([
			`${COLLECTION}/shared-post`,
			`${COLLECTION}/shared-post-second-blog`,
		]);
		expect(records[`${COLLECTION}/shared-post`]!.site).toBe(PUBLICATION.uri);
		expect(records[`${COLLECTION}/shared-post-second-blog`]!.site).toBe(SECOND.uri);
		expect(validateDocuments(Object.values(records))).toEqual(["", ""]);

		expect(await waitLinks("Both.md", 2)).toEqual([
			`at://${DID}/${COLLECTION}/shared-post`,
			`at://${DID}/${COLLECTION}/shared-post-second-blog`,
		]);
		expect((await getFrontmatter("Both.md")).leaflet_url).toEqual([
			`${PUBLICATION.url}/shared-post`,
			`${SECOND.url}/shared-post-second-blog`,
		]);
	});

	it("updates the same posts when published again", async function () {
		await publish("Both.md");
		await waitLinks("Both.md", 2);
		const notice = await publish("Both.md");
		expect(notice).toContain("Updated on Leaflet");
		expect(Object.keys(await getRecords())).toHaveLength(2);
	});

	it("publishes to the publication whose property is true", async function () {
		await publish("Second only.md");
		const records = Object.values(await getRecords());
		expect(records).toHaveLength(1);
		expect(records[0]!.site).toBe(SECOND.uri);
		expect(await waitLinks("Second only.md", 1)).toMatch(/^at:\/\//);
	});

	it("counts the notes marked for one publication", async function () {
		await runCommand("publish-marked-notes");
		await confirmModal();
		expect(await waitNotice(/failed/, 60000)).toMatch(/4 published, 0 updated, 0 failed/);
		const sites = Object.values(await getRecords()).map((r) => r.site);
		expect(sites.filter((s) => s === SECOND.uri)).toHaveLength(2);
		expect(sites.filter((s) => s === PUBLICATION.uri)).toHaveLength(2);
	});

	it("unpublishes every post of the note", async function () {
		await publish("Both.md");
		await waitLinks("Both.md", 2);
		await runCommand("unpublish-note", "Both.md");
		await confirmModal();
		await waitLinks("Both.md", 0);
		expect(await getRecords()).toEqual({});
	});

	it("keeps the other post when one is deleted from the manager", async function () {
		await publish("Both.md");
		await waitLinks("Both.md", 2);
		await runCommand("manage-posts");
		const rows = browser.$$(".leaflet-atmosphere-manager-row");
		await browser.waitUntil(async () => (await rows.length) === 2);
		for (const row of await rows) {
			const meta = await row.$(".leaflet-atmosphere-manager-meta").getText();
			if (!meta.includes("Second blog")) continue;
			await row.$("button[aria-label='Delete']").click();
			break;
		}
		await confirmModal();
		expect(await waitLinks("Both.md", 1)).toBe(`at://${DID}/${COLLECTION}/shared-post`);
		expect(Object.keys(await getRecords())).toEqual([`${COLLECTION}/shared-post`]);
		await browser.executeObsidian(({ app }) => {
			app.workspace.detachLeavesOfType("leaflet-atmosphere-posts");
		});
	});

	it("edits the publish property of a publication from the settings", async function () {
		const keys = await browser.executeObsidian(async ({ app, plugins }, uri) => {
			const setting = app.setting as unknown as {
				pluginTabs: {
					id: string;
					getControlValue(key: string): unknown;
					setControlValue(key: string, value: unknown): Promise<void>;
				}[];
			};
			const tab = setting.pluginTabs.find((t) => t.id === "leaflet-atmosphere")!;
			const before = tab.getControlValue(`publishKey:${uri}`);
			await tab.setControlValue(`publishKey:${uri}`, " publish_other ");
			const pub = plugins.leafletAtmosphere.settings.publications.find((p) => p.uri === uri);
			return [before, pub?.publishKey];
		}, SECOND.uri);
		expect(keys).toEqual(["publish_second", "publish_other"]);
	});
});
