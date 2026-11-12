import i18next from "i18next";
import { debounce, Notice, setIcon, type TFile } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { parseAtUri } from "../../atproto/tid";
import {
	publishMarkedFiles,
	publishFile,
	publishSelection,
	showError,
} from "../../commands/actions";
import { DOCUMENT_COLLECTION, documentUrl } from "../../leaflet/publications";
import type { StandardDocument } from "../../leaflet/types";
import type LeafletAtmosphere from "../../main";
import { deletePosts } from "../../publish/deletions";
import { notesByUri } from "../../publish/notes";
import { linkNote, relinkNotes, unlinkedNotes } from "../../publish/relink";
import { ConfirmModal } from "../confirmModal";
import { NoteSuggestModal } from "../noteSuggest";

interface Post {
	uri: string;
	rkey: string;
	title: string;
	site: string;
	publication: string;
	url: string;
	publishedAt: string;
}

function Icon({ name }: { name: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (ref.current) setIcon(ref.current, name);
	}, [name]);
	return <span class="leaflet-atmosphere-icon" ref={ref} />;
}

function IconButton(props: {
	icon: string;
	label: string;
	onClick: () => void;
	warning?: boolean;
}) {
	return (
		<button
			class={`clickable-icon${props.warning ? " leaflet-atmosphere-danger" : ""}`}
			aria-label={props.label}
			onClick={props.onClick}
		>
			<Icon name={props.icon} />
		</button>
	);
}

async function loadPosts(plugin: LeafletAtmosphere): Promise<Post[]> {
	const client = await plugin.getClient();
	const records = await client.listRecords<StandardDocument>(DOCUMENT_COLLECTION);
	const { publications } = plugin.settings;
	return records
		.map((r) => {
			const site = r.value.site ?? "";
			const rkey = parseAtUri(r.uri)?.rkey ?? "";
			const pub = publications.find((p) => p.uri === site);
			return {
				uri: r.uri,
				rkey,
				title: r.value.title || rkey,
				site,
				publication:
					pub?.name ??
					(site.startsWith("at://") ? site : i18next.t("manager.personalPage")),
				url: documentUrl(site, r.value.path ?? `/${rkey}`, publications),
				publishedAt: r.value.publishedAt ?? "",
			};
		})
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function PostsManager({ plugin }: { plugin: LeafletAtmosphere }) {
	const { app } = plugin;
	const [records, setRecords] = useState<Post[] | null>(null);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [site, setSite] = useState("");
	const [orphans, setOrphans] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	// Bumped when notes change, to match posts and notes again without reloading
	const [notesVersion, setNotesVersion] = useState(0);

	const refresh = async () => {
		setError("");
		try {
			setRecords(await loadPosts(plugin));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setRecords([]);
		}
	};

	useEffect(() => {
		void refresh();
		const reload = debounce(() => void refresh(), 300, true);
		const rematch = debounce(() => setNotesVersion((v) => v + 1), 200, true);
		const pluginRef = plugin.events.on("changed", reload);
		const cacheRef = app.metadataCache.on("changed", rematch);
		const vaultRefs = [app.vault.on("delete", rematch), app.vault.on("rename", rematch)];
		return () => {
			plugin.events.offref(pluginRef);
			app.metadataCache.offref(cacheRef);
			for (const ref of vaultRefs) app.vault.offref(ref);
		};
	}, []);

	const notes = useMemo(() => notesByUri(app, plugin.settings), [records, notesVersion]);
	const noteOf = (post: Post) => notes.get(post.uri) ?? null;

	const sites = useMemo(
		() => [...new Map((records ?? []).map((p) => [p.site, p.publication])).entries()],
		[records]
	);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (records ?? []).filter((p) => {
			const file = notes.get(p.uri);
			return (
				(!q ||
					p.title.toLowerCase().includes(q) ||
					file?.path.toLowerCase().includes(q)) &&
				(!site || p.site === site) &&
				(!orphans || !file)
			);
		});
	}, [records, notes, query, site, orphans]);

	const toggle = (uri: string) => {
		const next = new Set(selected);
		if (next.has(uri)) next.delete(uri);
		else next.add(uri);
		setSelected(next);
	};

	const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.uri));
	const toggleAll = () =>
		setSelected(allSelected ? new Set() : new Set(visible.map((p) => p.uri)));
	const selectedPosts = visible.filter((p) => selected.has(p.uri));
	const selectedNotes = selectedPosts.map(noteOf).filter((f): f is TFile => f !== null);

	const remove = (targets: Post[]) => {
		const names = targets.map((p) => p.title);
		const shown = names.slice(0, 5);
		if (names.length > shown.length)
			shown.push(i18next.t("modal.more", { count: names.length - shown.length }));
		new ConfirmModal(
			app,
			i18next.t("manager.deleteTitle", { count: targets.length }),
			i18next.t("manager.deleteDesc", { list: shown.join(", ") }),
			() => {
				setSelected(new Set());
				void deletePosts(
					plugin,
					targets.map((p) => ({ name: p.title, uri: p.uri, file: noteOf(p) }))
				);
			}
		).open();
	};

	const relink = async () => {
		const orphanPosts = (records ?? []).filter((p) => !notes.has(p.uri));
		try {
			const linked = await relinkNotes(plugin, orphanPosts);
			new Notice(
				linked.length > 0
					? i18next.t("manager.relinked", { count: linked.length })
					: i18next.t("manager.nothingToRelink")
			);
		} catch (e) {
			showError(e);
		}
	};

	const chooseNote = (post: Post) =>
		new NoteSuggestModal(app, unlinkedNotes(plugin), (file) => {
			void linkNote(plugin, file, post).then(
				() => new Notice(i18next.t("manager.linked", { name: file.basename }))
			);
		}).open();

	const openNote = (file: TFile) => void app.workspace.getLeaf(false).openFile(file);

	return (
		<div class="leaflet-atmosphere-manager">
			<div class="leaflet-atmosphere-manager-toolbar">
				<input
					type="search"
					placeholder={i18next.t("manager.search")}
					value={query}
					onInput={(e) => setQuery(e.currentTarget.value)}
				/>
				<select
					class="dropdown"
					value={site}
					onChange={(e) => setSite(e.currentTarget.value)}
				>
					<option value="">{i18next.t("manager.allPublications")}</option>
					{sites.map(([uri, name]) => (
						<option key={uri} value={uri}>
							{name}
						</option>
					))}
				</select>
				<label class="leaflet-atmosphere-manager-check">
					<input
						type="checkbox"
						checked={orphans}
						onChange={(e) => setOrphans(e.currentTarget.checked)}
					/>
					{i18next.t("manager.onlyOrphans")}
				</label>
				<IconButton
					icon="refresh-cw"
					label={i18next.t("manager.refresh")}
					onClick={() => void refresh()}
				/>
			</div>
			<div class="leaflet-atmosphere-manager-toolbar">
				<button onClick={() => void relink()}>
					<Icon name="link" />
					{i18next.t("manager.relink")}
				</button>
				<button onClick={() => publishMarkedFiles(plugin)}>
					<Icon name="send" />
					{i18next.t("manager.publishMarked")}
				</button>
			</div>

			{error && <p class="leaflet-atmosphere-manager-error">{error}</p>}
			{records === null && !error && (
				<p class="leaflet-atmosphere-muted">{i18next.t("manager.loading")}</p>
			)}
			{records !== null && !error && (
				<>
					<div class="leaflet-atmosphere-manager-summary">
						<label class="leaflet-atmosphere-manager-check">
							<input type="checkbox" checked={allSelected} onChange={toggleAll} />
							{i18next.t("manager.selectAll")}
						</label>
						<span class="leaflet-atmosphere-muted">
							{i18next.t("manager.count", { count: visible.length })}
						</span>
						<span class="leaflet-atmosphere-manager-spacer" />
						<button
							disabled={selectedNotes.length === 0}
							onClick={() => publishSelection(plugin, selectedNotes)}
						>
							{i18next.t("manager.publishSelected", { count: selectedNotes.length })}
						</button>
						<button
							class="mod-warning"
							disabled={selectedPosts.length === 0}
							onClick={() => remove(selectedPosts)}
						>
							{i18next.t("manager.deleteSelected", { count: selectedPosts.length })}
						</button>
					</div>
					{visible.length === 0 && (
						<p class="leaflet-atmosphere-muted">{i18next.t("manager.empty")}</p>
					)}
					<ul class="leaflet-atmosphere-manager-list">
						{visible.map((post) => {
							const file = noteOf(post);
							return (
								<li
									key={post.uri}
									class="leaflet-atmosphere-manager-row"
									data-uri={post.uri}
								>
									<input
										type="checkbox"
										checked={selected.has(post.uri)}
										onChange={() => toggle(post.uri)}
									/>
									<div class="leaflet-atmosphere-manager-main">
										<a href={post.url} class="leaflet-atmosphere-manager-title">
											{post.title}
										</a>
										<div class="leaflet-atmosphere-manager-meta">
											<span>{post.publication}</span>
											{post.publishedAt && (
												<span>{new Date(post.publishedAt).toLocaleDateString()}</span>
											)}
											{file ? (
												<a
													class="leaflet-atmosphere-manager-note"
													onClick={(e) => {
														e.preventDefault();
														openNote(file);
													}}
												>
													{file.path}
												</a>
											) : (
												<span class="leaflet-atmosphere-manager-orphan">
													{i18next.t("manager.noNote")}
												</span>
											)}
										</div>
									</div>
									<div class="leaflet-atmosphere-manager-actions">
										{file ? (
											<>
												<IconButton
													icon="file-text"
													label={i18next.t("manager.openNote")}
													onClick={() => openNote(file)}
												/>
												<IconButton
													icon="send"
													label={i18next.t("manager.publishNote")}
													onClick={() => void publishFile(plugin, file)}
												/>
											</>
										) : (
											<IconButton
												icon="link"
												label={i18next.t("manager.linkNote")}
												onClick={() => chooseNote(post)}
											/>
										)}
										<IconButton
											icon="external-link"
											label={i18next.t("manager.openPost")}
											onClick={() => window.open(post.url)}
										/>
										<IconButton
											icon="trash-2"
											label={i18next.t("manager.delete")}
											warning
											onClick={() => remove([post])}
										/>
									</div>
								</li>
							);
						})}
					</ul>
				</>
			)}
		</div>
	);
}
