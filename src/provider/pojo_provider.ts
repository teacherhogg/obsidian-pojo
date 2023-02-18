import {
    Suggestion,
    SuggestionContext,
    SuggestionProvider
} from "./provider";
import { CompletrSettings, intoCompletrPath } from "../settings";
import { Notice, parseLinktext, TFile, Vault, Platform } from "obsidian";
import { PojoHelper, loadFromFile } from "../pojo_helper";
import { PojoZap, PojoConfirm, DatabaseReview } from "../pojo_dialog";
import { SuggestionBlacklist } from "./blacklist";
import { platform } from "os";

const POJO_SETTINGS_FILE = "pojo_settings.json";

class PojoSuggestionProvider implements SuggestionProvider {
    blocksAllOtherProviders = true;

    private loadedPojoSettings: Record<string, never>;
    private pojo: object;
    private lasthint: string;
    private hint: string;
    private statusbar: object;
    private lastlinep: object;
    private vault: Vault;

    getSuggestions (context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        if (!settings.pojoProviderEnabled) {
            console.log("POJO Suggestions turned off!");
            return [];
        }

        const { editor } = context;
        const lineNumber = context.start.line;
        let line = editor.getLine(lineNumber);
        console.log("pojo line analysis >>" + line + "<<");

        if (this.lastlinep && !line) {
            // We have a finished pojo line last one so need to make any updates to history as required
            console.log("LAST LINE OBJ", this.lastlinep);
            const self = this;

            const changes = this.pojo.getHistoryChanges(this.lastlinep);
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
        this.lastlinep = null;

        this.hint = "";
        if (line.length < settings.minWordTriggerLength) {
            return [];
        }

        // Ensure we're in a Pojo Structured data line.
        line = this.pojo.stripLeading(line)
        const pobj: object = this.pojo.parsePojoLine(line);
        if (pobj == null) {
            return [];
        }

        const hint = this.generateHint(pobj);
        console.log("getSuggestions Hint", hint);
        this.hint = hint;
        if (hint && hint != this.lasthint) {
            if (Platform.isDesktop) {
                new Notice(hint, 3000);
            }
            this.lasthint = hint;
        }
        console.log(`>>${line}<<`);
        console.log("parsePojoLine Object", pobj);

        this.lastlinep = pobj;

        return this.pojo.getSuggestedValues(pobj);
    }

    suggestionSelected (value: Suggestion): null {
        console.log("IN POJO WITH value of suggestion", value);
        return null;
    }

    async loadSuggestions (vault: Vault) {
        this.vault = vault;
        const path = intoCompletrPath(vault, POJO_SETTINGS_FILE);

        console.log("HERE is the pojo settings PATH " + path);

        if (!(await vault.adapter.exists(path))) {
            console.error("NO Pojo Settings file found!", path);
            this.loadedPojoSettings = undefined;
        } else {
            try {
                this.loadedPojoSettings = await loadFromFile(vault, path);
            } catch (e) {
                console.error("ERROR loading Pojo Settings ", e);
                return;
            }
            if (!this.loadedPojoSettings.databases || !this.loadedPojoSettings.databases.info) {
                console.error("INVALID pojo settings file!!");
            }
        }

        this.pojo = new PojoHelper(this, this.loadedPojoSettings);
        this.lastlinep = null;

        await this.pojo.InitHistory(vault);
    }

    async scanFiles (settings: CompletrSettings, files: TFile[]) {
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

    async deleteHistory (vault: Vault) {
        await this.pojo.deleteHistory(vault);
    }

    getLogs () {
        const logs = this.pojo.getLogs();
        console.log("LOGS IN PROVIDER", logs);
        return logs;
    }

    getHistoryVersion () {
        return this.pojo.getHistoryVersion();
    }

    getHistory () {
        return this.pojo.getHistory();
    }

    async scanFile (settings: CompletrSettings, file: TFile) {
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
        const path = intoCompletrPath(vault, SCANNED_WORDS_PATH);
        if (!(await vault.adapter.exists(path)))
            return

        const contents = (await vault.adapter.read(path)).split(NEW_LINE_REGEX);
        for (const word of contents) {
            this.addWord(word);
        }
    }

    isHint (): boolean {
        if (this.hint) {
            return true;
        } else {
            return false;
        }
    }

    pojoZap2 (app: object, bJustHint: boolean): null {
        console.log("pojoZap2!");
        const dbname = "events";
        const history = this.getHistory();
        new DatabaseReview(app, dbname, null, history.databases[dbname]).open();
    }

    pojoZap (app: object, bJustHint: boolean): null {
        console.log("HERE is hint " + this.hint);
        const logs = this.getLogs();
        console.log("pojoZap on provider", logs);
        new PojoZap(app, this.pojo, this.loadedPojoSettings, this.getHistory(), this.hint, logs).open();
    }

    private generateHint (robj: object): string | null {
        if (!robj || !robj._database) { return null; }
        const dinfo = this.pojo.getDatabaseInfo(robj._database);
        console.log("DINFO", dinfo);
        console.log("robj", robj);
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

