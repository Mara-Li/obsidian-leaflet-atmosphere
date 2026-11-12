import { type App, requestUrl, TFile } from "obsidian";
import type { AtpClient } from "../atproto/client";
import { exportExcalidraw, isExcalidraw } from "../markdown/compilers/excalidraw";
import type { AspectRatio, BlobRef } from "./types";

const MAX_BLOB_SIZE = 1_000_000;
const PASSTHROUGH = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const MIME_BY_EXT: Record<string, string> = {
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

export interface UploadedImage {
	blob: BlobRef;
	aspectRatio: AspectRatio;
}

export interface RawImage {
	data: ArrayBuffer;
	mime: string;
}

async function loadElement(blob: Blob): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return img;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
	return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

async function reencode(
	img: HTMLImageElement,
	maxWidth: number,
	scale = 1
): Promise<{ blob: Blob; width: number; height: number }> {
	let width = (img.naturalWidth || img.width) * scale;
	let height = (img.naturalHeight || img.height) * scale;
	if (width > maxWidth) {
		height = Math.round((height * maxWidth) / width);
		width = maxWidth;
	}
	let quality = 0.9;
	for (let attempt = 0; attempt < 12; attempt++) {
		const canvas = createEl("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas is not available");
		ctx.drawImage(img, 0, 0, width, height);
		let blob = await canvasToBlob(canvas, "image/webp", quality);
		if (!blob || blob.type !== "image/webp") {
			// No WebP encoder (iOS): JPEG on a white background
			ctx.globalCompositeOperation = "destination-over";
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, width, height);
			blob = await canvasToBlob(canvas, "image/jpeg", quality);
		}
		if (blob && blob.size <= MAX_BLOB_SIZE) return { blob, width, height };
		if (quality > 0.6) quality -= 0.15;
		else {
			width = Math.round(width * 0.8);
			height = Math.round(height * 0.8);
		}
	}
	throw new Error("Unable to compress image under 1 MB");
}

export class ImageUploader {
	private cache = new Map<string, Promise<UploadedImage | null>>();

	constructor(
		private app: App,
		private client: AtpClient,
		private maxWidth: number,
		private allowRemote: boolean
	) {}

	resolveFile(link: string, sourcePath: string): TFile | null {
		const path = decodeURIComponent(link.split("#")[0]!.split("|")[0]!.trim());
		const file =
			this.app.metadataCache.getFirstLinkpathDest(path, sourcePath) ??
			this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return IMAGE_EXTENSIONS.has(file.extension.toLowerCase()) ||
			isExcalidraw(this.app, file)
			? file
			: null;
	}

	upload(link: string, sourcePath: string): Promise<UploadedImage | null> {
		const isRemote = /^https?:\/\//i.test(link);
		const file = isRemote ? null : this.resolveFile(link, sourcePath);
		const key = file?.path ?? link;
		let pending = this.cache.get(key);
		if (!pending) {
			pending = this.load(link, file, isRemote).then((raw) =>
				raw ? this.send(raw) : null
			);
			this.cache.set(key, pending);
		}
		return pending;
	}

	/** Upload generated image data (e.g. a rendered diagram), cached by key. */
	uploadData(
		key: string,
		data: () => Promise<RawImage | null>
	): Promise<UploadedImage | null> {
		let pending = this.cache.get(key);
		if (!pending) {
			pending = data().then((raw) => (raw ? this.send(raw) : null));
			this.cache.set(key, pending);
		}
		return pending;
	}

	private async load(
		link: string,
		file: TFile | null,
		isRemote: boolean
	): Promise<RawImage | null> {
		if (file && isExcalidraw(this.app, file)) return exportExcalidraw(this.app, file);
		if (file) {
			return {
				data: await this.app.vault.readBinary(file),
				mime: MIME_BY_EXT[file.extension.toLowerCase()] ?? "application/octet-stream",
			};
		}
		if (!isRemote || !this.allowRemote) return null;
		const res = await requestUrl({ url: link, throw: false });
		if (res.status >= 400) return null;
		const header = Object.entries(res.headers).find(
			([k]) => k.toLowerCase() === "content-type"
		);
		const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(link)?.[1]?.toLowerCase() ?? "";
		const mime = header?.[1].split(";")[0]?.trim() || MIME_BY_EXT[ext] || "";
		if (!mime.startsWith("image/")) return null;
		return { data: res.arrayBuffer, mime };
	}

	private async send(raw: RawImage): Promise<UploadedImage> {
		const source = new Blob([raw.data], { type: raw.mime });
		const img = await loadElement(source);
		const width = img.naturalWidth || img.width || 1;
		const height = img.naturalHeight || img.height || 1;
		let data = raw.data;
		let mime = raw.mime;
		let ratio: AspectRatio = { width, height };
		if (
			!PASSTHROUGH.has(mime) ||
			raw.data.byteLength > MAX_BLOB_SIZE ||
			width > this.maxWidth
		) {
			// Vector images are rasterized at twice their size to stay sharp
			const scale = mime === "image/svg+xml" ? 2 : 1;
			const encoded = await reencode(img, this.maxWidth, scale);
			data = await encoded.blob.arrayBuffer();
			mime = encoded.blob.type;
			ratio = { width: encoded.width, height: encoded.height };
		}
		const blob = await this.client.uploadBlob(data, mime);
		return { blob, aspectRatio: ratio };
	}
}
