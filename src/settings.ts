import { type App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type LeafletAtmosphere from "./main";

export class LeafletAtmosphereSettingTab extends PluginSettingTab {
	plugin: LeafletAtmosphere;

	constructor(app: App, plugin: LeafletAtmosphere) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Greeting",
				desc: "Text shown by the sample setting",
				control: { type: "text", key: "greeting", placeholder: "Enter a greeting" },
			},
		];
	}
}
