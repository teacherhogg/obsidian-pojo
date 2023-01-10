import { timingSafeEqual } from "crypto";
import { App, Modal } from "obsidian";

export class PojoZap extends Modal {
    private hint: string;

    constructor(app: App, hint: string) {
        super(app);
        this.hint = hint;
    }

    onOpen () {
        const { contentEl } = this;
        if (this.hint) {
            contentEl.setText(this.hint);
        } else {
            contentEl.setText("Power Obsidian Journal. Time to CONVERT those journal entries!");
        }
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }
}