export interface BlobRef {
	$type: "blob";
	ref: { $link: string };
	mimeType: string;
	size: number;
}

export interface StrongRef {
	uri: string;
	cid: string;
}

export interface ByteSlice {
	byteStart: number;
	byteEnd: number;
}

export type FacetFeature =
	| { $type: "pub.leaflet.richtext.facet#bold" }
	| { $type: "pub.leaflet.richtext.facet#italic" }
	| { $type: "pub.leaflet.richtext.facet#strikethrough" }
	| { $type: "pub.leaflet.richtext.facet#underline" }
	| { $type: "pub.leaflet.richtext.facet#code" }
	| { $type: "pub.leaflet.richtext.facet#highlight"; color?: RgbaColor }
	| { $type: "pub.leaflet.richtext.facet#link"; uri: string }
	| { $type: "pub.leaflet.richtext.facet#didMention"; did: string }
	| { $type: "pub.leaflet.richtext.facet#id"; id: string }
	| {
			$type: "pub.leaflet.richtext.facet#footnote";
			footnoteId: string;
			contentPlaintext: string;
			contentFacets?: Facet[];
	  };

export interface RgbaColor {
	$type: "pub.leaflet.theme.color#rgba";
	r: number;
	g: number;
	b: number;
	/** Opacity from 0 to 100 */
	a: number;
}

export interface Facet {
	index: ByteSlice;
	features: FacetFeature[];
}

export interface TextBlock {
	$type: "pub.leaflet.blocks.text";
	plaintext: string;
	facets?: Facet[];
}

export interface HeaderBlock {
	$type: "pub.leaflet.blocks.header";
	level: number;
	plaintext: string;
	facets?: Facet[];
}

export interface BlockquoteBlock {
	$type: "pub.leaflet.blocks.blockquote";
	plaintext: string;
	facets?: Facet[];
}

export interface AspectRatio {
	width: number;
	height: number;
}

export interface ImageBlock {
	$type: "pub.leaflet.blocks.image";
	image: BlobRef;
	aspectRatio: AspectRatio;
	alt?: string;
	width?: number;
}

export interface CodeBlock {
	$type: "pub.leaflet.blocks.code";
	plaintext: string;
	language?: string;
	syntaxHighlightingTheme?: string;
}

export interface MathBlock {
	$type: "pub.leaflet.blocks.math";
	tex: string;
}

export interface HorizontalRuleBlock {
	$type: "pub.leaflet.blocks.horizontalRule";
}

export interface WebsiteBlock {
	$type: "pub.leaflet.blocks.website";
	src: string;
	title?: string;
	description?: string;
	previewImage?: BlobRef;
}

export interface ImageGalleryBlock {
	$type: "pub.leaflet.blocks.imageGallery";
	images: {
		$type: "pub.leaflet.blocks.imageGallery#image";
		image: BlobRef;
		aspectRatio: AspectRatio;
		alt?: string;
	}[];
	format?: "grid" | "carousel" | "strip" | "masonry";
}

export interface StandardSitePostBlock {
	$type: "pub.leaflet.blocks.standardSitePost";
	uri: string;
}

export interface StandardSitePublicationBlock {
	$type: "pub.leaflet.blocks.standardSitePublication";
	uri: string;
}

export interface IframeBlock {
	$type: "pub.leaflet.blocks.iframe";
	url: string;
	height?: number;
}

export interface HtmlBlock {
	$type: "pub.leaflet.blocks.html";
	html: string;
	height?: number;
}

export interface BskyPostBlock {
	$type: "pub.leaflet.blocks.bskyPost";
	postRef: StrongRef;
}

export interface PageBlock {
	$type: "pub.leaflet.blocks.page";
	id: string;
	display?: "full" | "compact";
}

export type ListContent = TextBlock | HeaderBlock | ImageBlock;

export interface UnorderedListItem {
	$type: "pub.leaflet.blocks.unorderedList#listItem";
	content: ListContent;
	checked?: boolean;
	children?: UnorderedListItem[];
	orderedListChildren?: OrderedListBlock;
}

export interface OrderedListItem {
	$type: "pub.leaflet.blocks.orderedList#listItem";
	content: ListContent;
	checked?: boolean;
	children?: OrderedListItem[];
	unorderedListChildren?: UnorderedListBlock;
}

export interface UnorderedListBlock {
	$type: "pub.leaflet.blocks.unorderedList";
	children: UnorderedListItem[];
}

export interface OrderedListBlock {
	$type: "pub.leaflet.blocks.orderedList";
	startIndex?: number;
	children: OrderedListItem[];
}

export type LeafletBlock =
	| TextBlock
	| HeaderBlock
	| BlockquoteBlock
	| ImageBlock
	| ImageGalleryBlock
	| CodeBlock
	| MathBlock
	| HorizontalRuleBlock
	| WebsiteBlock
	| StandardSitePostBlock
	| StandardSitePublicationBlock
	| IframeBlock
	| HtmlBlock
	| BskyPostBlock
	| PageBlock
	| UnorderedListBlock
	| OrderedListBlock;

export interface LinearDocumentBlock {
	$type: "pub.leaflet.pages.linearDocument#block";
	block: LeafletBlock;
}

export interface LinearDocumentPage {
	$type: "pub.leaflet.pages.linearDocument";
	id: string;
	blocks: LinearDocumentBlock[];
}

export interface LeafletContent {
	$type: "pub.leaflet.content";
	pages: LinearDocumentPage[];
	blobPages?: BlobRef;
	blobs?: BlobRef[];
}

export interface DocumentPreferences {
	$type: "pub.leaflet.publication#preferences";
	showInDiscover?: boolean;
	showComments?: boolean;
	showMentions?: boolean;
	showRecommends?: boolean;
}

export interface StandardDocument {
	$type: "site.standard.document";
	site: string;
	title: string;
	publishedAt: string;
	path?: string;
	description?: string;
	textContent?: string;
	tags?: string[];
	coverImage?: BlobRef;
	bskyPostRef?: StrongRef;
	updatedAt?: string;
	preferences?: DocumentPreferences;
	content: LeafletContent;
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
