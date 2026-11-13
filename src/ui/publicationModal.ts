import i18next from "i18next";
import { type App, SuggestModal } from "obsidian";
import type { PublicationInfo } from "../leaflet/types";

type Choice = Pick<PublicationInfo, "uri" | "name" | "url">;

export class PublicationModal extends SuggestModal<Choice> {
	constructor(
		app: App,
		private publications: PublicationInfo[],
		private onChoose: (site: string) => void
	) {
		super(app);
		this.setPlaceholder(i18next.t("modal.choosePublication"));
	}

	getSuggestions(query: string): Choice[] {
		const all: Choice[] = [
			...this.publications,
			{ uri: "", name: i18next.t("modal.standalone"), url: "leaflet.pub" },
		];
		const q = query.toLowerCase();
		return all.filter(
			(p) => p.name.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)
		);
	}

	renderSuggestion(choice: Choice, el: HTMLElement) {
		el.createDiv({ text: choice.name });
		el.createEl("small", { text: choice.url, cls: "gazette-muted" });
	}

	onChooseSuggestion(choice: Choice) {
		this.onChoose(choice.uri);
	}
}
