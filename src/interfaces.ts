import type { PublicationInfo } from "./leaflet/types";

export type WikilinkMode = "text" | "published";
export type EmbedMode = "inline" | "link";
export type TableMode = "html" | "code";
export type MermaidMode = "image" | "code";

export interface LeafletAtmosphereSettings {
	identifier: string;
	appPasswordSecret: string;
	pdsUrl: string;
	did: string;

	publications: PublicationInfo[];
	defaultPublication: string;

	publishKey: string;
	requirePublishFlag: boolean;
	titleKey: string;
	descriptionKey: string;
	tagsKey: string;
	coverKey: string;
	publishedAtKey: string;
	slugKey: string;
	uriKey: string;
	urlKey: string;
	lastPublishedKey: string;

	showInDiscover: boolean;
	showComments: boolean;
	showMentions: boolean;
	showRecommends: boolean;

	useSlugAsRecordKey: boolean;
	firstHeadingAsTitle: boolean;
	wikilinkMode: WikilinkMode;
	embedMode: EmbedMode;
	tableMode: TableMode;
	mermaidMode: MermaidMode;
	dataview: boolean;
	linkCards: boolean;
	uploadRemoteImages: boolean;
	codeTheme: string;
	maxImageWidth: number;

	writeFrontmatter: boolean;
	copyLinkAfterPublish: boolean;
	openAfterPublish: boolean;
}

export const DEFAULT_SETTINGS: LeafletAtmosphereSettings = {
	identifier: "",
	appPasswordSecret: "",
	pdsUrl: "",
	did: "",

	publications: [],
	defaultPublication: "",

	publishKey: "leaflet_publish",
	requirePublishFlag: false,
	titleKey: "title",
	descriptionKey: "description",
	tagsKey: "tags",
	coverKey: "cover",
	publishedAtKey: "date",
	slugKey: "slug",
	uriKey: "leaflet_uri",
	urlKey: "leaflet_url",
	lastPublishedKey: "leaflet_last_published",

	showInDiscover: true,
	showComments: true,
	showMentions: true,
	showRecommends: true,

	useSlugAsRecordKey: false,
	firstHeadingAsTitle: true,
	wikilinkMode: "published",
	embedMode: "inline",
	tableMode: "html",
	mermaidMode: "image",
	dataview: true,
	linkCards: true,
	uploadRemoteImages: true,
	codeTheme: "github-light",
	maxImageWidth: 2000,

	writeFrontmatter: true,
	copyLinkAfterPublish: false,
	openAfterPublish: false,
};

/** Leaflet personal page used as `site` for documents outside a publication. */
export const STANDALONE = "";
