import i18next from "i18next";
import { type App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		title: string,
		private message: string,
		private onConfirm: () => void,
		private confirmText = i18next.t("modal.confirm"),
		private destructive = true
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
			.addButton((b) => {
				b.setButtonText(this.confirmText).onClick(() => {
					this.close();
					this.onConfirm();
				});
				if (this.destructive) b.setDestructive();
				else b.setCta();
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
