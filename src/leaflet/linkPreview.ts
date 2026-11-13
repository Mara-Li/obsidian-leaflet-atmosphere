import { request } from "../atproto/http";

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

const AT_URI = /^at:\/\/[^/\s]+\/[a-z0-9.]+\/[^/\s]+$/i;

async function getText(url: string): Promise<{ text: string; type: string } | null> {
	// biome-ignore lint/style/useNamingConvention: Web request with header
	const res = await request({ url, headers: { Accept: "text/html,*/*" } }).catch(
		() => null
	);
	if (!res || res.status >= 400) return null;
	const header = Object.entries(res.headers).find(
		([k]) => k.toLowerCase() === "content-type"
	);
	return { text: res.text, type: header?.[1] ?? "" };
}

/** Publication declared by the standard.site endpoint for this address. */
async function standardPublication(url: URL): Promise<string | undefined> {
	const path = url.pathname.replace(/\/+$/, "");
	const res = await getText(`${url.origin}/.well-known/site.standard.publication${path}`);
	const uri = res?.text.trim();
	return uri && AT_URI.test(uri) && uri.includes("/site.standard.publication/")
		? uri
		: undefined;
}

/** Title, description, image and standard.site records of a web page. */
export async function fetchLinkPreview(address: string): Promise<LinkPreview> {
	let url: URL;
	try {
		url = new URL(address);
	} catch {
		return {};
	}
	const [page, publication] = await Promise.all([
		getText(address),
		standardPublication(url),
	]);
	const preview: LinkPreview = {};
	if (publication) preview.publication = publication;
	if (!page || (page.type && !/html/i.test(page.type))) return preview;

	const doc = new DOMParser().parseFromString(page.text, "text/html");
	const meta = (...names: string[]) => {
		for (const name of names) {
			const el = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
			const value = el?.getAttribute("content")?.trim();
			if (value) return value;
		}
		return undefined;
	};
	const documentUri = doc
		.querySelector('link[rel="site.standard.document"]')
		?.getAttribute("href")
		?.trim();
	if (documentUri && AT_URI.test(documentUri)) preview.document = documentUri;

	const title =
		meta("og:title", "twitter:title") ?? doc.querySelector("title")?.textContent?.trim();
	const description = meta("og:description", "twitter:description", "description");
	const image = meta("og:image", "og:image:url", "twitter:image");
	if (title) preview.title = title.slice(0, 300);
	if (description) preview.description = description.slice(0, 1000);
	if (image) {
		try {
			preview.image = new URL(image, address).href;
		} catch {
			/* invalid image URL */
		}
	}
	return preview;
}
