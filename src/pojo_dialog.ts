import { App, Modal, Setting, TFile } from "obsidian";
import { PojoConvert } from "./pojo_convert";
import { BaseTagSetting } from "./setting/baseTagSetting";
import { PojoSettings } from './settings';

export class PojoZap extends Modal {
    private hint: string;
    private history: object;
    private logs: object;
    private pojo: object;
    private app: App;
    private settings: PojoSettings;
    private currentFile: TFile;
    private statusbar: HTMLElement;

    constructor(app: App, pojo: object, settings: PojoSettings, history: object, hint: string, logs: object, statusbar: HTMLElement) {
        super(app);
        this.app = app;
        this.settings = settings;
        this.hint = hint;
        this.history = history;
        this.logs = logs;
        this.pojo = pojo;
        this.statusbar = statusbar;
        console.log("DIALOG CONSTRUCT", logs);

        console.log("CURRENT FILE CONTENT");
        const currentFile: TFile = app.workspace.getActiveFile();
        if (currentFile && currentFile.parent && currentFile.parent.name == "Daily Notes") {
            console.log("YES this is a valid file for conversion!");
            this.currentFile = currentFile;
        }
    }

    async onOpen () {
        const self = this;
        const { contentEl } = this;

        const bSuccess = await self.pojo.InitDatabases();
        if (!bSuccess) {
            self.pojo.logError("ERROR initializing Databases!");
        }
        console.log("HISTORY DIALOG", this.history, this.logs);


        //        if (this.currentFile) {
        //            const data = await this.app.vault.read(this.currentFile);
        //            console.log("HERE is current file content!", data);
        //        }

        let msg;
        msg = "Pojo Version: " + this.settings.version_manifest + " | Settings Version: " + this.settings.version_settings;

        this.contentEl.empty();
        new Setting(contentEl)
            .setName("Information")
            .setDesc(msg)

        /*
        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Edit Database History")
                    .onClick(() => {
                        console.log('Doing the Database History stuff');
                        new DatabaseList(
                            this.app,
                            this.settings,
                            this.history,
                            async (changed: object, changes: object[]) => {
                                // changed is the history with edits, changes it the set of changes (already applied to changed)
                                console.log("HERE is the edited history!!!", changed);
                                console.log("NEED TO SAVE!!!", changes);
                                await this.pojo.saveHistory(this.app.vault, changed);
                                console.log("PojoZap History SAVED!!!",)
                            }).open();
                    })
            )
        
                new Setting(contentEl)
                    .addButton((btn) =>
                        btn
                            .setButtonText("Temporary")
                            .onClick(async () => {
                                console.log('Convert History JSON to MD');
                                await this.pojo.convertHistoryTime(this.app.vault);
                                console.log('FINISHED conversion eh?')
                            })
                    )
        */

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Convert THIS file")
                    .onClick(async () => {
                        console.log('DOING THIS FILE CONVERT!!!');
                        const imageactions = [];

                        //                        console.log("TEMP FIXUP HISTORY FILE CASES")
                        //                        const newhistory = modifyDatabaseHistory(this.history);
                        //                        console.log("HERE is the newhistory", newhistory);
                        //                        this.pojo.saveHistory(this.app.vault, newhistory);

                        const convert = new PojoConvert(self.settings, self.pojo, self.app.vault, self.app);
                        const retval = await convert.convertDailyNote(this.currentFile, imageactions);
                        console.log("Conversion Completed.", retval);

                        let msg = retval.msg;

                        if (retval.type == "noconvert_alreadyconverted") {
                            new ConfirmationModal(
                                this.app,
                                "Conversion Already Done",
                                "This note has ALREADY been converted. Do you wish to proceed anyway and overrwite any previous converted note and metadata?",
                                button => button
                                    .setButtonText("Proceed with Conversion ANYWAY")
                                    .setWarning(),
                                async () => {
                                    console.log("WE ARE CHOOSING TO CONVERT AGAIN!! ")
                                    const retval = await convert.convertDailyNote(this.currentFile, imageactions, true);
                                    console.log("Second Conversion Completed.", retval);
                                    let msg = retval.msg;

                                    const iret = await convert.manageImages(imageactions);
                                    console.log("manageImages returned", iret);

                                    if (!iret.success) {
                                        msg += " Failure to copy " + iret.failures.length + " images: ";
                                        for (const val of iret.failures) {
                                            msg += " " + val.imagesource;
                                        }
                                    }

                                    new InformationModal(
                                        this.app,
                                        "Conversion completed with code: " + retval.type,
                                        msg
                                    ).open();

                                }).open();
                        } else {
                            console.log("NEED to deal with imageactions!", imageactions);

                            const iret = await convert.manageImages(imageactions);
                            console.log("manageImages returned", iret);

                            if (!iret.success) {
                                msg += " Failure to copy " + iret.failures.length + " images: ";
                                for (const val of iret.failures) {
                                    msg += " " + val.imagesource;
                                }
                            }

                            new InformationModal(
                                this.app,
                                "Conversion completed with code: " + retval.type,
                                msg
                            ).open();
                        }

                    })
            )

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Convert ALL Daily Notes")
                    .onClick(async () => {
                        console.log('Convert ALL DAILY NOTES', self.pojo);
                        console.log('Settings', self.settings);
                        const convert = new PojoConvert(self.settings, self.pojo, self.app.vault, self.app);

                        if (!self.settings.folder_daily_notes) {
                            this.logError("MISSING import folder in this.settings file.")
                            return false;
                        }
                        const dailyFiles = convert.getInputFiles(self.settings.folder_daily_notes);

                        const statsuffix = "/" + dailyFiles.length + "⚡";
                        let nSuccess = 0;
                        let nFailure = 0;
                        let nDone = 0;

                        const _getStatusText = function () {
                            return nSuccess + "✔ " + nFailure + "❌ " + nDone + statsuffix;
                        }

                        let statmsg1 = self.statusbar.createEl("span", { text: _getStatusText() });
                        console.log("Number of files to import: " + dailyFiles.length);
                        const imageactions = [];
                        const conversionInfo = {
                            "success": [],
                            "failure": []
                        };


                        for (const dfile of dailyFiles) {
                            self.pojo.errorStack(true);
                            const retval = await convert.convertDailyNote(dfile, imageactions, false, true);
                            nDone++;
                            const filename = dfile.basename + "." + dfile.extension;
                            //                            console.log("Conversion " + filename, retval, dfile);
                            if (retval.type == "noconvert_empty") {
                                console.error("Skipped file " + filename + " as it is empty.");
                                conversionInfo.failure.push({ file: filename, errors: self.pojo.errorStack() });
                                nFailure++;
                            }
                            else if (retval.type !== "success") {
                                console.error("COULD NOT CONVERT as encountered error on " + filename, retval);
                                conversionInfo.failure.push({ file: filename, errors: self.pojo.errorStack() });
                                nFailure++;
                            } else {
                                //                                console.log("Converted file " + filename);
                                conversionInfo.success.push(filename);
                                nSuccess++;
                            }
                            statmsg1.remove();
                            statmsg1 = self.statusbar.createEl("span", { text: _getStatusText() });
                        }

                        const iret = await convert.manageImages(imageactions);
                        console.log("manageImages returned", iret);

                        let msg = nSuccess + " notes converted successfully. ";

                        if (iret.ncount) {
                            msg += " Successfully copied " + iret.ncount + " images.";
                        }

                        if (!iret.success) {
                            msg += " Failure to copy " + iret.failures.length + "  images: ";
                            for (const val of iret.failures) {
                                msg += " " + val.imagesource;
                            }
                        }

                        console.log("NEED to deal with imageactions", imageactions);
                        console.log("CONVERSION FINISHED", conversionInfo);

                        new InformationModal(
                            this.app,
                            "Conversion completed",
                            msg
                        ).open();
                    })
            )

        /*
        if (this.history.history_editors) {

            new Setting(contentEl)
                .setName("History Editing")

            const newel = contentEl.createEl("div");
            for (const editor in this.history.history_editors) {
                newel.createEl("div", { text: "[ " + editor + " ] " + this.history.history_editors[editor] });
            }
            newel.createEl("hr");
        }
        */

        console.log("HERE IS logs", this.logs);
        if (this.logs.errors) {
            new Setting(contentEl)
                .setName("Error Logs")

            const newel = contentEl.createEl("div");
            for (const log of this.logs.errors) {
                newel.createEl("div", { text: log });
            }
            newel.createEl("hr");
        }

        if (this.logs.debug) {
            new Setting(contentEl)
                .setName("Debug Logs")

            const newel = contentEl.createEl("div");
            for (const log of this.logs.debug) {
                newel.createEl("div", { text: log });
            }
            newel.createEl("hr");
        }


    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }
}

const capitalize = function (word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}


const modifyDatabaseHistory = function (dbhistory) {
    console.log("HERE IS DBHISTORY", dbhistory);
    const newhistory = {};
    for (const dbname in dbhistory.databases) {
        const capDBname = capitalize(dbname);
        newhistory[capDBname] = {};

        for (const key in dbhistory.databases[dbname]) {
            const a1 = key.split("_");
            for (let i1 = 0; i1 < a1.length; i1++) {
                const a2 = a1[i1].split("-");
                for (let i2 = 0; i2 < a2.length; i2++) {
                    a2[i2] = capitalize(a2[i2]);
                }
                a1[i1] = a2.join("-")
            }
            const newkey = a1.join("_");
            console.log("HERE is the newkey " + newkey + " == " + key);
            newhistory[capDBname][newkey] = dbhistory.databases[dbname][key];
        }
    }

    console.log("HERE is the new history", newhistory);
    dbhistory.databases = newhistory;
    return dbhistory;
}

export class PojoConfirm extends Modal {
    private app: App;
    private changes: object[];
    private saveChanges: any;

    constructor(app: App, changes: object[], saveChanges: any) {
        super(app);
        this.app = app;
        this.changes = changes;
        this.saveChanges = saveChanges;
    }

    async onOpen () {
        console.log("CONFIRM DIALOG", this.changes);
        this.display();
    }

    private getItemString (item: object): string {
        let msg = "📁" + item.database + " 🔑" + item.key + " 📝";
        msg += " " + item.value;
        return msg;
    }

    private display () {
        const self = this;
        const { contentEl } = this;

        const msg = "Entries that are new have been detected for one or more databases.";

        this.contentEl.empty();
        new Setting(contentEl)
            .setName("New Values Found")
            .setDesc(msg)


        new Setting(contentEl)
            .setDesc('The following is a list of NEW metadata that can be added to the history list. Click "Save Changes" to add to history.')
        /*
                    .addExtraButton(button => button
                        .setIcon("switch")
                        .setTooltip("Reload")
                        .onClick(async () => {
                            console.log("TBD to implement reload");
                        }))
                    .addButton(button => {
                        //                button.buttonEl.appendChild(fileInput);
                        button
                            .setButtonText("+")
                            .setCta()
                            .onClick(() => {
                                console.log("TBD implement the Add Button")
                            });
                    });
        */

        const listDiv = contentEl.createDiv();
        for (let idx = 0; idx < self.changes.length; idx++) {
            const msg = self.getItemString(self.changes[idx]);
            new Setting(listDiv)
                .setName(msg)
                .addExtraButton((button) => button
                    .setIcon("trash")
                    .setTooltip("Remove")
                    .onClick(async () => {
                        new ConfirmationModal(
                            this.app,
                            "Delete " + msg + "?",
                            "This entry will be deleted from the items to add to the history.",
                            button => button
                                .setButtonText("Delete")
                                .setWarning(),
                            async () => {
                                self.changes.splice(idx, 1);
                                self.display();
                            }).open();
                    })
                ).settingEl.addClass("completr-settings-list-item");
        }

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Save Changes")
                    .setCta()
                    .onClick(() => {
                        console.log('Saving TIMES!', this.changes);
                        self.saveChanges(self.changes);
                        self.close();
                    })
            )
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class DatabaseReview extends Modal {
    private app: App;
    private dbname: string;
    private dbinfo: object;
    private dbhistory: object;
    private saveChanges: any;
    private changes: object[];

    constructor(app: App, dbname: string, dbinfo: object, dbhistory: object, changes: object[], saveChanges: any) {
        super(app);
        this.app = app;
        this.dbname = dbname;
        this.dbinfo = dbinfo;
        this.dbhistory = dbhistory;
        this.changes = changes;
        this.saveChanges = saveChanges;
    }

    async onOpen () {
        console.log("DatabaseReview Dialog");
        this.display();
    }

    private getItemString (key: string, val: string): string {
        const msg = " 📝 " + val;
        return msg;
    }

    private getSectionTitle (key: string, dbhist: object[]) {

        let nitems = 0;
        if (dbhist) {
            nitems = dbhist.length;
        }
        const suffix = ` (${nitems})`;
        const title = " 🔑 ";
        let middle = "";
        if (key == this.dbinfo.type) {
            return title + this.dbinfo.type + suffix;
        } else {
            for (const param of this.dbinfo.params) {
                if (key == param) {
                    return title + param + suffix;
                }
            }
        }

        const ap = key.split("_");
        middle = ap.join(" ");
        return title + middle + suffix;
    }

    private display (expanded) {
        const self = this;
        const { contentEl } = this;

        const msg = "The following is the history of values associated with the " + this.dbname + " database.";

        this.contentEl.empty();
        new Setting(contentEl)
            .setName("Database " + this.dbname + " history.")
            .setDesc(msg)


        new Setting(contentEl)
            .setDesc('You can delete, add, or edit history entries. Click "Save Changes" if you are finished making edits.')

        const listDiv = contentEl.createDiv();
        const keys = Object.keys(this.dbhistory);

        let sectext;
        for (let idx = 0; idx < keys.length; idx++) {
            const key = keys[idx];
            const sec = new BaseTagSetting();

            let cldiv = "type-section-header";
            if (expanded !== idx + 1) {
                cldiv += " is-collapsed";
            }
            const sectDiv = contentEl.createDiv(cldiv);
            const sectHeader = sectDiv.createDiv();
            const secBody = sectDiv.createDiv("type-section-body");
            const secTitle = sec.generateTitle(sectHeader, sectDiv, false);
            const titleText = self.getSectionTitle(key, this.dbhistory[key])
            secTitle.nameEl.createSpan().setText(titleText);

            for (let idx2 = 0; idx2 < this.dbhistory[key].length; idx2++) {
                const val = this.dbhistory[key][idx2];
                const msg = self.getItemString(key, val);
                new Setting(secBody)
                    .setName(msg)
                    .addExtraButton((button) => button
                        .setIcon("pencil")
                        .setTooltip("Edit")
                        .onClick(async () => {
                            console.log("Edit ITEM!!!!");
                            new EditModal(
                                this.app,
                                "Editing Value",
                                "Note that this does not change the previous value used in existing daily notes.",
                                val,
                                button => button
                                    .setButtonText("Save"),
                                async (editedval: string) => {
                                    console.log("The edited value is " + editedval);
                                    this.changes.push({
                                        database: this.dbname,
                                        key: key,
                                        value: editedval,
                                        type: 'edit',
                                        index: idx2
                                    });
                                    this.dbhistory[key][idx2] = editedval;
                                    this.display(idx + 1);
                                }).open();
                        })
                    )
                    .addExtraButton((button) => button
                        .setIcon("trash")
                        .setTooltip("Remove")
                        .onClick(async () => {
                            new ConfirmationModal(
                                this.app,
                                "Delete " + msg + "?",
                                "This entry will be deleted from the items to add to the history.",
                                button => button
                                    .setButtonText("Delete")
                                    .setWarning(),
                                async () => {
                                    this.changes.push({
                                        database: this.dbname,
                                        key: key,
                                        type: 'delete',
                                        index: idx2
                                    });
                                    this.dbhistory[key].splice(idx2, 1);
                                    this.display(idx + 1);
                                }).open();
                        })
                    ).settingEl.addClass("completr-settings-list-item");
            }
            new Setting(secBody)
                .setName("Add New Value")
                .setDesc("Add any new choices to this section and click the button to add to list.")
                .addText(text => text
                    .onChange(async val => {
                        console.log("choice times ", val);
                        sectext = val;
                    })
                )
                .addExtraButton((button) => button
                    .setIcon("create-new")
                    .setTooltip("Add")
                    .onClick(async () => {
                        console.log("ADD NEW ITEM!!!! " + sectext);
                        this.changes.push({
                            database: this.dbname,
                            key: key,
                            value: sectext,
                            type: 'new'
                        });
                        this.dbhistory[key].push(sectext);
                        this.display(idx + 1);
                    })
                ).settingEl.addClass("completr-settings-list-item");

            new Setting(secBody)
                .setName('')

        }

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Save Changes")
                    .setCta()
                    .onClick(() => {
                        console.log('Saving TIMES! DatabaseReview', self.dbhistory);
                        self.saveChanges(self.dbname, self.dbhistory, self.changes);
                        self.close();
                    })
            )
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class DatabaseList extends Modal {
    private app: App;
    private history: object;
    private settings: object;
    private saveChanges: any;
    private changes: object[];

    constructor(app: App, settings: object, history: object, saveChanges: any) {
        super(app);
        this.app = app;
        this.settings = settings;
        this.history = history;
        this.saveChanges = saveChanges;
        this.changes = [];
    }

    async onOpen () {
        console.log("DatabaseList Dialog");
        this.display();
    }

    private getItemString (item: object, dbhist: object): string {
        let msg = "📁" + item.database;
        let nitems = 0;
        if (dbhist) {
            const dbvals = Object.keys(dbhist);
            nitems = dbvals.length;
        }
        msg += ` (${nitems})`;
        return msg;
    }

    private display () {
        const self = this;
        const { contentEl } = this;

        const msg = "This is the list of Pojo Databases available. Click on the magnifying glass to view or edit that database's history content.";

        this.contentEl.empty();
        new Setting(contentEl)
            .setName("Database List")
            .setDesc(msg)

        const databases = this.settings.databases.info;

        const listDiv = contentEl.createDiv();
        for (let idx = 0; idx < databases.length; idx++) {
            const dbname = databases[idx].database;
            //            console.log("database " + dbname, this.history);
            const msg = self.getItemString(databases[idx], this.history.databases[dbname]);
            new Setting(listDiv)
                .setName(msg)
                .addExtraButton((button) => button
                    .setIcon("magnifying-glass")
                    .setTooltip("View History of " + dbname)
                    .onClick(async () => {
                        new DatabaseReview(
                            this.app,
                            dbname,
                            databases[idx],
                            self.history.databases[dbname],
                            self.changes,
                            async (dbname: string, changed: object, changes: object[]) => {
                                console.log("DatabaseReview for " + dbname, changed, changes);
                                self.history.databases[dbname] = changed;
                                self.saveChanges(self.history, changes);
                            }
                        ).open();
                    })
                ).settingEl.addClass("completr-settings-list-item");
        }

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Save Changes")
                    .setCta()
                    .onClick(() => {
                        self.close();
                    })
            )
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class InformationModal extends Modal {

    constructor(app: App, title: string, body: string) {
        super(app);
        this.titleEl.setText(title);
        this.contentEl.setText(body);
        new Setting(this.modalEl)
            .addButton(button => button
                .setButtonText("OK")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");
    }
}

class ConfirmationModal extends Modal {

    constructor(app: App, title: string, body: string, buttonCallback: (button: ButtonComponent) => void, clickCallback: () => Promise<void>) {
        super(app);
        this.titleEl.setText(title);
        this.contentEl.setText(body);
        new Setting(this.modalEl)
            .addButton(button => {
                buttonCallback(button);
                button.onClick(async () => {
                    await clickCallback();
                    this.close();
                })
            })
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");
    }
}

class EditModal extends Modal {

    constructor(app: App, title: string, body: string, inputtext: string, buttonCallback: (button: ButtonComponent) => void, clickCallback: (editval: string) => Promise<void>) {
        super(app);
        let edittext = inputtext;
        this.titleEl.setText(title);
        this.contentEl.setText(body);
        new Setting(this.modalEl)
            .addText(text => text
                .setValue(edittext)
                .onChange(async val => {
                    console.log("EDITED " + val);
                    edittext = val;
                })
            )
            .addButton(button => {
                buttonCallback(button);
                button.onClick(async () => {
                    await clickCallback(edittext);
                    this.close();
                })
            })
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");
    }
}
