import i18next from "i18next";
import { type App, FuzzySuggestModal, type TFile } from "obsidian";

/** Pick a note among a list. */
export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private notes: TFile[],
		private onChoose: (file: TFile) => void
	) {
		super(app);
		this.setPlaceholder(i18next.t("manager.chooseNote"));
	}

	getItems(): TFile[] {
		return this.notes;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile) {
		this.onChoose(file);
	}
}
