import i18next from "i18next";
import { setIcon, type TFile } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { parseAtUri } from "../../atproto/tid";
import { DOCUMENT_COLLECTION, documentUrl } from "../../leaflet/publications";
import type { StandardDocument } from "../../leaflet/types";
import type LeafletAtmosphere from "../../main";
import { deletePosts } from "../../publish/deletions";
import { notesByUri } from "../../publish/notes";
import { ConfirmModal } from "../confirmModal";

interface Post {
	uri: string;
	title: string;
	site: string;
	publication: string;
	url: string;
	publishedAt: string;
	file: TFile | null;
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
	const notes = notesByUri(plugin.app, plugin.settings);
	const { publications } = plugin.settings;
	return records
		.map((r) => {
			const site = r.value.site ?? "";
			const rkey = parseAtUri(r.uri)?.rkey ?? "";
			const pub = publications.find((p) => p.uri === site);
			return {
				uri: r.uri,
				title: r.value.title || rkey,
				site,
				publication:
					pub?.name ??
					(site.startsWith("at://") ? site : i18next.t("manager.personalPage")),
				url: documentUrl(site, r.value.path ?? `/${rkey}`, publications),
				publishedAt: r.value.publishedAt ?? "",
				file: notes.get(r.uri) ?? null,
			};
		})
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function PostsManager({ plugin }: { plugin: LeafletAtmosphere }) {
	const [posts, setPosts] = useState<Post[] | null>(null);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [site, setSite] = useState("");
	const [orphans, setOrphans] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const refresh = async () => {
		setPosts(null);
		setError("");
		try {
			setPosts(await loadPosts(plugin));
			setSelected(new Set());
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setPosts([]);
		}
	};

	useEffect(() => {
		void refresh();
	}, []);

	const sites = useMemo(
		() => [...new Map((posts ?? []).map((p) => [p.site, p.publication])).entries()],
		[posts]
	);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (posts ?? []).filter(
			(p) =>
				(!q ||
					p.title.toLowerCase().includes(q) ||
					p.file?.path.toLowerCase().includes(q)) &&
				(!site || p.site === site) &&
				(!orphans || !p.file)
		);
	}, [posts, query, site, orphans]);

	const toggle = (uri: string) => {
		const next = new Set(selected);
		if (next.has(uri)) next.delete(uri);
		else next.add(uri);
		setSelected(next);
	};

	const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.uri));
	const toggleAll = () =>
		setSelected(allSelected ? new Set() : new Set(visible.map((p) => p.uri)));

	const remove = (targets: Post[]) => {
		const names = targets.map((p) => p.title);
		const shown = names.slice(0, 5);
		if (names.length > shown.length)
			shown.push(i18next.t("modal.more", { count: names.length - shown.length }));
		new ConfirmModal(
			plugin.app,
			i18next.t("manager.deleteTitle", { count: targets.length }),
			i18next.t("manager.deleteDesc", { list: shown.join(", ") }),
			() => {
				void deletePosts(
					plugin,
					targets.map((p) => ({ name: p.title, uri: p.uri, file: p.file }))
				).then(refresh);
			}
		).open();
	};

	const openNote = (file: TFile) =>
		void plugin.app.workspace.getLeaf(false).openFile(file);
	const selectedPosts = visible.filter((p) => selected.has(p.uri));

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
				<button
					class="mod-warning"
					disabled={selectedPosts.length === 0}
					onClick={() => remove(selectedPosts)}
				>
					{i18next.t("manager.deleteSelected", { count: selectedPosts.length })}
				</button>
			</div>

			{error && <p class="leaflet-atmosphere-manager-error">{error}</p>}
			{posts === null && (
				<p class="leaflet-atmosphere-muted">{i18next.t("manager.loading")}</p>
			)}
			{posts !== null && !error && (
				<>
					<div class="leaflet-atmosphere-manager-summary">
						<label class="leaflet-atmosphere-manager-check">
							<input type="checkbox" checked={allSelected} onChange={toggleAll} />
							{i18next.t("manager.selectAll")}
						</label>
						<span class="leaflet-atmosphere-muted">
							{i18next.t("manager.count", { count: visible.length })}
						</span>
					</div>
					{visible.length === 0 && (
						<p class="leaflet-atmosphere-muted">{i18next.t("manager.empty")}</p>
					)}
					<ul class="leaflet-atmosphere-manager-list">
						{visible.map((post) => (
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
										{post.file ? (
											<a
												class="leaflet-atmosphere-manager-note"
												onClick={(e) => {
													e.preventDefault();
													openNote(post.file!);
												}}
											>
												{post.file.path}
											</a>
										) : (
											<span class="leaflet-atmosphere-manager-orphan">
												{i18next.t("manager.noNote")}
											</span>
										)}
									</div>
								</div>
								<div class="leaflet-atmosphere-manager-actions">
									{post.file && (
										<IconButton
											icon="file-text"
											label={i18next.t("manager.openNote")}
											onClick={() => openNote(post.file!)}
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
						))}
					</ul>
				</>
			)}
		</div>
	);
}
