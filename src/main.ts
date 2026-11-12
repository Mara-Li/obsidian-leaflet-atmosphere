import { type Editor, Notice, Plugin } from "obsidian";
import i18next from "i18next";
import { resources, translationLanguage } from "./i18n";
import { DEFAULT_SETTINGS, type LeafletAtmosphereSettings } from "./interfaces";
import { LeafletAtmosphereSettingTab } from "./settings";

export default class LeafletAtmosphere extends Plugin {
	settings: LeafletAtmosphereSettings = { ...DEFAULT_SETTINGS };

	async onload() {
		await this.loadSettings();

		//load i18next
		await i18next.init({
			lng: translationLanguage,
			fallbackLng: "en",
			resources,
			returnNull: false,
			returnEmptyString: false,
		});

		// This creates an icon in the left ribbon.
		this.addRibbonIcon("dice", "Sample", () => {
			// Called when the user clicks the icon.
			new Notice("This is a notice!");
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status bar text");

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "replace-selected",
			name: "Replace selected content",
			editorCallback: (editor: Editor) => {
				editor.replaceSelection("Sample editor command");
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LeafletAtmosphereSettingTab(this.app, this));

	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LeafletAtmosphereSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
