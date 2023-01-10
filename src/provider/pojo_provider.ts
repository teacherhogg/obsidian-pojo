import {
    Suggestion,
    SuggestionContext,
    SuggestionProvider
} from "./provider";
import { CompletrSettings, intoCompletrPath } from "../settings";
import { Notice, parseLinktext, TFile, Vault, Platform } from "obsidian";
import { PojoHelper, loadFromFile } from "../pojo_helper";
import { PojoZap } from "../pojo_dialog";
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

    getSuggestions (context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        if (!settings.pojoProviderEnabled) {
            console.log("POJO Suggestions turned off!");
            return [];
        }

        const { editor } = context;
        const lineNumber = context.start.line;
        let line = editor.getLine(lineNumber);

        console.log("HERE IS DA pojo line", line);
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
            } else {
                new Notice(hint, 3000);
            }
            this.lasthint = hint;
        }
        console.log(`>>${line}<<`);
        console.log("parsePojoLine", pobj);

        return this.pojo.getSuggestedValues(pobj);
    }

    suggestionSelected (value: Suggestion): null {
        console.log("IN POJO WITH value of suggestion", value);
        return null;
    }

    async loadSuggestions (vault: Vault) {
        const path = intoCompletrPath(vault, POJO_SETTINGS_FILE);

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

        this.pojo = new PojoHelper(this, this.loadedPojoSettings);

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

    async scanFile (settings: CompletrSettings, file: TFile) {
        const contents = await file.vault.cachedRead(file);

        const regex = new RegExp(/^#\w+\/\w+(.*)$|^###\s\w+\/\w+(.*)$/, "gm");
        for (const match of contents.matchAll(regex)) {
            const groupValue = match[0];
            if (!groupValue)
                continue;

            this.pojo.addToHistory(groupValue);
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

    pojoZap (app: object, bJustHint: boolean): null {
        console.log("HERE is hint " + this.hint);
        new PojoZap(app, this.hint).open();
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

