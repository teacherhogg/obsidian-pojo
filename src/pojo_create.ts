import { App, Modal, FuzzySuggestModal, Setting, TFile, DropdownComponent } from "obsidian";
import { PojoSettings } from './settings';
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

    }

    async onOpen () {
        const self = this;
        const { contentEl } = this;

        const bSuccess = await self.pojo.InitDatabases();
        if (!bSuccess) {
            self.pojo.logError("ERROR initializing Databases!");
        }

        self.tags = self.pojo.getSuggestedTags();
        self.tagsearch = new Searcher(this.tags, { keySelector: (obj) => obj.name });

        console.log("HERE ARE TAGS", this.tags);
        console.log("HERE IS tagsearch", this.tagsearch);

        let msg;
        msg = "Pojo Version: " + this.settings.version_manifest + " | Settings Version: " + this.settings.version_settings;

        const todaydailyname = self.pojo.getDailyNoteName(null);
        console.log("TODAY's Daily NOTE NAME is ", todaydailyname);


        contentEl.empty();
        this.titleEl.setText("POJO Create Structured Entry");

        new TagModal(app, self.tags,
            function (selitem: object) {
                console.log("HERE is the selected item", selitem);
                self.metaDetails(self, selitem.item);
            }
        ).open();
    }

    onClose () {
        const { contentEl } = this;
        contentEl.empty();
    }

    metaDetails (self: object, sitem: object) {
        const contentEl = this.contentEl;

        const tag = "";
        const tag2 = "";
        let firstItem;

        const dbname = sitem.db;
        const meta = self.pojo.getTagMetadata(dbname, sitem.type);
        console.log('HERE IS meta ', meta);

        const base = `#${dbname}/${sitem.type} `;

        const topEl = new Setting(contentEl)
            .setName("Information")
            .setDesc(base)

        const metaobj = {};
        let bigtextfield;
        const _updateCmd = function (fname: string, cmd: string, paramnum: number) {
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

            console.log("HERE IS metaobj", metaobj);

            let msg = base;
            for (const field in metaobj) {
                msg += " " + metaobj[field];
            }
            topEl.setDesc(msg);
            if (bigtextfield) {
                bigtextfield.setValue(msg);
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
                        mfield.textfield = text;
                        text.onChange(async (val) => {
                            _updateCmd(mfield.name, val + ";");
                        })
                    })
                    .addDropdown(dropDown => {
                        console.log("ADDING DROPDOWN", mfield);
                        dropDown.addOption("", "Choose Value:");
                        for (const v of mfield.vals) {
                            dropDown.addOption(v, v);
                        }
                        dropDown.onChange(async (val) => {
                            console.log("DD for " + mfield.name, val);

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
                        .setIcon('plus-circle')
                        .setTooltip("Add additional values")
                        .onClick(async () => {
                            console.log("mfield", mfield);
                            console.log("CLICKED TO ADD to " + mfield.name)
                            mfield.fulltext += "," + mfield.textfield.getValue();
                            mfield.textfield.setValue(mfield.fulltext);
                        })
                    );
            }
        }

        console.log("DUDDE SO FAE...");

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


        console.log("HERE is metameta", self.settings.metameta);

        const _getTime = function (date: Date) {

            const hr = date.getHours();
            let time = hr < 10 ? `0${hr}:` : `${hr}:`;

            const min = Math.ceil((date.getMinutes() - 2) / 5) * 5;

            time += min < 10 ? `0${min}` : `${min}`;

            return time;
        }

        const now = new Date();
        const start = _getTime(now);
        console.log("HERE is the start time", start);

        const timeEl = new Setting(contentEl);
        timeEl.setName("Time");
        if (self.settings.metameta) {
            for (const mname in self.settings.metameta) {
                const mobj = self.settings.metameta[mname];
                switch (mobj.type) {
                    case 'start-time':
                    case 'end-time':
                        console.log("HERE BE ", mobj);
                        timeEl.addDropdown(ddd => {
                            _setupTimeChooser(ddd, mobj.units[0], mobj.display, false);
                            if (mobj.type == 'start-time') {
                                _updateCmd(mname, `@${start}${mobj.units[0]}`);
                                ddd.setValue(`${start}`);
                            } else {
                                ddd.setValue(`${start}`);
                            }
                            ddd.onChange(async (val) => {
                                console.log("Val for " + mobj.name, val);
                                const nval = `@${val}${mobj.units[0]}`;
                                _updateCmd(mname, nval);
                            })
                        })
                        break;
                    case 'duration':
                        timeEl.addDropdown(ddd => {
                            _setupTimeChooser(ddd, mobj.units[0], mobj.display, true);
                            ddd.setValue('50');
                            ddd.onChange(async (val) => {
                                console.log("Val for " + mobj.name, val);
                                const vala = val.split(":");
                                let mins = parseInt(val, 10);
                                console.log("HERE mins " + mins, vala);
                                if (vala.length > 1) {
                                    mins = parseInt(vala[0], 10) * 60 + parseInt(vala[1], 10);
                                }
                                _updateCmd(mname, `@${mins}${mobj.units[0]}`);
                            })
                        })
                        break;
                }
            }
        }

        const textEl = new Setting(contentEl);
        textEl.setName("Text");
        if (self.settings.metameta) {
            for (const mname in self.settings.metameta) {
                const mobj = self.settings.metameta[mname];
                switch (mobj.type) {
                    case 'text':
                        console.log("HERE BE ", mobj);
                        textEl.addText(text => {
                            text.setPlaceholder(mobj.name + " " + mobj.display);
                            text.onChange(async (val) => {
                                console.log("HERE is text for " + mobj.name);
                                const nval = `@${val}${mobj.units[0]}`;
                                _updateCmd(mname, nval);

                            })
                        })
                        break;
                }
            }
        }

        if (self.settings.metameta) {
            for (const mname in self.settings.metameta) {
                const mobj = self.settings.metameta[mname];
                switch (mobj.type) {
                    case 'scale':
                        console.log("HERE BE ", mobj);
                        const sliderEl = new Setting(contentEl);
                        sliderEl.setName(mobj.name);
                        sliderEl.addSlider(slide => {
                            slide.setDynamicTooltip();
                            slide.setValue((mobj.max - mobj.min) * 0.5);
                            slide.setLimits(mobj.min, mobj.max, 1);
                            slide.onChange(async (val) => {
                                console.log(mobj.name + " val is " + val);
                                mobj.textfield.setValue(val + " " + mobj.display);
                                _updateCmd(mobj.name, `@${val}${mobj.units[0]}`);
                            })
                        });
                        sliderEl.addText(text => {
                            mobj.textfield = text;
                            text.disabled = true;
                            text.setPlaceholder(mobj.name);
                        })
                        break;
                }
            }
        }

        const descEl = new Setting(contentEl);
        //        descEl.settingEl.addClass("completr-full-width");
        descEl.addTextArea(ta => {
            ta.setPlaceholder("Optionally add Description Here");
            ta.onChange(async (val) => {
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

        /*
                    case 'scale':
                        setEl
                            .setName(mname)
                            .addSlider(slide => {
                                slide.setLimits(mobj.min, mobj.max, 1);
                            })
                        break;

                const del = contentEl.createDiv("ddown");
                if (meta && meta.length > 0) {
                    for (const mfield of meta) {
                        const ddown = new DropdownComponent(del).onChange((v) => {
                            console.log("Ddown for " + mfield.name, v);
                        });
                        ddown.setValue(mfield.vals[0]);
                        for (let n = 0; n < mfield.vals; n++) {
                            ddown.addOption(mfield.vals[n], mfield.vals[n]);
                        }
                    }
                }
        */
        /*
                new Setting(contentEl)
                    .addDropdown()
                    .addTitle("TEstering")
                    .addText(text => text
                        .setValue(tag)
                        .onChange(async val => {
                            tag = val;
                            const results = self.tagsearch.search(val);
                            if (results) {
                                listDiv.empty();
                                let cnt = 0;
                                for (const item of results) {
                                    cnt++;
                                    if (cnt == 1) {
                                        firstItem = item;
                                    }
                                    new Setting(listDiv)
                                        .setName(item.name)
                                        .addExtraButton((button) => button
                                            .onClick(async () => {
                                                console.log("CLICKED ON item", item);
                                                listDiv.empty();
                                            })
                                        ).settingEl.addClass("completr-settings-list-item");
                                    if (cnt >= 10) { break; }
                                }
                            }
                        })
                    )
                    .addButton(button => button
                        .setButtonText("Add")
                        .onClick(() => {
                            console.log("BINGO on ", firstItem);
                            listDiv.empty();
                        })
                    )
        
                listDiv = contentEl.createDiv();
        */

        new Setting(this.modalEl)
            .addButton(button => {
                button.setButtonText("OK")
                //                buttonCallback(button);
                button.onClick(async () => {
                    console.log("CLICK OK");
                    //                    await clickCallback(edittext);
                    this.close();
                })
            })
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");

    }
}


interface TagChoice {
    database: string,
    type: string,
    name: string
}


class TagModal extends FuzzySuggestModal<TagChoice> {

    private app: App;
    private cb: any;
    private tags: TagChoice[];

    constructor(app: App, tags: TagChoice[], cb: any) {
        super(app);
        this.app = app;
        this.cb = cb;
        this.tags = tags;
        this.limit = 10;
        this.emptyStateText = "Enter Tag Text";
    }

    getItems (): TagChoice[] {
        return this.tags;
    }

    getItemText (tag: TagChoice) {
        return tag.name;
    }

    // Perform action on the selected suggestion.
    onChooseSuggestion (tag: TagChoice, evt: MouseEvent | KeyboardEvent) {
        this.cb(tag);
    }
}