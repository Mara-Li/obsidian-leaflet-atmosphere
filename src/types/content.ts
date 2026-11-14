import type { AspectRatio, BlobRef } from "./lexicons";

export interface UploadedImage {
	blob: BlobRef;
	aspectRatio: AspectRatio;
}

export interface RawImage {
	data: ArrayBuffer;
	mime: string;
}

export interface PostTheme {
	bodyFont?: string;
	headingFont?: string;
	/** Colors of the publication, as CSS. */
	textColor?: string;
	backgroundColor?: string;
	accentColor?: string;
}

export interface LinkPreview {
	title?: string;
	description?: string;
	/** Absolute URL of the preview image. */
	image?: string;
	/** AT-URI of the standard.site document shown by the page. */
	document?: string;
	/** AT-URI of the standard.site publication living at this address. */
	publication?: string;
}
