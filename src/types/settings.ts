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

export interface GazetteSettings {
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

export interface PublicationInfo {
	uri: string;
	name: string;
	url: string;
	/** Leaflet font ids and text color of the publication theme. */
	bodyFont?: string;
	headingFont?: string;
	textColor?: string;
	backgroundColor?: string;
	accentColor?: string;
	/** Note property that publishes a note to this publication when true. */
	publishKey?: string;
}
