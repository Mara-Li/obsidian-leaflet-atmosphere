import i18next from "i18next";
import { type App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type LeafletAtmosphere from "./main";

const CODE_THEMES = [
	"github-light",
	"github-dark",
	"github-light-default",
	"github-dark-default",
	"catppuccin-latte",
	"catppuccin-mocha",
	"dracula",
	"everforest-light",
	"everforest-dark",
	"gruvbox-light-medium",
	"gruvbox-dark-medium",
	"material-theme-lighter",
	"material-theme",
	"min-light",
	"min-dark",
	"monokai",
	"night-owl",
	"nord",
	"one-light",
	"one-dark-pro",
	"rose-pine-dawn",
	"rose-pine",
	"solarized-light",
	"solarized-dark",
	"tokyo-night",
	"vitesse-light",
	"vitesse-dark",
];

export class LeafletAtmosphereSettingTab extends PluginSettingTab {
	plugin: LeafletAtmosphere;

	constructor(app: App, plugin: LeafletAtmosphere) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const t = i18next.t;
		const settings = this.plugin.settings;
		const publications: Record<string, string> = {
			"": t("settings.publication.standalone"),
		};
		for (const pub of settings.publications) publications[pub.uri] = pub.name;
		const themes = Object.fromEntries(CODE_THEMES.map((id) => [id, id]));

		return [
			{
				type: "group",
				heading: t("settings.account.heading"),
				items: [
					{
						name: t("settings.account.identifier"),
						desc: t("settings.account.identifierDesc"),
						control: {
							type: "text",
							key: "identifier",
							placeholder: "alice.bsky.social",
						},
					},
					{
						name: t("settings.account.password"),
						desc: t("settings.account.passwordDesc"),
						control: { type: "secret", key: "appPasswordSecret" },
					},
					{
						name: t("settings.account.pds"),
						desc: t("settings.account.pdsDesc"),
						control: {
							type: "text",
							key: "pdsUrl",
							placeholder: "https://bsky.social",
							validate: (value) =>
								value && !/^https?:\/\/[^\s/]+/.test(value) ? "https://…" : undefined,
						},
					},
					{
						name: t("settings.account.test"),
						desc: settings.did || t("settings.account.testDesc"),
						render: (setting) => {
							setting.addButton((button) =>
								button
									.setButtonText(t("settings.account.testButton"))
									.setCta()
									.onClick(async () => {
										button.setDisabled(true);
										await this.plugin.connect();
										button.setDisabled(false);
										this.update();
									})
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.publication.heading"),
				items: [
					{
						name: t("settings.publication.default"),
						desc: t("settings.publication.defaultDesc"),
						control: {
							type: "dropdown",
							key: "defaultPublication",
							options: publications,
						},
					},
					{
						name: t("settings.publication.refresh"),
						desc: t("settings.publication.refreshDesc"),
						render: (setting) => {
							setting.addButton((button) =>
								button
									.setButtonText(t("settings.publication.refreshButton"))
									.onClick(async () => {
										button.setDisabled(true);
										await this.plugin.refreshPublications();
										button.setDisabled(false);
										this.update();
									})
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.preferences.heading"),
				items: [
					{
						name: t("settings.preferences.discover"),
						desc: t("settings.preferences.discoverDesc"),
						control: { type: "toggle", key: "showInDiscover" },
					},
					{
						name: t("settings.preferences.comments"),
						desc: t("settings.preferences.commentsDesc"),
						control: { type: "toggle", key: "showComments" },
					},
					{
						name: t("settings.preferences.mentions"),
						desc: t("settings.preferences.mentionsDesc"),
						control: { type: "toggle", key: "showMentions" },
					},
					{
						name: t("settings.preferences.recommends"),
						desc: t("settings.preferences.recommendsDesc"),
						control: { type: "toggle", key: "showRecommends" },
					},
				],
			},
			{
				type: "group",
				heading: t("settings.content.heading"),
				items: [
					{
						name: t("settings.content.firstHeading"),
						desc: t("settings.content.firstHeadingDesc"),
						control: { type: "toggle", key: "firstHeadingAsTitle" },
					},
					{
						name: t("settings.content.slugAsKey"),
						desc: t("settings.content.slugAsKeyDesc"),
						control: { type: "toggle", key: "useSlugAsRecordKey" },
					},
					{
						name: t("settings.content.wikilinks"),
						desc: t("settings.content.wikilinksDesc"),
						control: {
							type: "dropdown",
							key: "wikilinkMode",
							options: {
								published: t("settings.content.wikilinksPublished"),
								text: t("settings.content.wikilinksText"),
							},
						},
					},
					{
						name: t("settings.content.embeds"),
						desc: t("settings.content.embedsDesc"),
						control: {
							type: "dropdown",
							key: "embedMode",
							options: {
								inline: t("settings.content.embedsInline"),
								link: t("settings.content.embedsLink"),
							},
						},
					},
					{
						name: t("settings.content.tables"),
						desc: t("settings.content.tablesDesc"),
						control: {
							type: "dropdown",
							key: "tableMode",
							options: {
								html: t("settings.content.tablesHtml"),
								code: t("settings.content.tablesCode"),
							},
						},
					},
					{
						name: t("settings.content.linkCards"),
						desc: t("settings.content.linkCardsDesc"),
						control: { type: "toggle", key: "linkCards" },
					},
					{
						name: t("settings.content.remoteImages"),
						desc: t("settings.content.remoteImagesDesc"),
						control: { type: "toggle", key: "uploadRemoteImages" },
					},
					{
						name: t("settings.content.maxWidth"),
						desc: t("settings.content.maxWidthDesc"),
						control: {
							type: "number",
							key: "maxImageWidth",
							min: 200,
							max: 8000,
							step: 1,
						},
					},
					{
						name: t("settings.content.codeTheme"),
						desc: t("settings.content.codeThemeDesc"),
						control: { type: "dropdown", key: "codeTheme", options: themes },
					},
				],
			},
			{
				type: "group",
				heading: t("settings.frontmatter.heading"),
				items: [
					this.keyField(
						"titleKey",
						t("settings.frontmatter.title"),
						t("settings.frontmatter.titleDesc")
					),
					this.keyField("descriptionKey", t("settings.frontmatter.description")),
					this.keyField("tagsKey", t("settings.frontmatter.tags")),
					this.keyField(
						"coverKey",
						t("settings.frontmatter.cover"),
						t("settings.frontmatter.coverDesc")
					),
					this.keyField("publishedAtKey", t("settings.frontmatter.date")),
					this.keyField(
						"slugKey",
						t("settings.frontmatter.slug"),
						t("settings.frontmatter.slugDesc")
					),
					{
						name: t("settings.frontmatter.write"),
						desc: t("settings.frontmatter.writeDesc"),
						control: { type: "toggle", key: "writeFrontmatter" },
					},
					{
						...this.keyField("uriKey", t("settings.frontmatter.uri")),
						visible: () => this.plugin.settings.writeFrontmatter,
					},
					{
						...this.keyField("urlKey", t("settings.frontmatter.url")),
						visible: () => this.plugin.settings.writeFrontmatter,
					},
				],
			},
			{
				type: "group",
				heading: t("settings.after.heading"),
				items: [
					{
						name: t("settings.after.copy"),
						control: { type: "toggle", key: "copyLinkAfterPublish" },
					},
					{
						name: t("settings.after.open"),
						control: { type: "toggle", key: "openAfterPublish" },
					},
				],
			},
		];
	}

	private keyField(key: string, name: string, desc?: string) {
		return {
			name,
			desc,
			control: {
				type: "text" as const,
				key,
				validate: (value: string) =>
					/\s/.test(value) ? i18next.t("settings.frontmatter.noSpaces") : undefined,
			},
		};
	}
}
