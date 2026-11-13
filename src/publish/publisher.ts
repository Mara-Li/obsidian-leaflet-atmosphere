import i18next from "i18next";
import type { FrontMatterCache, TFile } from "obsidian";
import type { AtpClient, ListedRecord } from "../atproto/client";
import { isValidRecordKey, nextTid, parseAtUri } from "../atproto/tid";
import { DOCUMENT_COLLECTION } from "../interfaces";
import type { PostTheme } from "../leaflet/fonts";
import { ImageUploader } from "../leaflet/images";
import { fetchLinkPreview, type LinkPreview } from "../leaflet/linkPreview";
import {
	documentUrl,
	fetchPublicationTheme,
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
import type Gazette from "../main";
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
import { findExistingPost, type RecoveryContext } from "./recovery";
import {
	isMarkedNote,
	noteTargets,
	type PostLink,
	readLinks,
	writeLinks,
} from "./targets";

const BLOB_PAGES_THRESHOLD = 100 * 1024;

export interface PublishResult {
	uri: string;
	url: string;
	title: string;
	/** Publication AT-URI, or the personal page address. */
	site: string;
	created: boolean;
	/** The note had lost its link: the existing post was found and updated. */
	recovered: boolean;
	/** DataviewJS queries left out because DataviewJS is disabled in Dataview. */
	skippedDataviewJs: number;
	warnings: string[];
}

export interface PublishOptions {
	/** Publication AT-URI, or "" for a standalone document. */
	site?: string;
}

interface ExistingPosts {
	/** Posts of the note that still exist, by site. */
	bySite: Map<
		string,
		{ rkey: string; record: ListedRecord<StandardDocument>; url?: string }
	>;
	/** Record keys of posts that no longer exist: reused when publishing again. */
	missing: string[];
}

/** Work done once per note, shared by its publications. */
interface NoteWork {
	file: TFile;
	fm: FrontMatterCache | undefined;
	markdown: string;
	preprocessor: Preprocessor;
	images: ImageUploader;
}

export class Publisher {
	/** Posts published by this instance, by note: the metadata cache may lag behind. */
	readonly published = new Map<string, PostLink[]>();
	/** Future addresses of linked notes that are marked but not published yet. */
	private reservations = new Map<string, Promise<{ url: string } | null>>();
	private reserved = new Map<string, string>();
	/** Record keys handed out by this instance, with the note that owns them. */
	private owners = new Map<string, string>();
	private documents: Promise<ListedRecord<StandardDocument>[]> | null = null;
	private mentions = new Map<string, Promise<string | null>>();
	private previews = new Map<string, Promise<LinkPreview>>();
	private themes = new Map<string, Promise<Partial<PublicationInfo> | null>>();

	constructor(private plugin: Gazette) {}

	private get settings() {
		return this.plugin.settings;
	}

	private get app() {
		return this.plugin.app;
	}

	private frontmatter(file: TFile): FrontMatterCache | undefined {
		return this.app.metadataCache.getFileCache(file)?.frontmatter;
	}

	/** Posts of a note in the account: published in this run, or saved in the note. */
	private links(file: TFile, did: string): PostLink[] {
		const links =
			this.published.get(file.path) ?? readLinks(this.frontmatter(file), this.settings);
		return links.filter((l) => {
			const parsed = parseAtUri(l.uri);
			return parsed?.collection === DOCUMENT_COLLECTION && parsed.repo === did;
		});
	}

	private async existingPosts(client: AtpClient, file: TFile): Promise<ExistingPosts> {
		const out: ExistingPosts = { bySite: new Map(), missing: [] };
		for (const link of this.links(file, client.did)) {
			const rkey = parseAtUri(link.uri)!.rkey;
			const record = await client.getRecord<StandardDocument>(DOCUMENT_COLLECTION, rkey);
			if (record?.value.site)
				out.bySite.set(record.value.site, { rkey, record, url: link.url });
			else out.missing.push(rkey);
		}
		return out;
	}

	/**
	 * Publish a note to its publications: those it names, else those it is already
	 * published in, else the default one. One post per publication.
	 */
	async publish(file: TFile, options: PublishOptions = {}): Promise<PublishResult[]> {
		const client = await this.plugin.getClient();
		const did = client.did;
		const fm = this.frontmatter(file);
		const s = this.settings;
		this.checkPublishFlag(fm);

		const existing = await this.existingPosts(client, file);
		const chosen =
			options.site === undefined
				? undefined
				: options.site.startsWith("at://")
					? options.site
					: standaloneSite(did);
		const targets = noteTargets(s, fm, did) ??
			(chosen ? [chosen] : null) ??
			(existing.bySite.size > 0 ? [...existing.bySite.keys()] : null) ?? [
				s.defaultPublication.startsWith("at://")
					? s.defaultPublication
					: standaloneSite(did),
			];

		const preprocessor = new Preprocessor(
			this.app,
			s.embedMode,
			s.dataview,
			s.replacements
		);
		const work: NoteWork = {
			file,
			fm,
			preprocessor,
			markdown: await preprocessor.run(file),
			images: new ImageUploader(this.app, client, s.maxImageWidth, s.uploadRemoteImages),
		};

		const results: PublishResult[] = [];
		for (const [index, site] of targets.entries()) {
			let post = existing.bySite.get(site) ?? null;
			let recovered = false;
			if (!post) {
				// No link to a post in this publication: it may still exist (sync issue…)
				const found = await findExistingPost(
					this.recoveryContext(client),
					file,
					fm,
					site
				);
				if (found) {
					post = { rkey: found.rkey, record: found.record };
					recovered = true;
				}
			}
			const rkey =
				post?.rkey ??
				existing.missing.shift() ??
				(index === 0
					? await this.reservedOrNewRkey(client, file, fm)
					: await this.newRecordKey(client, file, fm, site));
			this.owners.set(rkey, file.path);
			const result = await this.publishTo(client, work, site, rkey, post?.record ?? null);
			results.push({ ...result, recovered });
			existing.bySite.set(site, {
				rkey,
				record: { uri: result.uri, cid: "", value: { site } as StandardDocument },
				url: result.url,
			});
		}

		// Posts in publications the note no longer names are kept, with their links
		const links: PostLink[] = [...existing.bySite.entries()].map(([site, post]) => ({
			uri: `at://${did}/${DOCUMENT_COLLECTION}/${post.rkey}`,
			url: post.url ?? documentUrl(site, `/${post.rkey}`, this.publicationsFor(site)),
			site,
		}));
		this.published.set(file.path, links);
		if (s.writeFrontmatter)
			await this.app.fileManager.processFrontMatter(
				file,
				(front: Record<string, unknown>) => writeLinks(front, s, links)
			);
		return results;
	}

	/** Publish the note to one publication, at the given record key. */
	private async publishTo(
		client: AtpClient,
		work: NoteWork,
		site: string,
		rkey: string,
		existing: ListedRecord<StandardDocument> | null
	): Promise<PublishResult> {
		const { file, fm, images, preprocessor } = work;
		const s = this.settings;
		const path = `/${rkey}`;
		const selfUrl = documentUrl(site, path, this.publicationsFor(site));
		const converter = new MarkdownConverter({
			app: this.app,
			settings: s,
			images,
			sourcePath: file.path,
			strictLineBreaks: this.strictLineBreaks(),
			resolveBskyPost: (actor, postRkey) => this.resolveBskyPost(client, actor, postRkey),
			resolveMention: (handle) => this.resolveMention(client, handle),
			linkPreview: (url) => this.linkPreview(url),
			renderDiagram: (source) => renderMermaid(this.app, source, file.path),
			theme: await this.themeOf(client, site),
			embeds: preprocessor.embeds,
			noteUrl: (target) =>
				target.path === file.path
					? Promise.resolve(selfUrl)
					: this.noteUrl(client, target, site),
		});
		const converted = await converter.convert(work.markdown);

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
		return {
			uri: result.uri,
			url: selfUrl,
			title,
			site,
			created: !existing,
			recovered: false,
			skippedDataviewJs: preprocessor.skippedDataviewJs,
			warnings: converted.warnings,
		};
	}

	/**
	 * Restore the links of a note to its existing posts without publishing it.
	 * Returns the posts found.
	 */
	async pull(file: TFile): Promise<{ uri: string; url: string; by: string }[]> {
		const client = await this.plugin.getClient();
		const fm = this.frontmatter(file);
		const existing = await this.existingPosts(client, file);
		const found: { uri: string; url: string; by: string; site: string }[] = [
			...existing.bySite.entries(),
		].map(([site, post]) => ({
			uri: post.record.uri,
			url: post.url ?? documentUrl(site, `/${post.rkey}`, this.publicationsFor(site)),
			by: "uri",
			site,
		}));
		const targets = noteTargets(this.settings, fm, client.did) ?? [
			this.settings.defaultPublication.startsWith("at://")
				? this.settings.defaultPublication
				: standaloneSite(client.did),
		];
		for (const site of targets) {
			if (existing.bySite.has(site)) continue;
			const post = await findExistingPost(this.recoveryContext(client), file, fm, site);
			if (!post) continue;
			const { path } = post.record.value;
			found.push({
				uri: post.record.uri,
				url: documentUrl(site, path ?? `/${post.rkey}`, this.publicationsFor(site)),
				by: post.by,
				site,
			});
		}
		if (found.length === 0) return [];
		await this.app.fileManager.processFrontMatter(
			file,
			(front: Record<string, unknown>) => writeLinks(front, this.settings, found)
		);
		return found;
	}

	private recoveryContext(client: AtpClient): RecoveryContext {
		return {
			app: this.app,
			client,
			settings: this.settings,
			listDocuments: () => {
				this.documents ??= client
					.listRecords<StandardDocument>(DOCUMENT_COLLECTION)
					.catch(() => []);
				return this.documents;
			},
			ownerOf: (rkey) => this.owners.get(rkey),
		};
	}

	/** Delete a post of the account; its note, if any, keeps its other posts. */
	async deletePost(uri: string, file?: TFile | null): Promise<void> {
		const client = await this.plugin.getClient();
		const parsed = parseAtUri(uri);
		if (
			!parsed ||
			parsed.collection !== DOCUMENT_COLLECTION ||
			parsed.repo !== client.did
		)
			throw new Error(i18next.t("error.notOwnPost"));
		const links = file ? this.links(file, client.did) : [];
		if (file && links.length <= 1 && links[0]?.uri === uri) {
			await this.unpublish(file);
			return;
		}
		await client.deleteRecord(DOCUMENT_COLLECTION, parsed.rkey);
		if (!file) return;
		const remaining = readLinks(this.frontmatter(file), this.settings).filter(
			(l) => l.uri !== uri
		);
		this.published.delete(file.path);
		await this.app.fileManager.processFrontMatter(
			file,
			(front: Record<string, unknown>) => writeLinks(front, this.settings, remaining)
		);
	}

	/** Delete every post of a note and unmark it. */
	async unpublish(file: TFile): Promise<boolean> {
		const client = await this.plugin.getClient();
		const links = this.links(file, client.did);
		if (links.length === 0) return false;
		for (const link of links)
			await client.deleteRecord(DOCUMENT_COLLECTION, parseAtUri(link.uri)!.rkey);
		this.published.delete(file.path);
		await this.app.fileManager.processFrontMatter(
			file,
			(front: Record<string, unknown>) => {
				writeLinks(front, this.settings, []);
				const keys = [
					this.settings.publishKey,
					...this.settings.publications.map((p) => p.publishKey ?? ""),
				];
				for (const key of keys) if (key && front[key] === true) front[key] = false;
			}
		);
		return true;
	}

	/**
	 * URL of a linked note, in the publication being written when it is published
	 * there; reserved when the note is marked but not published yet.
	 */
	private async noteUrl(
		client: AtpClient,
		file: TFile,
		site: string
	): Promise<string | null> {
		const links =
			this.published.get(file.path) ?? readLinks(this.frontmatter(file), this.settings);
		const base = this.publicationsFor(site)[0]?.url;
		const known =
			links.find((l) => l.site === site)?.url ??
			(base ? links.find((l) => l.url?.startsWith(base))?.url : undefined) ??
			links[0]?.url ??
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
	 * Pick the record key and URL of a note before it is published, in its first
	 * publication. Only the URL is saved: the URI stays the mark of a published note.
	 */
	private async reserve(client: AtpClient, file: TFile): Promise<{ url: string }> {
		const fm = this.frontmatter(file);
		const did = client.did;
		const rkey = await this.newRecordKey(client, file, fm);
		this.owners.set(rkey, file.path);
		this.reserved.set(file.path, rkey);
		const site =
			noteTargets(this.settings, fm, did)?.[0] ??
			(this.settings.defaultPublication.startsWith("at://")
				? this.settings.defaultPublication
				: standaloneSite(did));
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
		return isMarkedNote(this.settings, this.frontmatter(file));
	}

	private checkPublishFlag(fm: FrontMatterCache | undefined) {
		const key = this.settings.publishKey;
		if (!key) return;
		const flag = getBoolean(fm, key);
		if (flag === false) throw new Error(i18next.t("error.publishDisabled", { key }));
		if (!isMarkedNote(this.settings, fm) && this.settings.requirePublishFlag)
			throw new Error(i18next.t("error.notMarked", { key }));
	}

	private strictLineBreaks(): boolean {
		const vault = this.app.vault as unknown as { getConfig?: (key: string) => unknown };
		return vault.getConfig?.("strictLineBreaks") === true;
	}

	/**
	 * Record key of a new post: a random one, or the slug. For an extra publication,
	 * a slug already used by the note gets the publication name appended.
	 */
	private async newRecordKey(
		client: AtpClient,
		file: TFile,
		fm: FrontMatterCache | undefined,
		extraSite?: string
	): Promise<string> {
		const explicit = getString(fm, this.settings.slugKey);
		if (!this.settings.useSlugAsRecordKey && !explicit) return nextTid();
		const slug = slugify(explicit ?? file.basename);
		if (!slug || !isValidRecordKey(slug)) return nextTid();
		const taken = async (key: string) =>
			this.owners.has(key) || !!(await client.getRecord(DOCUMENT_COLLECTION, key));
		if (!(await taken(slug))) return slug;
		if (extraSite === undefined) throw new Error(i18next.t("error.slugTaken", { slug }));
		const name = this.publicationsFor(extraSite)[0]?.name ?? "";
		const suffixed = slugify(`${slug}-${name}`);
		return isValidRecordKey(suffixed) && !(await taken(suffixed)) ? suffixed : nextTid();
	}

	/** Preview of a linked page, fetched once per run. */
	private linkPreview(url: string): Promise<LinkPreview> {
		let pending = this.previews.get(url);
		if (!pending) {
			pending = fetchLinkPreview(url).catch(() => ({}));
			this.previews.set(url, pending);
		}
		return pending;
	}

	/** DID of a mentioned handle, resolved once per run. */
	private resolveMention(client: AtpClient, handle: string): Promise<string | null> {
		let pending = this.mentions.get(handle);
		if (!pending) {
			pending = client.resolveHandle(handle);
			this.mentions.set(handle, pending);
		}
		return pending;
	}

	/** Fonts and text color of the publication, for HTML blocks. */
	private async themeOf(client: AtpClient, site: string): Promise<PostTheme> {
		if (!site.startsWith("at://")) return {};
		// Read the publication again: its theme may have changed since the last refresh
		let pending = this.themes.get(site);
		if (!pending) {
			pending = fetchPublicationTheme(client, site);
			this.themes.set(site, pending);
		}
		const fresh = await pending;
		const { bodyFont, headingFont, textColor, backgroundColor, accentColor } =
			fresh ?? this.settings.publications.find((p) => p.uri === site) ?? {};
		return { bodyFont, headingFont, textColor, backgroundColor, accentColor };
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
		const did = actor.startsWith("did:")
			? actor
			: await this.resolveMention(client, actor.toLowerCase());
		return did ? client.getBskyPost(`at://${did}/app.bsky.feed.post/${rkey}`) : null;
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
