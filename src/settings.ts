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
		return [
			{
				type: "page",
				name: t("settings.pages.account"),
				desc: t("settings.pages.accountDesc"),
				displayValue: () =>
					this.plugin.settings.identifier || t("settings.account.notConnected"),
				status: () =>
					this.plugin.settings.identifier && this.plugin.settings.appPasswordSecret
						? null
						: "warning",
				items: this.accountItems(),
			},
			{
				type: "page",
				name: t("settings.pages.publication"),
				desc: t("settings.pages.publicationDesc"),
				displayValue: () =>
					settings.publications.find(
						(p) => p.uri === this.plugin.settings.defaultPublication
					)?.name ?? t("settings.publication.standalone"),
				items: [...this.publicationItems(), ...this.preferenceItems()],
			},
			{
				type: "page",
				name: t("settings.pages.content"),
				desc: t("settings.pages.contentDesc"),
				items: this.contentItems(),
			},
			{
				type: "page",
				name: t("settings.pages.properties"),
				desc: t("settings.pages.propertiesDesc"),
				items: this.propertyItems(),
			},
			{
				type: "group",
				heading: t("settings.deleted.heading"),
				items: [
					{
						name: t("settings.deleted.mode"),
						desc: t("settings.deleted.modeDesc"),
						control: {
							type: "dropdown",
							key: "onNoteDeleted",
							options: {
								ask: t("settings.deleted.ask"),
								delete: t("settings.deleted.delete"),
								keep: t("settings.deleted.keep"),
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.after.heading"),
				items: [
					{
						name: t("settings.after.confirm"),
						desc: t("settings.after.confirmDesc"),
						control: { type: "toggle", key: "confirmBatch" },
					},
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

	private accountItems(): SettingDefinitionItem[] {
		const t = i18next.t;
		return [
			{
				name: t("settings.account.identifier"),
				desc: t("settings.account.identifierDesc"),
				control: { type: "text", key: "identifier", placeholder: "alice.bsky.social" },
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
						/\s/.test(value.trim()) ? t("settings.account.pdsInvalid") : undefined,
				},
			},
			{
				name: t("settings.account.test"),
				desc: this.plugin.settings.did || t("settings.account.testDesc"),
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
		];
	}

	private publicationItems(): SettingDefinitionItem[] {
		const t = i18next.t;
		const publications: Record<string, string> = {
			"": t("settings.publication.standalone"),
		};
		for (const pub of this.plugin.settings.publications) publications[pub.uri] = pub.name;
		return [
			{
				name: t("settings.publication.default"),
				desc: t("settings.publication.defaultDesc"),
				control: { type: "dropdown", key: "defaultPublication", options: publications },
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
		];
	}

	private preferenceItems(): SettingDefinitionItem[] {
		const t = i18next.t;
		const toggle = (key: string, name: string, desc: string) => ({
			name,
			desc,
			control: { type: "toggle" as const, key },
		});
		return [
			{
				type: "group",
				heading: t("settings.preferences.heading"),
				items: [
					toggle(
						"showInDiscover",
						t("settings.preferences.discover"),
						t("settings.preferences.discoverDesc")
					),
					toggle(
						"showComments",
						t("settings.preferences.comments"),
						t("settings.preferences.commentsDesc")
					),
					toggle(
						"showMentions",
						t("settings.preferences.mentions"),
						t("settings.preferences.mentionsDesc")
					),
					toggle(
						"showRecommends",
						t("settings.preferences.recommends"),
						t("settings.preferences.recommendsDesc")
					),
				],
			},
		];
	}

	private contentItems(): SettingDefinitionItem[] {
		const t = i18next.t;
		const themes = Object.fromEntries(CODE_THEMES.map((id) => [id, id]));
		return [
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
						page: t("settings.content.embedsPage"),
						link: t("settings.content.embedsLink"),
					},
				},
			},
			{
				type: "group",
				heading: t("settings.content.blocksHeading"),
				items: [
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
						name: t("settings.content.callouts"),
						desc: t("settings.content.calloutsDesc"),
						control: {
							type: "dropdown",
							key: "calloutMode",
							options: {
								quote: t("settings.content.calloutsQuote"),
								html: t("settings.content.calloutsHtml"),
								page: t("settings.content.calloutsPage"),
							},
						},
					},
					{
						name: t("settings.content.mermaid"),
						desc: t("settings.content.mermaidDesc"),
						control: {
							type: "dropdown",
							key: "mermaidMode",
							options: {
								image: t("settings.content.mermaidImage"),
								code: t("settings.content.mermaidCode"),
							},
						},
					},
					{
						name: t("settings.content.dataview"),
						desc: t("settings.content.dataviewDesc"),
						control: { type: "toggle", key: "dataview" },
					},
					{
						name: t("settings.content.mentions"),
						desc: t("settings.content.mentionsDesc"),
						control: { type: "toggle", key: "mentions" },
					},
					{
						name: t("settings.content.linkCards"),
						desc: t("settings.content.linkCardsDesc"),
						control: { type: "toggle", key: "linkCards" },
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
				heading: t("settings.content.imagesHeading"),
				items: [
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
				],
			},
		];
	}

	private propertyItems(): SettingDefinitionItem[] {
		const t = i18next.t;
		return [
			this.keyField(
				"publishKey",
				t("settings.frontmatter.publish"),
				t("settings.frontmatter.publishDesc")
			),
			{
				name: t("settings.frontmatter.requireFlag"),
				desc: t("settings.frontmatter.requireFlagDesc"),
				visible: () => !!this.plugin.settings.publishKey,
				control: { type: "toggle", key: "requirePublishFlag" },
			},
			{
				type: "group",
				heading: t("settings.frontmatter.readHeading"),
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
				],
			},
			{
				type: "group",
				heading: t("settings.frontmatter.writeHeading"),
				items: [
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
