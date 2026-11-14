import type { GazetteSettings } from "./types";

// Settings
export const DEFAULT_SETTINGS: GazetteSettings = {
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

/** Shiki themes offered for code blocks. */
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

/** Settings key standing for the publish property of a publication. */
export const PUB_KEY_PREFIX = "publishKey:";

// AT Protocol and Leaflet
/** Leaflet personal page used as `site` for documents outside a publication. */
export const STANDALONE = "";

export const DOCUMENT_COLLECTION = "site.standard.document";

// Images
export const MAX_BLOB_SIZE = 1_000_000;

export const PASSTHROUGH = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
]);

export const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	avif: "image/avif",
};

export const IMAGE_EXTENSIONS = new Set(Object.keys(MIME_BY_EXT));

// Services
export const PUBLIC_API = "https://public.api.bsky.app";

export const PLC_DIRECTORY = "https://plc.directory";

/** Bluesky entryway: accepts a login by email and hands over to the real PDS. */
export const ENTRYWAY = "https://bsky.social";

// Conversion
/** Nesting limit of embedded notes. */
export const MAX_DEPTH = 4;

/** Line standing for a note embedded as a sub-page (an HTML block: opening tag alone). */
export const EMBED_PLACEHOLDER = (id: string) => `<leaflet-embed data-id="${id}">`;

// Publishing
export const PREFERENCE_KEYS = {
	publication: "leaflet_publication",
	showInDiscover: "leaflet_discover",
	showComments: "leaflet_comments",
	showMentions: "leaflet_mentions",
	showRecommends: "leaflet_recommends",
} as const;

/** Record size above which pages are stored as a blob. */
export const BLOB_PAGES_THRESHOLD = 100 * 1024;

// Interface
export const MANAGER_VIEW = "gazette-posts";
