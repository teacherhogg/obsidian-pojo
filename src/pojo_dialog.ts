import { App, Modal, Setting } from "obsidian";

export class PojoZap extends Modal {
    private hint: string;
    private history: object;
    private logs: object;

    constructor(app: App, hint: string, history: object, logs: object) {
        super(app);
        this.hint = hint;
        this.history = history;
        this.logs = logs;
        console.log("DIALOG CONSTRUCT", logs);
    }

    onOpen () {
        const { contentEl } = this;
        console.log("HISTORY DIALOG", this.history, this.logs);

        let msg;
        if (this.hint) {
            msg = this.hint;
        } else {
            msg = "Power Obsidian Journal. Time to CONVERT those journal entries!";
        }

        if (this.history && this.history.version) {
            msg = "Version History is " + this.history.version;
        }
        this.contentEl.empty();
        new Setting(contentEl)
            .setName("Information")
            .setDesc(msg)

        new Setting(contentEl)
            .setName("Error Logs")

        const newel = contentEl.createEl("div");
        for (const log of this.logs.errors) {
            newel.createEl("div", { text: log });
        }
        newel.createEl("hr");

    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }
}