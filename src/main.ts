import i18next from "i18next";
import { Notice, Platform, Plugin } from "obsidian";
import { AtpClient } from "./atproto/client";
import { registerCommands } from "./commands";
import { showError } from "./commands/actions";
import { resources, translationLanguage } from "./i18n";
import { DEFAULT_SETTINGS, type LeafletAtmosphereSettings } from "./interfaces";
import { fetchPublications } from "./leaflet/publications";
import { LeafletAtmosphereSettingTab } from "./settings";

export default class LeafletAtmosphere extends Plugin {
	settings: LeafletAtmosphereSettings = { ...DEFAULT_SETTINGS };
	/** Publication progress, desktop only: mobile has no status bar. */
	statusBarEl: HTMLElement | null = null;
	private client: AtpClient | null = null;
	private clientKey = "";

	async onload() {
		await this.loadSettings();
		await i18next.init({
			lng: translationLanguage,
			fallbackLng: "en",
			resources,
			returnNull: false,
			returnEmptyString: false,
			// Notices show plain text: no HTML escaping of interpolated values
			interpolation: { escapeValue: false },
		});
		if (!Platform.isMobile) {
			this.statusBarEl = this.addStatusBarItem();
			this.statusBarEl.addClass("leaflet-atmosphere-status");
			this.statusBarEl.hide();
		}
		registerCommands(this);
		this.addSettingTab(new LeafletAtmosphereSettingTab(this.app, this));
	}

	onunload() {
		this.client = null;
	}

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

	/** Logged-in client, recreated when the credentials change. */
	async getClient(): Promise<AtpClient> {
		const { identifier, pdsUrl, appPasswordSecret } = this.settings;
		const password = appPasswordSecret
			? this.app.secretStorage.getSecret(appPasswordSecret)
			: null;
		if (!identifier.trim() || !password)
			throw new Error(i18next.t("error.missingCredentials"));
		const key = [identifier.trim(), pdsUrl.trim(), password].join("\n");
		if (this.client && key === this.clientKey) return this.client;

		const client = new AtpClient({
			identifier: identifier.trim(),
			password,
			pdsUrl: pdsUrl.trim(),
		});
		await client.login();
		this.client = client;
		this.clientKey = key;
		if (this.settings.did !== client.did) {
			this.settings.did = client.did;
			await this.saveSettings();
		}
		return client;
	}

	async connect() {
		try {
			this.client = null;
			const client = await this.getClient();
			new Notice(i18next.t("notice.connected", { handle: client.handle || client.did }));
			await this.refreshPublications();
		} catch (e) {
			showError(e);
		}
	}

	async refreshPublications() {
		try {
			const client = await this.getClient();
			const firstLoad = this.settings.publications.length === 0;
			this.settings.publications = await fetchPublications(client);
			const current = this.settings.defaultPublication;
			if (current && !this.settings.publications.some((p) => p.uri === current))
				this.settings.defaultPublication = "";
			if (firstLoad && !current)
				this.settings.defaultPublication = this.settings.publications[0]?.uri ?? "";
			await this.saveSettings();
			new Notice(
				i18next.t("notice.publicationsRefreshed", {
					count: this.settings.publications.length,
				})
			);
		} catch (e) {
			showError(e);
		}
	}
}
