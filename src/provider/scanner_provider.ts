import {TFile, Vault} from "obsidian";
import {CompletrSettings} from "../settings";
import {DictionaryProvider} from "./dictionary_provider";
import {log} from "util";

const SCANNED_WORDS_PATH = ".obsidian/plugins/obsidian-completr/scanned_words.txt"

class ScannerSuggestionProvider extends DictionaryProvider {

    readonly wordMap: Map<string, Set<string>> = new Map<string, Set<string>>();

    async scanFiles(settings: CompletrSettings, files: TFile[]) {
        for (let file of files) {
            await this.scanFile(settings, file, false);
        }

        await this.saveData(files[0].vault);
    }

    async scanFile(settings: CompletrSettings, file: TFile, saveImmediately: boolean) {
        const contents = await file.vault.cachedRead(file);

        const regex = new RegExp("\\$+.*?\\$+|`+.*?`+|\\[+.*?]+|([" + settings.fileScannerCharacterRegex + "]+)", "gms");
        for (let match of contents.matchAll(regex)) {
            const groupValue = match[1];
            if (!groupValue || groupValue.length < settings.minWordLength)
                continue;

            this.addWord(groupValue);
        }

        if (saveImmediately)
            await this.saveData(file.vault);
    }

    async saveData(vault: Vault) {
        let output: string[] = [];
        for (let entry of this.wordMap.entries()) {
            output = [...output, ...entry[1]];
        }

        await vault.adapter.write(SCANNED_WORDS_PATH, output.join("\n"));
    }

    async loadData(vault: Vault) {
        if (!(await vault.adapter.exists(SCANNED_WORDS_PATH)))
            return

        const contents = (await vault.adapter.read(SCANNED_WORDS_PATH)).split("\n");
        for (let word of contents) {
            this.addWord(word);
        }
    }

    async deleteAllWords(vault: Vault) {
        this.wordMap.clear();
        await this.saveData(vault);
    }

    private addWord(word: string) {
        let list = this.wordMap.get(word.charAt(0));
        if (!list) {
            list = new Set<string>();
            this.wordMap.set(word.charAt(0), list);
        }

        list.add(word);
    }
}

export const FileScanner = new ScannerSuggestionProvider();
