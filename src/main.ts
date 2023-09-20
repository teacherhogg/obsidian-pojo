import { EditorPosition, KeymapContext, MarkdownView, Plugin, Platform } from "obsidian";
import SnippetManager from "./snippet_manager";
import SuggestionPopup, { SelectionDirection } from "./popup";
import { PojoSettings, DEFAULT_SETTINGS } from "./settings";
import PojoSettingsTab from "./settings_tab";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { editorToCodeMirrorState, posFromIndex } from "./editor_helpers";
import { Pojo } from "./provider/pojo_provider";

export default class PojoPlugin extends Plugin {

    settings: PojoSettings;
    statusbar: HTMLElement;

    private snippetManager: SnippetManager;
    private _suggestionPopup: SuggestionPopup;

    async onload () {
        const platform = Platform;

        if (platform.isDesktop) {
            this.statusbar = this.addStatusBarItem();
        } else {
            this.statusbar = null;
        }

        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.settings.version_manifest = this.manifest.version;
        this.settings.isDesktop = platform.isDesktop;
        if (this.settings.frontmatter_always_add) {
            this.settings.frontmatter_always_add.POJO = this.manifest.version;
        }
        if (this.settings.frontmatter_always_add_moc) {
            this.settings.frontmatter_always_add_moc.push("POJO: " + this.manifest.version);
        }

        console.log("POJO PLUGIN onload called...", this.settings);
        // This initializes all of pojo.
        await Pojo.loadSuggestions(this.app.vault, this.settings, this.app);
        console.log("POJO initialized Version " + this.settings.version_manifest);

        this.snippetManager = new SnippetManager();
        this._suggestionPopup = new SuggestionPopup(this.app, this.settings, this.snippetManager);

        this.registerEditorSuggest(this._suggestionPopup);

        //        this.registerEditorExtension(markerStateField);
        //        this.registerEditorExtension(EditorView.updateListener.of(new CursorActivityListener(this.snippetManager, this._suggestionPopup).listener));

        this.addSettingTab(new PojoSettingsTab(this.app, this));

        this.setupCommands();

        if ((this.app.vault as any).config?.legacyEditor) {
            console.log("Pojo: Without Live Preview enabled, most features of Pojo will not work properly!");
        }
    }

    private setupCommands () {
        //This replaces the default handler for commands. This is needed because the default handler always consumes
        // the event if the command exists.
        const app = this.app as any;
        app.scope.keys = [];

        const isHotkeyMatch = (hotkey: any, context: KeymapContext, id: string): boolean => {
            //Copied from original isMatch function, modified to not require exactly the same modifiers for
            // completr-bypass commands. This allows triggering for example Ctrl+Enter even when
            // pressing Ctrl+Shift+Enter. The additional modifier is then passed to the editor.

            /* Original isMatch function:
            var n = e.modifiers
                , i = e.key;
            return (null === n || n === t.modifiers) && (!i || (i === t.vkey || !(!t.key || i.toLowerCase() !== t.key.toLowerCase())))
            */

            const modifiers = hotkey.modifiers, key = hotkey.key;
            if (modifiers !== null && (id.contains("completr-bypass") ? !context.modifiers.contains(modifiers) : modifiers !== context.modifiers))
                return false;
            return (!key || (key === context.vkey || !(!context.key || key.toLowerCase() !== context.key.toLowerCase())))
        }
        this.app.scope.register(null, null, (e: KeyboardEvent, t: KeymapContext) => {
            const hotkeyManager = app.hotkeyManager;
            hotkeyManager.bake();
            for (let bakedHotkeys = hotkeyManager.bakedHotkeys, bakedIds = hotkeyManager.bakedIds, r = 0; r < bakedHotkeys.length; r++) {
                const hotkey = bakedHotkeys[r];
                const id = bakedIds[r];
                if (isHotkeyMatch(hotkey, t, id)) {
                    const command = app.commands.findCommand(id);

                    // Condition taken from original function
                    if (!command || (e.repeat && !command.repeatable)) {
                        continue;
                    } else if (command.isVisible && !command.isVisible()) {
                        //HACK: Hide our commands when to popup is not visible to allow the keybinds to execute their default action.
                        continue;
                    } else if (id.contains("completr-bypass")) {
                        this._suggestionPopup.close();

                        const validMods = t.modifiers.replace(new RegExp(`${hotkey.modifiers},*`), "").split(",");
                        //Sends the event again, only keeping the modifiers which didn't activate this command
                        const event = new KeyboardEvent("keydown", {
                            key: hotkeyManager.defaultKeys[id][0].key,
                            ctrlKey: validMods.contains("Ctrl"),
                            shiftKey: validMods.contains("Shift"),
                            altKey: validMods.contains("Alt"),
                            metaKey: validMods.contains("Meta")
                        });
                        e.target.dispatchEvent(event);
                        return false;
                    }

                    if (app.commands.executeCommandById(id))
                        return false
                }
            }
        });

        // POJO Action Dialog
        this.addRibbonIcon('zap', 'POJO Main Dialog', () => {
            Pojo.pojoZap(this.app, this.statusbar);
        })

        this.addRibbonIcon('database', 'POJO Create or Edit Entry', () => {
            Pojo.pojoCreate(this.app, this.statusbar);
        })

        this.addCommand({
            id: 'pojo-create-edit-metadata',
            name: 'Create or Edit Structured Data Entry',
            editorCallback: (editor, view) => {
                Pojo.pojoCreate(this.app, this.statusbar);
            },
            // @ts-ignore
            isVisible: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view)
                    return false;
                const crsr = view.editor.getCursor();
                console.log("HERE is the crsr", crsr);
                return false;
            },
        });
        this.addCommand({
            id: 'pojo-dialog',
            name: 'POJO Main Dialog.',
            editorCallback: (editor) => {
                console.log("editorCallback for pojo-dialog")
                Pojo.pojoZap(this.app, this.statusbar);
            }
        });
    }

    async onunload () {
        this.snippetManager.onunload();
    }

    get suggestionPopup () {
        return this._suggestionPopup;
    }

    async saveSettings () {
        await this.saveData(this.settings);
    }
}

class CursorActivityListener {

    private readonly snippetManager: SnippetManager;
    private readonly suggestionPopup: SuggestionPopup;

    private cursorTriggeredByChange = false;
    private lastCursorLine = -1;

    constructor(snippetManager: SnippetManager, suggestionPopup: SuggestionPopup) {
        this.snippetManager = snippetManager;
        this.suggestionPopup = suggestionPopup;
    }

    readonly listener = (update: ViewUpdate) => {
        if (update.docChanged) {
            this.handleDocChange();
        }

        if (update.selectionSet) {
            this.handleCursorActivity(posFromIndex(update.state.doc, update.state.selection.main.head))
        }
    };

    private readonly handleDocChange = () => {
        this.cursorTriggeredByChange = true;
    };

    private readonly handleCursorActivity = (cursor: EditorPosition) => {
        // This prevents the popup from opening when switching to the previous line
        if (this.lastCursorLine == cursor.line + 1)
            this.suggestionPopup.preventNextTrigger();
        this.lastCursorLine = cursor.line;

        // Clear all placeholders when moving cursor somewhere else
        if (!this.snippetManager.placeholderAtPos(cursor)) {
            this.snippetManager.clearAllPlaceholders();
        }

        // Prevents the suggestion popup from flickering when typing
        if (this.cursorTriggeredByChange) {
            this.cursorTriggeredByChange = false;
            return;
        }

        this.suggestionPopup.close();
    };
}
