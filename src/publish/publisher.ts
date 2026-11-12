import i18next from "i18next";
import type { FrontMatterCache, TFile } from "obsidian";
import type { AtpClient } from "../atproto/client";
import { resolveHandle } from "../atproto/identity";
import { isValidRecordKey, nextTid, parseAtUri } from "../atproto/tid";
import { ImageUploader } from "../leaflet/images";
import {
	DOCUMENT_COLLECTION,
	documentUrl,
	standaloneSite,
} from "../leaflet/publications";
import { utf8Length } from "../leaflet/richtext";
import type {
	BlobRef,
	DocumentPreferences,
	LeafletBlock,
	LeafletContent,
	LinearDocumentPage,
	PublicationInfo,
	StandardDocument,
	StrongRef,
} from "../leaflet/types";
import type LeafletAtmosphere from "../main";
import { renderMermaid } from "../markdown/compilers/mermaid";
import { MarkdownConverter } from "../markdown/convert";
import { Preprocessor } from "../markdown/preprocess";
import {
	getBoolean,
	getDate,
	getString,
	getTags,
	PREFERENCE_KEYS,
	slugify,
	unwrapLink,
} from "./frontmatter";

const BLOB_PAGES_THRESHOLD = 100 * 1024;

export interface PublishResult {
	uri: string;
	url: string;
	created: boolean;
	warnings: string[];
}

export interface PublishOptions {
	/** Publication AT-URI, or "" for a standalone document. */
	site?: string;
}

export class Publisher {
	/** Notes published by this instance; the metadata cache may lag behind. */
	readonly published = new Map<string, { uri: string; url: string }>();
	/** Future addresses of linked notes that are marked but not published yet. */
	private reservations = new Map<string, Promise<{ url: string } | null>>();
	private reserved = new Map<string, string>();
	/** Record keys handed out by this instance, with the note that owns them. */
	private owners = new Map<string, string>();

	constructor(private plugin: LeafletAtmosphere) {}

	private get settings() {
		return this.plugin.settings;
	}

	private get app() {
		return this.plugin.app;
	}

	private frontmatter(file: TFile): FrontMatterCache | undefined {
		return this.app.metadataCache.getFileCache(file)?.frontmatter;
	}

	/** Record key of the document already published from this note, if any. */
	existingRkey(file: TFile, did: string): string | undefined {
		const uri =
			this.published.get(file.path)?.uri ??
			getString(this.frontmatter(file), this.settings.uriKey);
		const parsed = uri ? parseAtUri(uri) : null;
		if (!parsed || parsed.collection !== DOCUMENT_COLLECTION || parsed.repo !== did)
			return undefined;
		return parsed.rkey;
	}

	async publish(file: TFile, options: PublishOptions = {}): Promise<PublishResult> {
		const client = await this.plugin.getClient();
		const did = client.did;
		const fm = this.frontmatter(file);
		const s = this.settings;
		this.checkPublishFlag(fm);

		let rkey = this.existingRkey(file, did);
		const existing = rkey
			? await client.getRecord<StandardDocument>(DOCUMENT_COLLECTION, rkey)
			: null;
		rkey ??= await this.reservedOrNewRkey(client, file, fm);

		const site = this.resolveSite(fm, options, existing?.value.site, did);
		this.owners.set(rkey, file.path);
		const selfUrl = documentUrl(site, `/${rkey}`, this.publicationsFor(site));

		const images = new ImageUploader(
			this.app,
			client,
			s.maxImageWidth,
			s.uploadRemoteImages
		);
		const markdown = await new Preprocessor(this.app, s.embedMode, s.dataview).run(file);
		const converter = new MarkdownConverter({
			app: this.app,
			settings: s,
			images,
			sourcePath: file.path,
			strictLineBreaks: this.strictLineBreaks(),
			resolveBskyPost: (actor, postRkey) => this.resolveBskyPost(client, actor, postRkey),
			renderDiagram: (source) => renderMermaid(this.app, source, file.path),
			noteUrl: (target) =>
				target.path === file.path
					? Promise.resolve(selfUrl)
					: this.noteUrl(client, target),
		});
		const converted = await converter.convert(markdown);

		const title = (getString(fm, s.titleKey) ?? converted.title ?? file.basename).slice(
			0,
			5000
		);
		const description = getString(fm, s.descriptionKey);
		const tags = getTags(fm, s.tagsKey);
		const coverImage = await this.coverImage(images, fm, file.path, converted.warnings);
		const publishedAt =
			getDate(fm, s.publishedAtKey) ??
			existing?.value.publishedAt ??
			new Date().toISOString();

		const path = `/${rkey}`;
		const record: StandardDocument = {
			$type: "site.standard.document",
			site,
			path,
			title,
			publishedAt,
			...(description && { description: description.slice(0, 30000) }),
			...(tags.length > 0 && { tags }),
			...(coverImage && { coverImage }),
			...(converted.textContent && { textContent: converted.textContent }),
			...(existing?.value.bskyPostRef && { bskyPostRef: existing.value.bskyPostRef }),
			...(existing && { updatedAt: new Date().toISOString() }),
			preferences: this.preferences(fm),
			content: await this.content(
				client,
				converted.blocks,
				converted.pages,
				existing?.value.content?.pages?.[0]?.id
			),
		};

		const result = await client.putRecord(DOCUMENT_COLLECTION, rkey, record);
		const url = documentUrl(site, path, this.publicationsFor(site));
		this.published.set(file.path, { uri: result.uri, url });

		if (s.writeFrontmatter)
			await this.app.fileManager.processFrontMatter(
				file,
				(front: Record<string, unknown>) => {
					if (s.uriKey) front[s.uriKey] = result.uri;
					if (s.urlKey) front[s.urlKey] = url;
				}
			);

		return { uri: result.uri, url, created: !existing, warnings: converted.warnings };
	}

	async unpublish(file: TFile): Promise<boolean> {
		const client = await this.plugin.getClient();
		const rkey = this.existingRkey(file, client.did);
		if (!rkey) return false;
		await client.deleteRecord(DOCUMENT_COLLECTION, rkey);
		this.published.delete(file.path);
		await this.app.fileManager.processFrontMatter(
			file,
			(front: Record<string, unknown>) => {
				delete front[this.settings.uriKey];
				delete front[this.settings.urlKey];
				const key = this.settings.publishKey;
				if (key && front[key] === true) front[key] = false;
			}
		);
		return true;
	}

	/** URL of a linked note: published, or reserved when it is marked for publishing. */
	private async noteUrl(client: AtpClient, file: TFile): Promise<string | null> {
		const known =
			this.published.get(file.path)?.url ??
			getString(this.frontmatter(file), this.settings.urlKey);
		if (known && /^https?:\/\//.test(known)) return known;
		if (!this.settings.writeFrontmatter || !this.isMarked(file)) return null;
		let pending = this.reservations.get(file.path);
		if (!pending) {
			pending = this.reserve(client, file).catch((e) => {
				console.warn("[Leaflet] cannot reserve a link for", file.path, e);
				return null;
			});
			this.reservations.set(file.path, pending);
		}
		return (await pending)?.url ?? null;
	}

	/**
	 * Pick the record key and URL of a note before it is published. Only the URL is
	 * saved: the URI stays the mark of a published note.
	 */
	private async reserve(client: AtpClient, file: TFile): Promise<{ url: string }> {
		const fm = this.frontmatter(file);
		const did = client.did;
		const rkey = await this.newRecordKey(client, file, fm);
		this.owners.set(rkey, file.path);
		this.reserved.set(file.path, rkey);
		const site = this.resolveSite(fm, {}, undefined, did);
		const url = documentUrl(site, `/${rkey}`, this.publicationsFor(site));
		await this.app.fileManager.processFrontMatter(
			file,
			(front: Record<string, unknown>) => {
				if (this.settings.urlKey) front[this.settings.urlKey] = url;
			}
		);
		return { url };
	}

	/** Record key of a reserved note (its URL ends with it), or a new one. */
	private async reservedOrNewRkey(
		client: AtpClient,
		file: TFile,
		fm: FrontMatterCache | undefined
	): Promise<string> {
		const url = getString(fm, this.settings.urlKey);
		const reserved =
			this.reserved.get(file.path) ??
			(url ? decodeURIComponent(url.replace(/\/+$/, "").split("/").pop() ?? "") : "");
		if (reserved && isValidRecordKey(reserved)) {
			const owner = this.owners.get(reserved);
			const free =
				(!owner || owner === file.path) &&
				!(await client.getRecord(DOCUMENT_COLLECTION, reserved));
			if (free) return reserved;
		}
		return this.newRecordKey(client, file, fm);
	}

	isMarked(file: TFile): boolean {
		return getBoolean(this.frontmatter(file), this.settings.publishKey) === true;
	}

	private checkPublishFlag(fm: FrontMatterCache | undefined) {
		const key = this.settings.publishKey;
		if (!key) return;
		const flag = getBoolean(fm, key);
		if (flag === false) throw new Error(i18next.t("error.publishDisabled", { key }));
		if (flag !== true && this.settings.requirePublishFlag)
			throw new Error(i18next.t("error.notMarked", { key }));
	}

	private strictLineBreaks(): boolean {
		const vault = this.app.vault as unknown as { getConfig?: (key: string) => unknown };
		return vault.getConfig?.("strictLineBreaks") === true;
	}

	private async newRecordKey(
		client: AtpClient,
		file: TFile,
		fm: FrontMatterCache | undefined
	): Promise<string> {
		const explicit = getString(fm, this.settings.slugKey);
		if (!this.settings.useSlugAsRecordKey && !explicit) return nextTid();
		const slug = slugify(explicit ?? file.basename);
		if (!slug || !isValidRecordKey(slug)) return nextTid();
		const taken =
			this.owners.has(slug) || (await client.getRecord(DOCUMENT_COLLECTION, slug));
		if (taken) throw new Error(i18next.t("error.slugTaken", { slug }));
		return slug;
	}

	private resolveSite(
		fm: FrontMatterCache | undefined,
		options: PublishOptions,
		existingSite: string | undefined,
		did: string
	): string {
		const fromNote = getString(fm, PREFERENCE_KEYS.publication);
		let choice: string | undefined;
		if (fromNote !== undefined) {
			const lower = fromNote.toLowerCase();
			if (lower === "none" || lower === "standalone") choice = "";
			else {
				const pub = this.settings.publications.find(
					(p) =>
						p.uri === fromNote || p.name.toLowerCase() === lower || p.url === fromNote
				);
				if (!pub)
					throw new Error(i18next.t("error.unknownPublication", { name: fromNote }));
				choice = pub.uri;
			}
		}
		choice ??= options.site ?? existingSite ?? this.settings.defaultPublication;
		return choice && choice.startsWith("at://") ? choice : choice || standaloneSite(did);
	}

	private publicationsFor(site: string): PublicationInfo[] {
		return this.settings.publications.filter((p) => p.uri === site);
	}

	private preferences(fm: FrontMatterCache | undefined): DocumentPreferences {
		const s = this.settings;
		const pick = (key: string, fallback: boolean) => getBoolean(fm, key) ?? fallback;
		return {
			$type: "pub.leaflet.publication#preferences",
			showInDiscover: pick(PREFERENCE_KEYS.showInDiscover, s.showInDiscover),
			showComments: pick(PREFERENCE_KEYS.showComments, s.showComments),
			showMentions: pick(PREFERENCE_KEYS.showMentions, s.showMentions),
			showRecommends: pick(PREFERENCE_KEYS.showRecommends, s.showRecommends),
		};
	}

	private async coverImage(
		images: ImageUploader,
		fm: FrontMatterCache | undefined,
		sourcePath: string,
		warnings: string[]
	): Promise<BlobRef | undefined> {
		const value = getString(fm, this.settings.coverKey);
		if (!value) return undefined;
		const link = unwrapLink(value);
		try {
			const uploaded = await images.upload(link, sourcePath);
			if (uploaded) return uploaded.blob;
		} catch (e) {
			console.error("[Leaflet] cover upload failed", e);
		}
		warnings.push(link);
		return undefined;
	}

	/** Large documents are stored as a JSON blob, like Leaflet does. */
	private async content(
		client: AtpClient,
		blocks: LeafletBlock[],
		extraPages: LinearDocumentPage[],
		pageId?: string
	): Promise<LeafletContent> {
		const pages: LinearDocumentPage[] = [
			{
				$type: "pub.leaflet.pages.linearDocument",
				id: pageId ?? crypto.randomUUID(),
				blocks: blocks.map((block) => ({
					$type: "pub.leaflet.pages.linearDocument#block",
					block,
				})),
			},
			...extraPages,
		];
		const json = JSON.stringify(pages);
		if (utf8Length(json) <= BLOB_PAGES_THRESHOLD)
			return { $type: "pub.leaflet.content", pages };
		const encoded = new TextEncoder().encode(json);
		const blobPages = await client.uploadBlob(encoded.slice().buffer, "application/json");
		const blobs = collectBlobs(pages);
		return {
			$type: "pub.leaflet.content",
			pages: [],
			blobPages,
			...(blobs.length > 0 && { blobs }),
		};
	}

	private async resolveBskyPost(
		client: AtpClient,
		actor: string,
		rkey: string
	): Promise<StrongRef | null> {
		const did = actor.startsWith("did:") ? actor : await resolveHandle(actor);
		return client.getBskyPost(`at://${did}/app.bsky.feed.post/${rkey}`);
	}
}

function collectBlobs(value: unknown, out: BlobRef[] = []): BlobRef[] {
	if (Array.isArray(value)) for (const item of value) collectBlobs(item, out);
	else if (value && typeof value === "object") {
		if ((value as { $type?: string }).$type === "blob") out.push(value as BlobRef);
		else for (const item of Object.values(value)) collectBlobs(item, out);
	}
	return out;
}
