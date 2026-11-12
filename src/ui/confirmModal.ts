import i18next from "i18next";
import { type App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		title: string,
		private message: string,
		private onConfirm: () => void
	) {
		super(app);
		this.setTitle(title);
	}

	onOpen() {
		this.contentEl.createEl("p", { text: this.message });
		new Setting(this.contentEl)
			.addButton((b) =>
				b.setButtonText(i18next.t("modal.cancel")).onClick(() => this.close())
			)
			.addButton((b) =>
				b
					.setButtonText(i18next.t("modal.confirm"))
					.setDestructive()
					.onClick(() => {
						this.close();
						this.onConfirm();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
