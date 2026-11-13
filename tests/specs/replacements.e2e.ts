import { browser, expect } from "@wdio/globals";
import { getRecords, publish, setup } from "../helpers/obsidian";
import type { TextReplacement } from "../../src/interfaces";

const texts = async (): Promise<string[]> =>
	Object.values(await getRecords())[0]!.content.pages.flatMap((p) =>
		p.blocks.map((b) => ("plaintext" in b.block ? b.block.plaintext : ""))
	);

interface ListDefinition {
	addItem: { action: () => void };
	onReorder: (from: number, to: number) => void;
	onDelete: (index: number) => void;
}

/** Run an action of the rule list of the settings, then return the saved rules. */
async function editRules(action: "add" | "reorder" | "delete"): Promise<TextReplacement[]> {
	await browser.executeObsidian(({ app }, act) => {
		const setting = app.setting as unknown as {
			pluginTabs: { id: string; getSettingDefinitions(): { name?: string; items?: unknown[] }[] }[];
		};
		const tab = setting.pluginTabs.find((t) => t.id === "leaflet-atmosphere")!;
		const page = tab.getSettingDefinitions().find((d) => d.name === "Text replacement")!;
		const list = page.items![1] as ListDefinition;
		if (act === "add") list.addItem.action();
		else if (act === "reorder") list.onReorder(1, 0);
		else list.onDelete(0);
	}, action);
	await browser.pause(200);
	return browser.executeObsidian(({ plugins }) => plugins.leafletAtmosphere.settings.replacements);
}

describe("Text replacement", function () {
	it("applies the rules in order to the note and its embeds", async function () {
		await setup({
			publishKey: "",
			embedMode: "page",
			replacements: [
				{ regex: "/embedded (\\w+)/gi", replacement: "included $1" },
				{ regex: "included", replacement: "shown" },
				{ regex: "Intro", replacement: "Start" },
				{ regex: "/(unclosed/", replacement: "ignored" },
			],
		});
		await publish("Embeds.md");
		const all = await texts();
		expect(all).toContain("Start.");
		expect(all).toContain("shown part text.");
		expect(all.join("\n")).not.toMatch(/Embedded part|Intro/);
	});

	it("adds, reorders and deletes rules from the settings", async function () {
		await setup({ replacements: [{ regex: "a", replacement: "b" }] });
		expect(await editRules("add")).toEqual([
			{ regex: "a", replacement: "b" },
			{ regex: "", replacement: "" },
		]);
		expect(await editRules("reorder")).toEqual([
			{ regex: "", replacement: "" },
			{ regex: "a", replacement: "b" },
		]);
		expect(await editRules("delete")).toEqual([{ regex: "a", replacement: "b" }]);
	});
});
