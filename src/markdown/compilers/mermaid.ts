import { type App, Component, MarkdownRenderer } from "obsidian";

const delay = (ms: number) =>
	new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Mermaid diagram rendered by Obsidian, as SVG markup. */
export async function renderMermaid(
	app: App,
	source: string,
	sourcePath: string
): Promise<string | null> {
	// biome-ignore lint/correctness/noUndeclaredVariables: Obsidian globals
	const host = createDiv({ cls: "leaflet-atmosphere-offscreen" });
	// biome-ignore lint/correctness/noUndeclaredVariables: Obsidian globals
	activeDocument.body.appendChild(host);
	const component = new Component();
	component.load();
	try {
		await MarkdownRenderer.render(
			app,
			`\`\`\`mermaid\n${source}\n\`\`\``,
			host,
			sourcePath,
			component
		);
		let svg = host.querySelector("svg");
		for (let i = 0; !svg && i < 40; i++) {
			await delay(50);
			svg = host.querySelector("svg");
		}
		if (!svg) return null;
		const box = svg.viewBox.baseVal;
		const width =
			svg.width.baseVal.value || box?.width || svg.getBoundingClientRect().width;
		const height =
			svg.height.baseVal.value || box?.height || svg.getBoundingClientRect().height;
		svg.setAttribute("width", String(Math.ceil(width)));
		svg.setAttribute("height", String(Math.ceil(height)));
		svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		return svg.outerHTML;
	} finally {
		component.unload();
		host.remove();
	}
}
