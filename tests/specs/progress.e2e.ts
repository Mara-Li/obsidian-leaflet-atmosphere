import { browser, expect } from "@wdio/globals";
import {
	getRecords,
	runCommand,
	setPdsDelay,
	setup,
	statusBar,
	waitNotice,
} from "../helpers/obsidian";

describe("Publication progress", function () {
	it("publishes several notes without confirmation when disabled", async function () {
		await setup({ confirmBatch: false });
		await runCommand("publish-marked-notes");
		const notice = await waitNotice(/failed/, 30000);
		expect(notice).toContain("4 published");
		expect(await browser.$(".modal-container").isExisting()).toBe(false);
		expect(Object.keys(await getRecords())).toHaveLength(4);
	});

	it("shows a progress bar in the status bar during a batch", async function () {
		await setup({ confirmBatch: false });
		await setPdsDelay(600);
		await runCommand("publish-marked-notes");

		let seen: { text: string; value: number | null } | null = null;
		await browser.waitUntil(
			async () => {
				seen = await statusBar();
				return seen !== null && /Publishing [1-4]\/4/.test(seen.text);
			},
			{ timeout: 10000, timeoutMsg: "No progress in the status bar" }
		);
		expect(seen!.value).not.toBeNull();

		await waitNotice(/failed/, 30000);
		expect(await statusBar()).toBeNull();
	});

	it("shows an indeterminate bar while publishing one note", async function () {
		await setup();
		await setPdsDelay(1500);
		await runCommand("publish-note", "Target.md");

		let seen: { text: string; value: number | null } | null = null;
		await browser.waitUntil(async () => {
			seen = await statusBar();
			return seen !== null;
		});
		expect(seen!.text).toBe("Publishing Target…");
		expect(seen!.value).toBeNull();

		await waitNotice(/Published to Leaflet/);
		expect(await statusBar()).toBeNull();
	});
});
