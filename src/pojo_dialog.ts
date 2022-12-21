import { App, Modal } from "obsidian";

export class PojoZap extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen () {
        const { contentEl } = this;
        contentEl.setText("Power Obsidian Journal. Time to CONVERT those journal entries!");
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }
}