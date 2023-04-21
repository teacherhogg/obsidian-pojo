import {
    Suggestion,
    SuggestionContext,
    SuggestionProvider
} from "./provider";
import { PojoSettings } from "../settings";
import { Notice, parseLinktext, TFile, Vault, Platform } from "obsidian";
import { PojoHelper, loadFromFile } from "../pojo_helper";
import { PojoZap, PojoConfirm, DatabaseReview } from "../pojo_dialog";
import { platform } from "os";

class PojoSuggestionProvider implements SuggestionProvider {
    blocksAllOtherProviders = true;

    private loadedPojoSettings: object;
    private pojo: object;
    private lasthint: string;
    private hint: string;
    private statusbar: object;
    private lastlinep: object;
    private vault: Vault;
    private initDBSuccess: false;

    private async initializeProvider (invault: Vault): Promise<boolean> {
        console.log("initializeProvider CALLED");
        if (this.pojo) {
            console.log("Already completed initializeProvder");
            return true;
        }

        const vault = invault ? invault : this.vault;
        if (!vault) {
            console.error("Cannot initializeProvider as no vault specified");
            return false;
        }
        this.vault = vault;

        this.pojo = new PojoHelper(this, this.loadedPojoSettings, vault);
        this.lastlinep = null;

        return true;
    }

    async getSuggestions (context: SuggestionContext, settings: PojoSettings): Promise<Suggestion[]> {
        console.log("getSuggestions Called!");

        if (!this.pojo) {
            console.error("getSuggestions has not been initialized!")
            return [];
        }

        if (!this.initDBSuccess) {
            this.initDBSuccess = await this.pojo.InitDatabases();
            console.log("JUST initialized POJO", this.initDBSuccess);
        }

        const { editor } = context;
        const lineNumber = context.start.line;
        let line = editor.getLine(lineNumber);
        console.warn("pojo line analysis >>" + line + "<<");


        if (this.lastlinep && !line) {
            // We have a finished pojo line last one so need to make any updates to history as required
            let lineprev = editor.getLine(lineNumber - 1);
            console.log("(Previous line >>" + lineprev + "<<)");

            let pobjprev: object = null;
            if (lineprev) {
                lineprev = this.pojo.stripLeading(lineprev)
                pobjprev = this.pojo.parsePojoLine(lineprev);
            }
            console.log("Previous Line Object", pobjprev);

            const self = this;
            if (pobjprev) {
                const changes = this.pojo.getHistoryChanges(pobjprev);
                if (changes) {

                    console.log("GOTS SOME CHNAGES!!", changes);

                    const saveHistoryChanges = async function (historyC) {
                        console.log("HERE WE NEED TO DO THE SAVE DEED!", historyC);
                        return await self.pojo.saveHistoryChanges(self.vault, historyC);
                    }

                    new PojoConfirm(app, changes, saveHistoryChanges).open();

                    console.log("DIS IS THE POJO CONFIRM DONE...");

                    // Write out history file with new change
                    //                this.pojo.saveHistory(this.vault);
                }
            }
        }
        this.lastlinep = null;

        this.hint = "";
        if (line.length < settings.minWordTriggerLength) {
            return [];
        }

        // Ensure we're in a Pojo Structured data line.
        line = this.pojo.stripLeading(line)
        console.log(`>>${line}<<`);
        const pobj: object = this.pojo.parsePojoLine(line);
        if (pobj == null) {
            return [];
        }
        console.log("parsePojoLine Object", pobj);

        const hint = this.generateHint(pobj);
        //        console.log("getSuggestions Hint", hint);
        this.hint = hint;
        if (hint && hint != this.lasthint) {
            if (Platform.isDesktop) {
                new Notice(hint, 3000);
            }
            this.lasthint = hint;
        }

        this.lastlinep = pobj;

        return this.pojo.getSuggestedValues(pobj);
    }

    suggestionSelected (value: Suggestion): null {
        console.log("IN POJO WITH value of suggestion", value);
        return null;
    }

    async loadSuggestions (vault: Vault, settings: object) {
        this.vault = vault;
        this.loadedPojoSettings = settings;
        await this.initializeProvider(vault);
    }

    async scanFiles (settings: PojoSettings, files: TFile[], vault: Vault) {
        console.log("scanFiles called");
        if (!this.pojo) {
            const inited = await this.initializeProvider(vault);
            if (!inited) { return; }
        }

        const importFolder = this.loadedPojoSettings.import_folder;
        console.log("Scanning total files num: " + files.length);
        for (const file of files) {
            if (file.path.startsWith(importFolder)) {
                await this.scanFile(settings, file, false);
            }
        }

        console.log("DONE THE SCANNING!!!");

        await this.pojo.saveHistory(files[0].vault);
    }

    async deleteHistoryProvider (vault: Vault) {
        if (!this.pojo) {
            const inited = await this.initializeProvider();
            if (!inited) { return; }
        }

        await this.pojo.deleteHistory(vault);
    }

    async getLogsProvider () {
        if (!this.pojo) {
            const inited = await this.initializeProvider();
            if (!inited) { return; }
        }

        const logs = this.pojo.getLogs();
        console.log("LOGS IN PROVIDER", logs);
        return logs;
    }

    async getPlatformInfoProvider (vault: Vault) {
        if (!this.pojo) {
            const inited = await this.initializeProvider(vault);
            if (!inited) { return "Error encountered"; }
        }

        return this.pojo.getPlatformInfo();
    }

    async getHistoryVersionProvider (vault: Vault) {
        if (!this.pojo) {
            const inited = await this.initializeProvider(vault);
            if (!inited) { return "ERROR getting history version"; }
        }
        return this.pojo.getHistoryVersion();
    }

    async getHistoryProvider (vault: Vault) {
        if (!this.pojo) {
            const inited = await this.initializeProvider(vault);
            if (!inited) { return []; }
        }
        return this.pojo.getHistory();
    }

    async scanFile (settings: PojoSettings, file: TFile) {
        const contents = await file.vault.cachedRead(file);

        const regex = new RegExp(/^#\w+\/\w+(.*)$|^###\s\w+\/\w+(.*)$/, "gm");
        for (const match of contents.matchAll(regex)) {
            const groupValue = match[0];
            if (!groupValue)
                continue;

            this.pojo.addToHistoryFromLine(groupValue);
        }
    }

    async loadData (vault: Vault) {
        console.log("loadData CALLED");
        if (!this.pojo) {
            const inited = await this.initializeProvider(vault);
            if (!inited) { return; }
        }
    }

    isHint (): boolean {
        if (this.hint) {
            return true;
        } else {
            return false;
        }
    }

    async pojoZap2 (app: object, bJustHint: boolean): Promise<null> {
        if (!this.pojo) {
            const inited = await this.initializeProvider(app.vault);
            if (!inited) { return; }
        }

        console.log("pojoZap2!");
        const dbname = "events";
        const history = await this.getHistoryProvider();
        new DatabaseReview(app, dbname, null, history.databases[dbname]).open();
    }

    async pojoZap (app: object, bJustHint: boolean): Promise<null> {
        if (!this.pojo) {
            const inited = await this.initializeProvider(app.vault);
            if (!inited) { return; }
        }

        console.log("HERE is hint " + this.hint);
        const logs = await this.getLogsProvider();
        console.log("pojoZap on provider", logs);
        const history = await this.getHistoryProvider();
        new PojoZap(app, this.pojo, this.loadedPojoSettings, history, this.hint, logs).open();
    }

    private generateHint (robj: object): string {
        if (!this.pojo) {
            return "";
        }

        if (!robj || !robj._database) { return null; }
        const dinfo = this.pojo.getDatabaseInfo(robj._database);
        let hint = `${dinfo.database}/`;
        if (robj[dinfo.type]) {
            hint += robj[dinfo.type];
        } else {
            hint += dinfo.type;
        }
        const ptext = dinfo.params.join("; ");
        hint += " " + ptext;

        return hint;
    }
}

export const Pojo = new PojoSuggestionProvider();

