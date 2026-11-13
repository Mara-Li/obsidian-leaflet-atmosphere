import { Notice, Platform } from "obsidian";

let runs = 0;

/** Publication progress: a bar in the status bar on desktop, a notice on mobile. */
export class PublishProgress {
	private notice: Notice | null = null;
	/** The latest run owns the status bar item. */
	private readonly run = String(++runs);

	constructor(private statusEl: HTMLElement | null) {
		statusEl?.setAttr("data-run", this.run);
	}

	private get owner(): boolean {
		return this.statusEl?.getAttr("data-run") === this.run;
	}

	/** Without a total, the bar is indeterminate. */
	update(message: string, current?: number, total?: number) {
		if (this.statusEl && !Platform.isMobile) {
			if (!this.owner) return;
			const el = this.statusEl;
			el.empty();
			el.show();
			el.setAttr("aria-label", message);
			el.createSpan({ cls: "gazette-status-text", text: message });
			const bar = el.createEl("progress", { cls: "gazette-status-bar" });
			if (total) {
				bar.max = total;
				bar.value = current ?? 0;
			}
			return;
		}
		if (this.notice) this.notice.setMessage(message);
		else this.notice = new Notice(message, 0);
	}

	done() {
		this.notice?.hide();
		if (this.statusEl && this.owner) {
			this.statusEl.empty();
			this.statusEl.hide();
		}
	}
}
