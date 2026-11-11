import { type Editor, <% if (data.modal === true) { %>MarkdownView, <% } %>Notice, Plugin } from "obsidian";
<% if (data.i18n === true) { -%>
import i18next from "i18next";
import { resources, translationLanguage } from "./i18n";
<% } -%>
<% if (data.modal === true) { -%>
import { <%= data.interfaceName %>Modal } from "./modals";
<% } -%>
<% if (data.settings === true) { -%>
import { DEFAULT_SETTINGS, type <%= data.interfaceName %>Settings } from "./interfaces";
import { <%= data.interfaceName %>SettingTab } from "./settings";
<% } -%>

export default class <%= data.interfaceName %> extends Plugin {
<% if (data.settings === true) { -%>
	settings: <%= data.interfaceName %>Settings = { ...DEFAULT_SETTINGS };

<% } -%>
	async onload() {
<% if (data.settings === true) { -%>
		await this.loadSettings();
<% } -%>
<% if (data.i18n === true) { -%>

		//load i18next
		await i18next.init({
			lng: translationLanguage,
			fallbackLng: "en",
			resources,
			returnNull: false,
			returnEmptyString: false,
		});
<% } -%>

		// This creates an icon in the left ribbon.
		this.addRibbonIcon("dice", "Sample", () => {
			// Called when the user clicks the icon.
			new Notice("This is a notice!");
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status bar text");
<% if (data.modal === true) { -%>

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-modal-simple",
			name: "Open modal (simple)",
			callback: () => {
				new <%= data.interfaceName %>Modal(this.app).open();
			},
		});
<% } -%>

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "replace-selected",
			name: "Replace selected content",
			editorCallback: (editor: Editor) => {
				editor.replaceSelection("Sample editor command");
			},
		});
<% if (data.modal === true) { -%>

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-modal-complex",
			name: "Open modal (complex)",
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new <%= data.interfaceName %>Modal(this.app).open();
					}
					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			},
		});
<% } -%>
<% if (data.settings === true) { -%>

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new <%= data.interfaceName %>SettingTab(this.app, this));
<% } -%>

	}

	onunload() {}
<% if (data.settings === true) { -%>

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<<%= data.interfaceName %>Settings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
<% } -%>
}
