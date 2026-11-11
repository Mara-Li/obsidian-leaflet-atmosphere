import { type App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type <%= data.interfaceName %> from "./main";

export class <%= data.interfaceName %>SettingTab extends PluginSettingTab {
	plugin: <%= data.interfaceName %>;

	constructor(app: App, plugin: <%= data.interfaceName %>) {
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
