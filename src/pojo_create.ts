import { App, Modal, FuzzySuggestModal, Setting, TFile, DropdownComponent, MarkdownView, prepareSimpleSearch } from "obsidian";
import { PojoSettings } from './settings';
import { PojoConfirm } from './pojo_dialog';
import { Searcher } from "fast-fuzzy";

export class PojoCreate extends Modal {
    private history: object;
    private logs: object;
    private pojo: object;
    private app: App;
    private settings: PojoSettings;
    private currentFile: TFile;
    private statusbar: HTMLElement;
    private tags: object[];
    private tagsearch: object;

    constructor(app: App, pojo: object, settings: PojoSettings, statusbar: HTMLElement) {
        super(app);
        this.app = app;
        this.settings = settings;
        this.pojo = pojo;
        this.statusbar = statusbar;

        console.log("CURRENT FILE CONTENT");
        const currentFile: TFile = app.workspace.getActiveFile();
        if (currentFile && currentFile.parent && currentFile.parent.name == "Daily Notes") {
            console.log("YES this is a valid file for pojo!");
            this.currentFile = currentFile;
        }
        /*
                const editor = app.workspace.activeEditor;
                console.log("app.workspace.activeEditor", editor);
        
        
                const view = app.workspace.getActiveViewOfType(MarkdownView);
                console.log("HERE VIEW", view);
                const curs = view.editor.getCursor();
                // curs will have ch and line
                console.log("CURSOR IS", curs);
                const line = view.editor.getLine(curs.line);
                view.editor.setLine(curs.line, line + " TWEE DOODLY DOODLYWUM");
        */
    }

    async onOpen () {
        const self = this;
        const { contentEl } = this;

        const bSuccess = await self.pojo.InitDatabases();
        if (!bSuccess) {
            self.pojo.logError("ERROR initializing Databases!");
        }

        const view = self.app.workspace.getActiveViewOfType(MarkdownView);
        const curs = view.editor.getCursor();
        // curs will have ch and line
        console.log("CURSOR IS", curs);
        const currLineNum = curs.line;
        const currLineText = view.editor.getLine(currLineNum);

        console.log("HERE is the currLineText", currLineText);

        let pExistingInfo = null;
        if (currLineText && currLineText.charAt(0) == "#") {
            const pline = currLineText.slice(1);
            pExistingInfo = this.pojo.parsePojoLine(pline);
            console.log("HERE IS pExistingInfo!", pExistingInfo);
        }

        const msg = "Pojo Version: " + this.settings.version_manifest + " | Settings Version: " + this.settings.version_settings;

        const todaydailyname = self.pojo.getDailyNoteName(null);
        console.log("TODAY's Daily NOTE NAME is ", todaydailyname);


        contentEl.empty();
        this.titleEl.setText("POJO Create or Edit Structured Entry");

        const _cbResult = function (result: string, updateVals: object) {
            console.log("HERE is thre result", result);
            console.warn("NEED TO UPDATE THESE VALS", updateVals);

            if (updateVals && Object.keys(updateVals).length > 0) {
                const newUpdates = [];
                for (const name in updateVals) {
                    const narr = updateVals[name];
                    for (const nobj of narr) {
                        if (nobj.type == "param") {
                            newUpdates.push({
                                database: nobj.database,
                                key: nobj.key,
                                value: nobj.value
                            });
                        } else {
                            console.warn("NOT sure what to do with this for updating", nobj);
                        }
                    }
                }
                if (newUpdates.length > 0) {
                    // Need to UPDATE this 
                    console.log("NEED to update this val", newUpdates);

                    const saveHistoryChanges = async function (historyC) {
                        return await self.pojo.saveHistoryChanges(self.app.vault, historyC);
                    }

                    new PojoConfirm(self.app, newUpdates, saveHistoryChanges).open();
                }
            }

            view.editor.setLine(currLineNum, result);
        }

        if (!pExistingInfo) {
            self.tags = self.pojo.getSuggestedTags();
            self.tagsearch = new Searcher(this.tags, { keySelector: (obj) => obj.name });

            console.log("HERE ARE TAGS", this.tags);
            console.log("HERE IS tagsearch", this.tagsearch);



            new TagModal(app, self.tags,
                function (selitem: object) {
                    console.log("HERE is the selected item", selitem);
                    self.metaDetails(
                        self,
                        selitem.item,
                        _cbResult
                    )
                }
            ).open();
        } else {
            self.metaDetails(self, pExistingInfo, _cbResult);
        }
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }

    metaDetails (self: object, sitem: object, cb: any) {

        console.log("metaDetails with sitem", sitem);

        const contentEl = this.contentEl;
        const dbname = sitem._database;
        const dbinfo = self.pojo.getDatabaseInfo(dbname);
        const meta = self.pojo.getTagMetadata(dbname, sitem._type);
        console.log('HERE IS meta ', meta, dbinfo);

        const base = `#${dbname}/${sitem._type}`;

        const topEl = new Setting(contentEl)
            .setName("Information")
            .setDesc(base)

        const metaobj = {};
        let bigtextfield;
        let finalcommand;
        const _updateCmd = function (fname: string, cmd: string, paramnum: number) {
            //            console.log(`_updateCmd called :${fname}: :${cmd}: :${paramnum}:`);
            if (paramnum) {
                for (let n = 1; n < paramnum; n++) {
                    const key = `p${n}`;
                    if (!metaobj.hasOwnProperty(key)) {
                        metaobj[key] = ";";
                    }
                }
                metaobj[`p${paramnum}`] = cmd;
            } else {
                metaobj[fname] = cmd;
            }

            //            console.log("HERE IS metaobj", metaobj);

            let meta = "";
            let params = "";
            for (const field in metaobj) {
                const fv = metaobj[field];
                //                console.log("HERE IS fv", fv, field);
                if (self.pojo.checkIfMetaMeta(fv)) {
                    meta += " " + fv;
                } else {
                    params += " " + fv;
                }
            }
            const msg = base + params + meta;
            topEl.setDesc(msg);
            finalcommand = msg;
            if (bigtextfield) {
                bigtextfield.setValue(msg);
            }
        }

        const updateVals = {};
        const _addToUpdates = function (name: string, type: string, value: string) {
            if (!updateVals[name]) { updateVals[name] = []; }
            const elUpdated = updateVals[name].find(el => {
                if (el.name == name && el.type == type) {
                    el.value = value;
                    return true;
                } else {
                    return false;
                }
            });
            if (!elUpdated) {
                if (type == "param") {
                    let key = `${name}`;
                    if (dbinfo["field-info"][name]) {
                        if (dbinfo["field-info"][name].allowed == "history-type") {
                            key = `${sitem._type}_${name}`;
                        }
                    }
                    updateVals[name].push({
                        name: name,
                        type: type,
                        database: sitem._database,
                        key: key,
                        value: value
                    })
                } else {
                    updateVals[name].push({
                        name: name,
                        type: type,
                        value: value
                    });
                }
            }
        }
        // Add all the params
        if (meta && meta.length > 0) {
            let pnum = 0;
            for (const mfield of meta) {
                pnum++;
                mfield.pnum = pnum;
                new Setting(contentEl)
                    .setName(mfield.name)
                    .addText(text => {
                        text.setDisabled(false)
                        // Set any initial value
                        if (sitem[mfield.name]) {
                            let val = sitem[mfield.name];
                            if (Array.isArray(val)) {
                                if (mfield.multi && mfield.multi == "COMMA") {
                                    val = sitem[mfield.name].join(",");
                                }
                            }
                            text.inputEl.addClass('pojo-set');
                            mfield.fulltext = val + ";";
                            _updateCmd(mfield.name, mfield.fulltext, mfield.pnum);
                            text.setValue(val);
                        }
                        mfield.textfield = text;
                        text.onChange(async (val) => {
                            text.inputEl.addClass('pojo-set');
                            mfield.fulltext = val + ";";
                            _addToUpdates(mfield.name, "param", val);
                            _updateCmd(mfield.name, mfield.fulltext, mfield.pnum);
                        })
                    })
                    .addDropdown(dropDown => {
                        mfield.dropdown = dropDown;
                        //                      console.log("ADDING DROPDOWN", mfield);
                        dropDown.addOption("", "Choose Value:");
                        for (const v of mfield.vals) {
                            dropDown.addOption(v, v);
                        }
                        dropDown.onChange(async (val) => {
                            console.log("DD for " + mfield.name, val);
                            mfield.textfield.inputEl.addClass('pojo-set');

                            const tf = mfield.textfield.getValue();
                            if (!val) {
                                // Selecting the nothing option will reset the field.
                                mfield.textfield.setValue("");
                                _updateCmd(mfield.name, "", mfield.pnum);
                            } else if (tf && mfield.multi !== "NA") {
                                let cfv;
                                let sep = mfield.multi;
                                if (mfield.multi == "COMMA") { sep = ","; }
                                cfv = tf.split(sep);
                                if (!cfv.includes(val)) {
                                    mfield.fulltext += sep + val;
                                    mfield.textfield.setValue(mfield.fulltext);
                                    _updateCmd(mfield.name, mfield.fulltext + ";", mfield.pnum);
                                }
                            } else {
                                // Change with current value (just one).
                                mfield.fulltext = val;
                                mfield.textfield.setValue(val);
                                _updateCmd(mfield.name, val + ";", mfield.pnum);
                            }

                        })
                    })
                    .addExtraButton(button => button
                        .setIcon('x-circle')
                        .setTooltip("Clear values")
                        .onClick(async () => {
                            console.log("mfield", mfield);
                            console.log("CLICKED TO CLEAR " + mfield.name)
                            mfield.fulltext = "";
                            mfield.textfield.setValue("");
                            _updateCmd(mfield.name, mfield.fulltext, mfield.pnum);
                            mfield.textfield.inputEl.removeClass("pojo-set");
                            mfield.dropdown.setValue("");
                        })
                    );
            }
        }

        // ExPERIMENTAL ADDING...
        const bob = true;

        if (!bob) {

            if (meta && meta.length > 0) {
                let pnum = 0;
                for (const mfield of meta) {
                    pnum++;
                    mfield.pnum = pnum;
                    new Setting(contentEl)
                        .setName("EX " + mfield.name)
                        .addText(text => {
                            text.setDisabled(false)
                            mfield.textfieldex = text;
                            text.onChange(async (val) => {
                                console.log("TODO implement onChange for " + val);
                                //                            _updateCmd(mfield.name, val + ";");
                            })
                        })
                        .addSearch(search => {
                            //                            for (const v of mfield.vals) {
                            //                                search
                            //                            }
                            console.log("LADDING DA SEARCH", search);
                            search.setPlaceholder("Get Going...");
                            //                            new ArraySuggest(self.app, search.inputEl, ["Dude", "Bob", "Frank", "Duck"]);
                            search.onChange(async (val) => {
                                console.log("HERE IS THE val", val);
                                mfield.textfieldex.inputEl.addClass('pojo-set');
                            });
                        });
                }
            }

        }

        //        console.log("DUDDE SO FAE...");

        const _setupTimeChooser = function (dd: DropdownComponent, unit: string, display: string, bDuration: boolean) {
            const hhmax = bDuration ? 8 : 24;
            const mstep = bDuration ? 5 : 5;
            for (let hh = 0; hh < hhmax; hh++) {
                for (let mm = 0; mm < 60; mm += mstep) {
                    let time = hh < 10 ? `0${hh}:` : `${hh}:`;
                    if (bDuration && hh == 0) {
                        time = mm < 10 ? `0${mm}` : `${mm}`;
                    } else {
                        time += mm < 10 ? `0${mm}` : `${mm}`;
                    }
                    const val = time;
                    const label = "  " + display + " " + time + "  ";
                    dd.addOption(val, label);
                }
            }
        };

        const _getTimeValue = function (type: string, value): string {
            if (type == "duration") {
                const dv = parseInt(value, 10);
                return _getTime(type, dv, 0);
            } else {
                console.error("NOT SUPPORTED TYPE " + type);
            }
            return value;
        }

        const _getTime = function (type: string, tmins: number, thrs: number): string {

            let hr = thrs;
            let min = Math.ceil((tmins - 2) / 5) * 5;
            while (min >= 60) {
                hr++;
                min -= 60;
            }

            let time;
            if (type == "time") {
                time = hr < 10 ? `0${hr}:` : `${hr}:`;
                time += min < 10 ? `0${min}` : `${min}`;
            } else if (type == "duration") {
                if (hr == 0) {
                    time = `${min}`;
                } else {
                    time = hr < 10 ? `0${hr}:` : `${hr}:`;
                    time += min < 10 ? `0${min}` : `${min}`;
                }
            } else {
                console.error("UNKNOWON TYPE " + type);
                return "";
            }

            return time;
        }

        const now = new Date();
        const start = _getTime('time', now.getMinutes(), now.getHours());
        console.log("HERE is the start time", start);

        const metatimes = this.pojo.getMetaMeta("times");

        // SETUP TIME RELATED
        const timeEl = new Setting(contentEl);
        timeEl.setName("Time");

        const _addTimeDropDown = function (mobj: object) {

            timeEl.addDropdown(ddd => {
                mobj.dropdown = ddd;
                const prefix = mobj.prefix ? mobj.prefix: '@';
                _setupTimeChooser(ddd, mobj.units[0], mobj.display, false);
                if (mobj.type == 'start-time') {
                    mobj.valset = true;
                    _updateCmd(mobj.name, `${prefix}${start}${mobj.units[0]}`);
                    ddd.selectEl.addClass('pojo-set');
                    ddd.setValue(`${start}`);
                } else {
                    ddd.setValue(`${start}`);
                }

                // Set any initial value
                if (sitem[mobj.name]) {
                    let val = sitem[mobj.name];

                    // Make sure time fits dropdown format (HH:MM)
                    const a = val.split(":");
                    if (a[0].length == 1) {
                        val = "0" + val;
                    }

                    _updateCmd(mobj.name, `${prefix}${val}${mobj.units[0]}`);
                    ddd.selectEl.addClass('pojo-set');
                    mobj.valset = true;
                    ddd.setValue(val);
                }

                ddd.onChange(async (val) => {
                    console.log("Val for " + mobj.name, val);
                    ddd.selectEl.addClass('pojo-set');
                    const nval = `@${val}${mobj.units[0]}`;
                    mobj.valset = true;
                    mobj.value = nval;
                    _updateCmd(mobj.name, nval);
                })
            })
        }

        if (metatimes["start-time"]) {
            _addTimeDropDown(metatimes["start-time"][0]);
        }

        if (metatimes["duration"]) {
            const mobj = metatimes["duration"][0];
            const prefix = mobj.prefix ? mobj.prefix: '@';
            timeEl.addDropdown(ddd => {
                mobj.dropdown = ddd;
                _setupTimeChooser(ddd, mobj.units[0], mobj.display, true);
                ddd.setValue('50');
                if (sitem[mobj.name]) {
                    const val = sitem[mobj.name];
                    _updateCmd(mobj.name, `${prefix}${val}${mobj.units[0]}`);
                    ddd.selectEl.addClass('pojo-set');
                    mobj.valset = true;
                    ddd.setValue(_getTimeValue(mobj.type, val));
                }
                ddd.onChange(async (val) => {
                    console.log("Val for " + mobj.name, val);
                    ddd.selectEl.addClass('pojo-set');
                    const vala = val.split(":");
                    let mins = parseInt(val, 10);
                    console.log("HERE mins " + mins, vala);
                    if (vala.length > 1) {
                        mins = parseInt(vala[0], 10) * 60 + parseInt(vala[1], 10);
                    }
                    mobj.valset = true;
                    const nval = `@${mins}${mobj.units[0]}`;
                    mobj.value = nval;
                    _updateCmd(mobj.name, nval);
                })
            })
        }

        if (metatimes["end-time"]) {
            _addTimeDropDown(metatimes["end-time"][0]);
        }

        const timetypes = ["duration", "start-time", "end-time"];
        timeEl.addExtraButton(button => button
            .setIcon('arrow-left-right')
            .setTooltip("Swap Start and End as Selected")
            .onClick(async () => {
                for (const tkey in metatimes) {
                    const titem = metatimes[tkey][0];
                    if (titem.type == "start-time" || titem.type == "end-time") {
                        if (titem.valset) {
                            _updateCmd(titem.name, "");
                            titem.valset = false;
                            titem.dropdown.selectEl.removeClass("pojo-set");
                        } else {
                            const cval = titem.dropdown.getValue();
                            const nval = `@${cval}${titem.units[0]}`;
                            _updateCmd(titem.name, nval);
                            titem.valset = true;
                            titem.value = nval;
                            titem.dropdown.selectEl.addClass("pojo-set");
                        }
                    }
                }
            })
        );
        timeEl.addExtraButton(button => button
            .setIcon('x-circle')
            .setTooltip("Clear values")
            .onClick(async () => {
                for (const tkey in metatimes) {
                    const titem = metatimes[tkey][0];
                    if (timetypes.includes(titem.type)) {
                        _updateCmd(titem.name, "");
                        titem.valset = false;
                        titem.dropdown.selectEl.removeClass("pojo-set");
                    }
                }
            })
        );


        // SETUP TEXT RELATED
        const metatext = metatimes["text"];
        if (metatext) {
            for (const mobj of metatext) {
                console.log("HERE BE ", mobj);
                const prefix = mobj.prefix ? mobj.prefix: '@';
                new Setting(contentEl)
                    .setName(mobj.name)
                    .addText(text => {
                        if (sitem[mobj.name]) {
                            let val = sitem[mobj.name];

                            if (Array.isArray(val)) {
                                if (mobj.multi && mobj.multi == "COMMA") {
                                    val = sitem[mobj.name].join(",");
                                }
                            }
                            text.inputEl.addClass('pojo-set');
                            mobj.fulltext = val + ";";
                            _updateCmd(mobj.name, `${prefix}${val}${mobj.units[0]}`)
                            text.setValue(val);
                        }
                        mobj.textfield = text;
                        text.setPlaceholder(mobj.name + " " + mobj.display);
                        text.onChange(async (val) => {
                            text.inputEl.addClass('pojo-set');
                            console.log("HERE is text for " + mobj.name);
                            _addToUpdates(mobj.name, "metatext", val);
                            if (!updateVals[mobj.name]) { updateVals[mobj.name] = []; }
                            updateVals[mobj.name].push("name: " + mobj.name, "type: metatext", "value: " + val);
                            const nval = `@${val}${mobj.units[0]}`;
                            _updateCmd(mobj.name, nval);
                        })
                    })
                    .addDropdown(dropDown => {
                        dropDown.addOption("", "Choose Value:");
                        mobj.dropdown = dropDown;
                        if (mobj.allowed == "history" && mobj.history) {
                            for (const v of mobj.history) {
                                dropDown.addOption(v, v);
                            }
                        }
                        dropDown.onChange(async (val) => {
                            console.log("DD for " + mobj.name, val);
                            mobj.textfield.inputEl.addClass('pojo-set');

                            const tf = mobj.textfield.getValue();
                            if (!val) {
                                // Selecting the nothing option will reset the field.
                                mobj.textfield.setValue("");
                                _updateCmd(mobj.name, "");
                            } else if (tf && mobj.multi !== "NA") {
                                let cfv;
                                let sep = mobj.multi;
                                if (mobj.multi == "COMMA") { sep = ","; }
                                cfv = tf.split(sep);
                                if (!cfv.includes(val)) {
                                    mobj.fulltext += sep + val;
                                    mobj.textfield.setValue(mobj.fulltext);
                                    _updateCmd(mobj.name, `${prefix}${mobj.fulltext}${mobj.units[0]}`);
                                }
                            } else {
                                // Change with current value (just one).
                                mobj.fulltext = val;
                                mobj.textfield.setValue(val);
                                _updateCmd(mobj.name, `${prefix}${mobj.fulltext}${mobj.units[0]}`);
                            }

                        })
                    })
                    .addExtraButton(button => button
                        .setIcon('x-circle')
                        .setTooltip("Clear values")
                        .onClick(async () => {
                            console.log("mfield", mobj);
                            mobj.fulltext = "";
                            mobj.textfield.setValue("");
                            _updateCmd(mobj.name, "");
                            mobj.textfield.inputEl.removeClass("pojo-set");
                            mobj.dropdown.setValue("");
                        })
                    );
            }
        }

        // SETUP SCALES
        const metascale = metatimes["scale"];
        if (metascale) {
            for (const mobj of metascale) {
                console.log("HERE BE scale obj", mobj);
                console.log("HERE BE SITEM", sitem[mobj.name]);
                const prefix = mobj.prefix ? mobj.prefix: '@';
                const sliderEl = new Setting(contentEl);
                sliderEl.setName(mobj.name);
                sliderEl.addSlider(slide => {
                    slide.setDynamicTooltip();
                    slide.setValue((mobj.max - mobj.min) * 0.5);
                    slide.setLimits(mobj.min, mobj.max, 1);
                    slide.onChange(async (val) => {
                        console.log(mobj.name + " val is " + val);
                        mobj.textfield.setValue(val + " " + mobj.display);
                        mobj.textfield.inputEl.addClass('pojo-set');
                        _updateCmd(mobj.name, `${prefix}${val}${mobj.units[0]}`);
                    })
                });
                sliderEl.addText(text => {
                    mobj.textfield = text;
                    text.disabled = true;
                    text.setPlaceholder(mobj.name);
                });
                sliderEl.addExtraButton(button => button
                    .setIcon('x-circle')
                    .setTooltip("Clear value")
                    .onClick(async () => {
                        mobj.fulltext = "";
                        mobj.textfield.setValue("");
                        _updateCmd(mobj.name, "");
                        mobj.textfield.inputEl.removeClass("pojo-set");
                    })
                );
            }
        }

        const descEl = new Setting(contentEl);
        //        descEl.settingEl.addClass("completr-full-width");
        descEl.addTextArea(ta => {
            ta.setPlaceholder("Optionally add Description Here");
            ta.onChange(async (val) => {
                ta.inputEl.addClass('pojo-set');
                console.log("Description is ", val);
                _updateCmd("Description", val);
            });
            ta.inputEl.addClass("completr-full-width");
        });


        const endEl = new Setting(contentEl);
        endEl.addText(text => {
            text.setPlaceholder("This is just a placeholder temporarily for the final line");
            bigtextfield = text;
            text.inputEl.addClass("completr-full-width")
        });

        new Setting(this.modalEl)
            .addButton(button => {
                button.setButtonText("OK")
                //                buttonCallback(button);
                button.onClick(async () => {
                    console.log("CLICK OK");
                    //                    await clickCallback(edittext);
                    if (cb) { cb(finalcommand, updateVals); }
                    this.close();
                })
            })
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");

    }
}


interface TagChoice {
    _database: string,
    _type: string,
    name: string
}


class TagModal extends FuzzySuggestModal<TagChoice> {

    private app: App;
    private cb: any;
    private tags: TagChoice[];
    private bNoSuggestion: boolean;

    constructor(app: App, tags: TagChoice[], cb: any) {
        super(app);
        this.app = app;
        this.cb = cb;
        this.tags = tags;
        this.limit = 10;
        this.bNoSuggestion = false;
        this.emptyStateText = "Enter Tag Text";
        this.setPlaceholder("HERE DA PLACE HOLDER");
    }

    //    onOpen (): void {
    //        console.log("onOpen of TagModal");
    //    }

    onNoSuggestion (): void {
        console.log("HERE is no suggestion eh?");
        this.bNoSuggestion = true;
    }

    getItems (): TagChoice[] {
        return this.tags;
    }

    getItemText (tag: TagChoice) {
        return tag.name;
    }

    // Perform action on the selected suggestion.
    onChooseSuggestion (tag: TagChoice, evt: MouseEvent | KeyboardEvent) {
        //        console.log("HERE IS INPUT VALUE: " + this.inputEl.value);
        //        console.log("HERE IS DA TAG", tag);

        if (this.bNoSuggestion) {
            console.log("GOTS THIS " + this.inputEl.value);
        } else {
            console.log("GOT THIS", tag);
        }

        //        this.inputEl.textContent
        this.cb(tag);
    }
}