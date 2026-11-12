import { browser, expect } from "@wdio/globals";

describe("Settings", function () {
	it("groups the settings in sub-pages", async function () {
		const items = await browser.executeObsidian(({ app }) => {
			const setting = app.setting as unknown as {
				pluginTabs: { id: string; getSettingDefinitions(): { type?: string; name?: string }[] }[];
			};
			const tab = setting.pluginTabs.find((t) => t.id === "leaflet-atmosphere");
			return (tab?.getSettingDefinitions() ?? []).map((d) => `${d.type ?? "setting"}:${d.name ?? ""}`);
		});
		expect(items).toEqual([
			"page:Account",
			"page:Publication",
			"page:Conversion",
			"page:Properties",
			"group:",
			"group:",
		]);
	});
});
