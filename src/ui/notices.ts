import i18next from "i18next";
import { Notice, setIcon } from "obsidian";

type Tone = "success" | "info" | "warning" | "error";

const ICONS: Record<Tone, string> = {
	success: "circle-check",
	info: "info",
	warning: "alert-triangle",
	error: "circle-x",
};

interface NoticeContent {
	tone: Tone;
	heading: string;
	/** Bold line under the heading, e.g. the post title. */
	title?: string;
	/** Muted lines, e.g. the publication and the address. */
	meta?: string | string[];
	actions?: {
		label: string;
		onClick: (notice: Notice, button: HTMLButtonElement) => void;
	}[];
	duration?: number;
}

/** A notice with an icon, a heading, optional details and action buttons. */
export function richNotice(content: NoticeContent): Notice {
	let notice: Notice | null = null;
	// biome-ignore lint/correctness/noUndeclaredVariables: Obsidian globals
	const fragment = createFragment((f) => {
		const root = f.createDiv({ cls: `gazette-notice is-${content.tone}` });
		const header = root.createDiv({ cls: "gazette-notice-header" });
		setIcon(header.createSpan({ cls: "gazette-notice-icon" }), ICONS[content.tone]);
		header.createSpan({ text: content.heading });
		if (content.title)
			root.createDiv({ cls: "gazette-notice-title", text: content.title });
		for (const line of [content.meta ?? []].flat())
			root.createDiv({ cls: "gazette-notice-meta", text: line });
		if (content.actions?.length) {
			const actions = root.createDiv({ cls: "gazette-notice-actions" });
			for (const action of content.actions) {
				const button = actions.createEl("button", { text: action.label });
				button.addEventListener("click", (e) => {
					// A click on the notice closes it: let the action decide
					e.stopPropagation();
					if (notice) action.onClick(notice, button);
				});
			}
		}
	});
	notice = new Notice(fragment, content.duration ?? 8000);
	return notice;
}

/** "Published" notice of a post: its title, where it lives, open and copy buttons. */
export function postNotice(
	heading: string,
	post: { title: string; url: string; publication: string }
) {
	const address = post.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
	return richNotice({
		tone: "success",
		heading,
		title: post.title,
		meta: [post.publication, address],
		actions: [
			{
				label: i18next.t("notice.open"),
				onClick: (notice) => {
					window.open(post.url);
					notice.hide();
				},
			},
			{
				label: i18next.t("notice.copy"),
				onClick: (notice, button) => {
					void navigator.clipboard.writeText(post.url).then(() => {
						button.setText(i18next.t("notice.copied"));
						window.setTimeout(() => notice.hide(), 1200);
					});
				},
			},
		],
	});
}
