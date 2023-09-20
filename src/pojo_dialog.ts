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
        msg = "POJO Version: " + this.settings.version_manifest + " | Settings Version: " + this.settings.version_settings;

        const todaydailyname = self.pojo.getDailyNoteName(null);
        console.log("TODAY's Daily NOTE NAME is ", todaydailyname);

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
                    .setButtonText("Convert Current Note")
                    .onClick(async () => {
                        console.log('DOING THIS FILE CONVERT!!!');
                        const imageactions = [];

                        //                        console.log("TEMP FIXUP HISTORY FILE CASES")
                        //                        const newhistory = modifyDatabaseHistory(this.history);
                        //                        console.log("HERE is the newhistory", newhistory);
                        //                        this.pojo.saveHistory(this.app.vault, newhistory);

                        const convert = new PojoConvert(self.settings, self.pojo, self.app.vault, self.app);

                        const dailyFiles = [this.currentFile];
                        let retobj = await self.convertDailyNotes(convert, dailyFiles, false, false);
                        console.log("convertDailyNotes Completed.", retobj);

                        if (retobj.status == "noconvert_alreadyconverted") {
                            new ConfirmationModal(
                                this.app,
                                "Conversion Already Done",
                                "This note has ALREADY been converted. Do you wish to proceed anyway and overrwite any previous converted note and metadata?",
                                button => button
                                    .setButtonText("Proceed with Conversion ANYWAY")
                                    .setWarning(),
                                async () => {

                                    console.log("WE ARE CHOOSING TO CONVERT AGAIN!! ");
                                    retobj = await self.convertDailyNotes(convert, dailyFiles, false, true)
                                    console.log("Second Conversion Completed.", retobj);
                                    self.dailyNoteCompletion(retobj, self.pojo, false);

                                }).open();
                        } else {
                            self.dailyNoteCompletion(retobj, self.pojo, false);
                        }

                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("New Daily Note")
                    .onClick(async () => {
                        new EditModal2(
                            this.app,
                            "Create New Daily Note",
                            "",
                            "Include Tasks",
                            true,
                            todaydailyname,
                            button => button
                                .setButtonText("Create"),
                            async (datestr: string, tasks: boolean) => {

                                console.log("Create new daily note " + datestr + " tasks: " + tasks);
                                const convert = new PojoConvert(self.settings, self.pojo, self.app.vault, self.app);
                                const retobj = await convert.createDailyNote(datestr, tasks);
                                console.log("Daily Note created with retobj", retobj);
                            }).open();
                    })
            )

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Convert ALL Daily Notes")
                    .onClick(async () => {
                        console.log('Convert ALL DAILY NOTES', self.pojo);
                        const convert = new PojoConvert(self.settings, self.pojo, self.app.vault, self.app);
                        const dailyFiles = convert.getInputFiles(self.settings.folder_daily_notes);
                        const retobj = await self.convertDailyNotes(convert, dailyFiles, true, false);
                        self.dailyNoteCompletion(retobj, self.pojo, true);
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Create or Update MOCs")
                    .onClick(async () => {
                        console.log('MOC Updates', self.pojo);
                        const convert = new PojoConvert(self.settings, self.pojo, self.app.vault, self.app);
                        //                        await convert.getTaggedFiles(self.settings.folder_daily_notes, true);
                        //                        console.log("DA DONE");
                        const retobj = await convert.createMOCFiles(false);
                        console.log("DONE MOC FER NOW", retobj, true);
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
            const logfile = await this.pojo.saveErrorLogFile(this.logs);
            if (logfile) {
                newel.createEl("div", { text: "Errors logged to " + logfile });
            }

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

        if (this.logs.errors) {
            //            delete this.logs.errors;
            if (this.logs.debug) {
                delete this.logs.debug;
            }
        }
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }

    async dailyNoteCompletion (retobj: object, pojo: object, bWriteLogs: boolean) {
        console.log("COMPLETED CONVERSOINS ", retobj);

        // Write out a status log of the conversion.
        let logfilename = null;
        if (bWriteLogs) {
            logfilename = await pojo.saveConversionLogFile(retobj);
        }

        // Open Dialog with conversoin complete
        new DailyNoteConversionComplete(
            this.app,
            retobj,
            logfilename
        ).open();
    }

    async convertDailyNotes (convert, dailyFiles, bConvertAllNotes, bConvertAgain) {

        const self = this;
        const statsuffix = "/" + dailyFiles.length + "⚡";
        let nSuccess = 0;
        let nFailure = 0;
        let nWarning = 0;
        let nDone = 0;

        const suggestedTags = self.pojo.getSuggestedTags();
        const databases = self.pojo.getDatabases(false, true);

        const _getStatusText = function () {
            return nSuccess + "✔ " + nFailure + "❌ " + nWarning + "⚠ " + nDone + statsuffix;
        }

        let statmsg1;
        if (self.statusbar) {
            statmsg1 = self.statusbar.createEl("span", { text: _getStatusText() });
        }
        console.log("Number of files to import: " + dailyFiles.length);
        const imageactions = {};
        const returnObject = {
            status: "done",
            msg: "DONE",
            success: {},
            failure: {},
            warning: {},
            missing: {}
        };

        let lastmsg;
        for (const dfile of dailyFiles) {
            self.pojo.errorStack(true);
            const retval = await convert.convertDailyNote(dfile, databases, suggestedTags, imageactions, bConvertAgain, bConvertAllNotes);
            lastmsg = retval.msg;

            nDone++;
            const filename = dfile.basename + "." + dfile.extension;

            if (retval.type == "noconvert_alreadyconverted") {
                if (bConvertAllNotes) {
                    // Something strange going on if this error is encountered when doing a convert all notes.
                    console.error("Error as saying Already converted.", filename);
                    returnObject.failure[filename] = { errors: self.pojo.errorStack(), type: "noconvert_archived_missing" };
                    nFailure++;
                } else {
                    console.log("Already converted.", filename);
                    returnObject.msg = retval.msg;
                    returnObject.status = retval.type;
                    return returnObject;
                }
            }
            else if (retval.type == "noconvert_empty") {
                console.error("Skipped file " + filename + " as it is empty.");
                returnObject.failure[filename] = { errors: self.pojo.errorStack(), type: retval.type };
                nFailure++;
            }
            else if (retval.type !== "success") {
                console.error("COULD NOT CONVERT as encountered error on " + filename, retval);
                returnObject.failure[filename] = { errors: self.pojo.errorStack(), type: retval.type };
                nFailure++;
            } else {
                const warns = self.pojo.errorStack();
                if (warns && warns.length > 0) {
                    returnObject.warning[filename] = { errors: warns, type: retval.type };
                    nWarning++;
                } else {
                    returnObject.success[filename] = { type: retval.type };
                    nSuccess++;
                }
            }

            if (self.statusbar) {
                statmsg1.remove();
                statmsg1 = self.statusbar.createEl("span", { text: _getStatusText() });
            }
        }

        console.log("HERE is imageactions", imageactions);
        const iret = await convert.manageImages(imageactions);
        //        console.log("manageImages returned", iret);

        if (!iret.success) {
            for (const valobj of iret.failures) {
                if (!returnObject.failure[valobj.refnote]) {
                    returnObject.failure[valobj.refnote] = {};
                }
                if (!returnObject.failure[valobj.refnote].images) {
                    returnObject.failure[valobj.refnote].images = [];
                }
                returnObject.failure[valobj.refnote].images.push({
                    status: valobj.error,
                    image: valobj.image
                });
            }
        }

        returnObject.msg = lastmsg;
        return returnObject;
    }
}

const capitalize = function (word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

const modifyDatabaseHistoryDEPRECATED = function (dbhistory) {
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

class DailyNoteConversionComplete extends Modal {
    private app: App;
    private infoobj: object;
    private logfile: string;

    constructor(app: App, infoobj: object, logfile: string) {
        super(app);
        this.app = app;
        this.infoobj = infoobj;
        this.logfile = logfile;
    }

    async onOpen () {
        this.display();
    }

    private getItemString (note: string, type: string, item: object): string {

        let msg;
        if (type == "error") {
            msg = "❌ ";
        } else if (type == "warn") {
            msg = "⚠ ";
        } else {
            msg = "✔ ";
        }
        msg += note;

        const _parseItem = function (key, val) {
            if (val == null) {
                msg += ` ${key}:`
            } else if (typeof val === 'object') {
                msg += ` (${key}:`;
                for (const key2 in val) {
                    _parseItem(key2, val[key2]);
                }
                msg += ')';
            } else if (Array.isArray(val)) {
                msg += ` [${key}:`
                let index = 1;
                for (const aitem of val) {
                    _parseItem(index, aitem);
                    index++;
                }
                msg += ']';
            } else {
                msg += ` ${key}: ${val}`;
            }
        }

        if (item) {
            for (const key in item) {
                _parseItem(key, item[key]);
            }
        }
        return msg;
    }

    private display () {
        const self = this;
        const { contentEl } = this;

        let msg = "";
        let msgend = ""
        const nSuccess = Object.keys(this.infoobj.success).length;
        if (nSuccess > 0) {
            if (nSuccess == 1) { msgend = " note." } else { msgend = " notes." }
            msg = "Succesfully processed " + nSuccess + msgend;
        }
        const nFailure = Object.keys(this.infoobj.failure).length;
        if (nFailure > 0) {
            if (nFailure == 1) { msgend = " failure encountered." } else { msgend = " failures encountered." }
            msg += " " + nFailure + msgend;
        }
        const nWarning = Object.keys(this.infoobj.warning).length;
        if (nWarning > 0) {
            if (nWarning == 1) { msgend = " warning encountered." } else { msgend = " warnings encountered." }
            msg += " " + nWarning + msgend;
        }

        this.contentEl.empty();
        new Setting(contentEl)
            .setName("Daily Note Conversion Completed")
            .setDesc(msg)

        if (this.logfile) {
            new Setting(contentEl)
                .setName("Conversion Details also found in vault file:")
                .setDesc(this.logfile);
        }


        if (nFailure > 0 || nWarning > 0) {
            new Setting(contentEl)
                .setName("Errors Encountered:");

            const errDiv = contentEl.createDiv();
            let note;
            for (note in this.infoobj.failure) {
                const failobj = this.infoobj.failure[note];
                const msg = self.getItemString(note, "error", failobj);
                errDiv.createEl("div", { text: msg });

            }
            errDiv.createEl("hr");

            const warnDiv = contentEl.createDiv();
            for (note in this.infoobj.warning) {
                const warnobj = this.infoobj.warning[note];
                const msg = self.getItemString(note, "warn", warnobj);
                warnDiv.createEl("div", { text: msg });
            }
            warnDiv.createEl("hr");

        }
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

class EditModal2 extends Modal {

    constructor(app: App, title: string, body: string, toggletext: string, toggleval: boolean, inputtext: string, buttonCallback: (button: ButtonComponent) => void, clickCallback: (editval: string, tasks: boolean) => Promise<void>) {
        super(app);
        let edittext = inputtext;
        let edittog = toggleval;
        this.titleEl.setText(title);
        this.contentEl.setText(body);
        new Setting(this.modalEl)
            .setName(toggletext)
            .addToggle(toggleEl => toggleEl
                .setValue(edittog)
                .onChange(async val => {
                    console.log("TOGGLE " + val);
                    edittog = val;
                })
            )
            .addText(text => text
                .setValue(edittext)
                .onChange(async val => {
                    console.log("EDITED " + val);
                    edittext = val;
                })
            )
        new Setting(this.modalEl)
            .addButton(button => {
                buttonCallback(button);
                button.onClick(async () => {
                    await clickCallback(edittext, edittog);
                    this.close();
                })
            })
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");
    }
}