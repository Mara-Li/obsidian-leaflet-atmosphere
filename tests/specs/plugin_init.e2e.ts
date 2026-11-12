import { browser, expect } from "@wdio/globals";

describe("Plugin", function () {
	it("is loaded", async function () {
		const loaded = await browser.executeObsidian(
			({ plugins }) => plugins.leafletAtmosphere?._loaded ?? false
		);
		expect(loaded).toBe(true);
	});

	it("registers its commands", async function () {
		const commands = await browser.executeObsidian(({ app }) =>
			Object.keys(app.commands.commands).filter((id) => id.startsWith("leaflet-atmosphere:"))
		);
		expect(commands.sort()).toEqual(
			[
				"copy-link",
				"open-in-browser",
				"publish-marked-notes",
				"publish-note",
				"publish-note-to",
				"refresh-publications",
				"unpublish-note",
			].map((id) => `leaflet-atmosphere:${id}`)
		);
	});
});
