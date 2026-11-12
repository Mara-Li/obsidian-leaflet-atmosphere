/**
 * Dataview queries converted to Markdown.
 * Adapted from Enveloppe (Mara-Li), itself based on obsidian-digital-garden (oleeskild)
 * and saberzero1's executeJs wait loop.
 * @source https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/conversion/compiler/dataview.ts
 */
import { type App, Component, htmlToMarkdown } from "obsidian";

interface DataviewApi {
	settings: {
		dataviewJsKeyword?: string;
		inlineQueryPrefix?: string;
		inlineJsQueryPrefix?: string;
		renderNullAs?: string;
		enableDataviewJs?: boolean;
		enableInlineDataviewJs?: boolean;
		defaultDateFormat?: string;
		defaultDateTimeFormat?: string;
	};
	tryQueryMarkdown(query: string, originFile?: string): Promise<string>;
	executeJs(
		code: string,
		container: HTMLElement,
		component: Component,
		filePath: string
	): Promise<void>;
	evaluateInline(
		query: string,
		originFile: string
	): { successful: boolean; value?: unknown; error?: string };
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface LuxonDateTime {
	isLuxonDateTime: true;
	hour: number;
	minute: number;
	second: number;
	toFormat(format: string): string;
}

interface LuxonDuration {
	isLuxonDuration: true;
	toHuman?(): string;
	toISO(): string;
}

/** Dataview literals as Dataview shows them: dates with its formats, lists joined. */
function literalToString(value: unknown, settings: DataviewApi["settings"]): string {
	if (value === null || value === undefined) return "";
	if (Array.isArray(value))
		return value.map((v) => literalToString(v, settings)).join(", ");
	if (typeof value === "object" && "isLuxonDateTime" in value) {
		const date = value as LuxonDateTime;
		const midnight = date.hour === 0 && date.minute === 0 && date.second === 0;
		return date.toFormat(
			midnight
				? (settings.defaultDateFormat ?? "MMMM dd, yyyy")
				: (settings.defaultDateTimeFormat ?? "h:mm a - MMMM dd, yyyy")
		);
	}
	if (typeof value === "object" && "isLuxonDuration" in value) {
		const duration = value as LuxonDuration;
		return duration.toHuman?.() ?? duration.toISO();
	}
	if (typeof value === "object") {
		const custom = value.toString !== Object.prototype.toString;
		// eslint-disable-next-line @typescript-eslint/no-base-to-string -- checked above
		return custom ? String(value) : JSON.stringify(value);
	}
	if (typeof value === "string") return value;
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	)
		return value.toString();
	return "";
}

/** Queries written inside a callout keep their `>` prefix in the output. */
function sanitizeQuery(query: string): { inCallout: boolean; query: string } {
	const lines = query.split("\n");
	if (!lines.some((l) => l.startsWith(">"))) return { inCallout: false, query };
	return {
		inCallout: true,
		query: lines.map((l) => (l.startsWith(">") ? l.slice(1).trim() : l)).join("\n"),
	};
}

function inCallout(markdown: string): string {
	return ` ${markdown.split("\n").join("\n> ")}`;
}

const delay = (ms: number) =>
	new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export class DataviewCompiler {
	/** DataviewJS queries left out because DataviewJS is disabled in Dataview. */
	skippedJs = 0;

	private constructor(
		private api: DataviewApi | null,
		private enabled: boolean
	) {}

	/** Null when Dataview is not installed: queries are then left untouched. */
	static create(app: App, enabled: boolean): DataviewCompiler | null {
		const plugin = app.plugins.getPlugin("dataview") as { api?: DataviewApi } | null;
		const api = plugin?.api ?? null;
		if (!api) return null;
		return new DataviewCompiler(api, enabled);
	}

	async convert(text: string, path: string): Promise<string> {
		if (!this.api) return text;
		const api = this.api;
		const jsKeyword = escapeRegex(api.settings.dataviewJsKeyword || "dataviewjs");
		const inlinePrefix = escapeRegex(api.settings.inlineQueryPrefix || "=");
		const inlineJsPrefix = escapeRegex(api.settings.inlineJsQueryPrefix || "$=");
		const jsBlocks = new RegExp(`\`\`\`${jsKeyword}\\s(.+?)\`\`\``, "gsm");
		const inlineJs = new RegExp(`\`${inlineJsPrefix}(.+?)\``, "gsm");

		// DataviewJS disabled in Dataview: drop the queries rather than publish its warning
		if (this.enabled && api.settings.enableDataviewJs === false) {
			this.skippedJs += [...text.matchAll(jsBlocks)].length;
			text = text.replace(jsBlocks, "");
		}
		if (this.enabled && api.settings.enableInlineDataviewJs === false) {
			this.skippedJs += [...text.matchAll(inlineJs)].length;
			text = text.replace(inlineJs, "");
		}

		text = await this.replace(text, /```dataview\s(.+?)```/gms, async (query) => {
			const { inCallout: quoted, query: q } = sanitizeQuery(query);
			const md = await api.tryQueryMarkdown(q, path);
			return quoted ? inCallout(md) : md;
		});
		text = await this.replace(text, jsBlocks, async (query) => {
			const { inCallout: quoted, query: q } = sanitizeQuery(query);
			const md = await this.executeJs(q, path, 100);
			return quoted ? inCallout(md) : md;
		});
		text = await this.replace(text, inlineJs, (query) =>
			this.executeJs(`const query = ${query.trim()};\ndv.el("div", query);`, path)
		);
		text = await this.replace(
			text,
			new RegExp(`\`${inlinePrefix}(.+?)\``, "gsm"),
			(query) => {
				const result = api.evaluateInline(query.trim(), path);
				return Promise.resolve(
					result.successful
						? literalToString(result.value, api.settings)
						: literalToString(api.settings.renderNullAs, api.settings)
				);
			}
		);
		return text;
	}

	/** Replace every query; a failing query is left untouched. */
	private async replace(
		text: string,
		regex: RegExp,
		convert: (query: string) => Promise<string>
	): Promise<string> {
		const results: string[] = [];
		for (const match of text.matchAll(regex)) {
			if (!this.enabled) {
				results.push("");
				continue;
			}
			try {
				results.push(await convert(match[1]!));
			} catch (e) {
				console.warn("[Leaflet] Dataview query failed", e);
				results.push(match[0]);
			}
		}
		let i = 0;
		return text.replace(regex, (whole) => results[i++] ?? whole);
	}

	private async executeJs(query: string, path: string, max = 50): Promise<string> {
		const div = createDiv();
		const component = new Component();
		component.load();
		try {
			await this.api!.executeJs(query, div, component, path);
			let counter = 0;
			while (!div.querySelector("[data-tag-name]") && counter < max) {
				await delay(5);
				counter++;
			}
			return htmlToMarkdown(div);
		} finally {
			component.unload();
		}
	}
}
