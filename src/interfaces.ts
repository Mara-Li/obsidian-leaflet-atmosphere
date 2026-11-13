import type {PublicationInfo} from "./leaflet/types";

export type WikilinkMode = "text" | "published";
export type EmbedMode = "inline" | "link" | "page";
export type TableMode = "html" | "code";
export type MermaidMode = "image" | "code";
export type CalloutMode = "quote" | "html" | "page";
export type DeletedNoteMode = "ask" | "delete" | "keep";

export interface TextReplacement {
	regex: string;
	replacement: string;
}

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
	calloutMode: CalloutMode;
	foldableCalloutsAsPages: boolean;
	dataview: boolean;
	linkCards: boolean;
	mentions: boolean;
	uploadRemoteImages: boolean;
	codeTheme: string;
	maxImageWidth: number;
	replacements: TextReplacement[];

	writeFrontmatter: boolean;
	confirmBatch: boolean;
	onNoteDeleted: DeletedNoteMode;
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
	calloutMode: "quote",
	foldableCalloutsAsPages: true,
	dataview: true,
	linkCards: true,
	mentions: true,
	uploadRemoteImages: true,
	codeTheme: "github-light",
	maxImageWidth: 2000,
	replacements: [],

	writeFrontmatter: true,
	confirmBatch: true,
	onNoteDeleted: "ask",
	copyLinkAfterPublish: false,
	openAfterPublish: false,
};

/** Leaflet personal page used as `site` for documents outside a publication. */
export const STANDALONE = "";
export const CODE_THEMES = [
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
export const PUB_KEY_PREFIX = "publishKey:";
