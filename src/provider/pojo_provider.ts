import {
    Suggestion,
    SuggestionContext,
    SuggestionProvider
} from "./provider";
import { CompletrSettings, intoCompletrPath } from "../settings";
import { Notice, parseLinktext, TFile, Vault } from "obsidian";
import { PojoConvert } from "src/pojo_convert";
import { SuggestionBlacklist } from "./blacklist";

const POJO_SETTINGS_FILE = "pojo_settings.json";
const POJO_HISTORY_FILE = "pojo_history.json";

class PojoSuggestionProvider implements SuggestionProvider {
    blocksAllOtherProviders = true;

    private loadedPojoSettings: Record<string, never>;
    private loadedPojoHistory: object;
    private pojo: object;

    getSuggestions (context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        if (!settings.pojoProviderEnabled) {
            console.log("POJO Suggestions turned off!");
            return [];
        }

        const { editor } = context;
        const lineNumber = context.start.line;
        let line = editor.getLine(lineNumber);

        console.log("HERE IS DA pojo line", line);
        if (line.length < settings.minWordTriggerLength) {
            return [];
        }

        // Ensure we're in a Pojo Structured data line.
        line = this.pojo.stripLeading(line)
        const pobj: ReturnObject = this.extractPojo(line);
        if (pobj == null) {
            return [];
        }

        const hint = this.generateHint(pobj);
        if (hint) {
            new Notice(hint, 3000);
        }
        console.log("extractPojo", pobj);
        return pobj.values;
    }

    suggestionSelected (value: Suggestion): null {
        console.log("IN POJO WITH value of suggestion", value);
        return null;
    }

    async loadSuggestions (vault: Vault) {
        let path = intoCompletrPath(vault, POJO_SETTINGS_FILE);

        console.log("HERE is the pojo settings LOADED " + path);

        if (!(await vault.adapter.exists(path))) {
            console.error("NO Pojo Settings file found!");
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

        path = intoCompletrPath(vault, POJO_HISTORY_FILE);
        if (!(await vault.adapter.exists(path))) {
            this.loadedPojoHistory = {};
        } else {
            try {
                this.loadedPojoHistory = await loadFromFile(vault, path);
            } catch (e) {
                console.error("ERROR loading Pojo History", e);
                return;
            }
        }

        this.pojo = new PojoConvert(this.app, this.loadedPojoSettings);
    }

    async scanFiles (settings: CompletrSettings, files: TFile[]) {
        const importFolder = this.loadedPojoSettings.import_folder;
        console.log("Scanning total files num: " + files.length);
        for (const file of files) {
            if (file.path.startsWith(importFolder)) {
                await this.scanFile(settings, file, false);
            }
        }
        console.log(this.loadedPojoHistory);

        await this.saveHistory(files[0].vault);
    }

    async scanFile (settings: CompletrSettings, file: TFile, saveImmediately: boolean) {
        const contents = await file.vault.cachedRead(file);

        const regex = new RegExp(/^#\w+\/\w+(.*)$|^###\s\w+\/\w+(.*)$/, "gm");
        for (const match of contents.matchAll(regex)) {
            const groupValue = match[0];
            if (!groupValue)
                continue;

            this.addToHistory(groupValue);
        }

        console.log("DONE THE SCANNING!!!");
        //        if (saveImmediately)
        //            await this.saveData(file.vault);
    }

    addToHistory (line: string) {
        line = this.pojo.stripLeading(line);
        if (!line) {
            return null;
        }
        const tobj: object = this.pojo.parseTagLine(line);
        if (!tobj) { return null; }
        //        console.log(line);
        //        console.log(tobj);

        const dbname = tobj.database.toLowerCase();
        if (!this.loadedPojoHistory[dbname]) {
            this.loadedPojoHistory[dbname] = {};
        }
        for (let key in tobj) {
            const val = tobj[key];
            key = key.toLocaleLowerCase();
            if (key !== "canonical" && key !== "database" && key !== "description") {
                if (!this.loadedPojoHistory[dbname]) {
                    this.loadedPojoHistory[dbname] = {};
                }
                if (!this.loadedPojoHistory[dbname][key]) {
                    this.loadedPojoHistory[dbname][key] = [];
                }
                if (!this.loadedPojoHistory[dbname][key].includes(val)) {
                    this.loadedPojoHistory[dbname][key].push(val);
                }
            }
        }
    }

    async saveHistory (vault: Vault) {

        await vault.adapter.write(intoCompletrPath(vault, POJO_HISTORY_FILE), JSON.stringify(this.loadedPojoHistory, null, 3));
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


    async deleteHistory (vault: Vault) {
        console.log("TBD to implement deleteHistory");
        //        this.wordMap.clear();
        //        await this.saveData(vault);
    }

    private getValues (dinfo: object, pname: string, type?: string): string[] | null {
        //        console.log("getValues with " + pname + " type: " + type, dinfo);
        if (!dinfo["field-info"] || !dinfo["field-info"][pname]) {
            return [];
        }

        const finfo = dinfo["field-info"][pname];
        if (finfo.allowed == "fixed") {
            if (!finfo.values || !finfo.values["_ALL"]) {
                console.error("ERROR getting field info for " + pname, dinfo);
                return [];
            }
            return finfo.values["_ALL"];
        } else if (finfo.allowed == "history-type") {
            if (!type) {
                console.error("ERROR with finfo.allowed of " + finfo.allowed, finfo);
                return [];
            }
            let values = [];
            if (finfo.values && finfo.values[type]) {
                values = finfo.values[type];
            }
            return [...new Set([...values, ...this.getHistoryValues(dinfo, pname + "-" + type)])];
        } else if (finfo.allowed == "history") {
            let values = [];
            if (finfo.values && finfo.values["_ALL"]) {
                values = finfo.values["_ALL"];
            }
            return [...new Set([...values, ...this.getHistoryValues(dinfo, pname)])];
        } else {
            console.error("ERROR - unknown allowed property: " + finfo.allowed, finfo);
            return [];
        }
    }

    private getHistoryValues (dinfo: object, dkey: string): string[] {

        console.log("Get History  " + dinfo.database, dkey);

        const dbname = dinfo.database.toLowerCase();
        dkey = dkey.toLocaleLowerCase();

        if (this.loadedPojoHistory[dbname]) {
            if (this.loadedPojoHistory[dbname][dkey]) {
                return this.loadedPojoHistory[dbname][dkey];
            }
        }

        return [];
    }

    private generateHint (robj: ReturnObject): string | null {
        if (!robj || !robj.database) { return null; }
        const dinfo = this.pojo.getDatabaseInfo(robj.database);
        let hint = `${robj.database}/`;
        if (robj.type) {
            hint += robj.type;
        } else {
            hint += dinfo.type;
        }
        const ptext = dinfo.params.join("; ");
        hint += " " + ptext;
        return hint;
    }

    private extractPojo (line: string): ReturnObject | null {

        const robj: ReturnObject = { trigger: "", loc: "", values: [] };
        const nDefinition = 1;

        const params = line.split(" ");
        const plen = params.length;
        //        console.log("params len:" + plen, params);
        const ptype = params[0].split("/");
        //        console.log("params[0] ptypelen:" + ptype.length, params[0]);

        robj.type = null;
        if (plen <= nDefinition) {
            if (ptype.length == 1 && !params[0].endsWith("/")) {
                robj.loc = "database";
            } else if (!line.endsWith(" ")) {
                robj.loc = "type";
            }
        }
        //        console.log("loc " + nDefinition, robj.loc);

        if (robj.loc == "database") {
            robj.values = filterValues(line, this.pojo.getDatabases());
            return robj;
        } else if (robj.loc == "type") {
            robj.database = ptype[0];
            const dinfo = this.pojo.getDatabaseInfo(robj.database);
            if (!dinfo) {
                return null;
            }
            const search = ptype[1] ? ptype[1] : "";
            const svalues = this.getValues(dinfo, dinfo.type);
            robj.values = filterValues(search, svalues);
        } else {
            if (ptype.length !== 2) {
                console.error("ERROR - not a valid pojo tag! " + line);
                return null;
            }
            robj.database = ptype[0];
            const dinfo = this.pojo.getDatabaseInfo(robj.database);
            if (!dinfo) {
                return null;
            }

            robj.type = ptype[1];
            params.shift();
            const stext = params.join(" ");
            const sfields = stext.split(";");
            const slen = sfields.length;
            robj.loc = `param${slen}`;
            const svalues = this.getValues(dinfo, dinfo.params[slen - 1], robj.type);
            robj.values = filterValues(sfields[slen - 1], svalues);
        }
        return robj;
    }

}

export const Pojo = new PojoSuggestionProvider();

/*
 * Ensures there is at least one character worth of whitespace at the end of the provided string.
 */
function untrimEnd (string: string) {
    if (string.trimEnd() !== string)
        return string; // There's already some whitespace at the end.

    return `${string} `;
}

type ReturnObject = {
    trigger: string,
    loc: string,
    values: Suggestion[],
    database?: string,
    type?: string,
    params?: string[],
}

function filterValues (input: string, values: string[]): Suggestion[] {
    const sa: Suggestion[] = [];
    let av: string[] = values;
    if (input) {
        const lcin = input.toLocaleLowerCase();
        av = values.filter(value => value.toLowerCase().startsWith(lcin));
    }

    for (const v of av) {
        sa.push(Suggestion.fromString(v, null, "pojo"));
    }
    return sa;
}


/*
 * Loads suggestions from a file.
 */
export async function loadFromFile (vault: Vault, file: string) {
    const rawData = await vault.adapter.read(file);
    let data: unknown;

    // Parse the suggestions.
    try {
        data = JSON.parse(rawData);
    } catch (e) {
        console.log("Completr pojo parse error:", e.message);
        throw new Error(`Failed to parse file ${file}.`);
    }

    // Return suggestions.
    return data;
}
