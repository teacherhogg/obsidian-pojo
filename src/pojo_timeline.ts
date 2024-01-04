import { Vault, TFile, App, Notice, MarkdownView } from "obsidian";
import { getEA } from "obsidian-excalidraw-plugin";
import { ExcalidrawAutomate } from 'obsidian-excalidraw-plugin/lib/ExcalidrawAutomate';
import { PojoSettings } from "./settings";
import { WarningPrompt } from './utils/Prompts';
import { errorlog } from './utils/utils';


declare global {
    interface Window {
        ExcalidrawAutomate: ExcalidrawAutomate;
    }
}

export class PojoTimeline {

    private EA: ExcalidrawAutomate;
    private settings: PojoSettings;
    private vault: Vault;
    private app: App;
    private pojo: object;
    private dbasesAdd: string[];
    private dbIgnore: string[];
    private zeroy;
    private scale;
    private mindur;
    private lasty;
    // Width for time on col1
    private timewidth;
    // Width for col0, col1, and col2
    private colwidth;
    // Boxwidth in col1 (colwidth - timewidth)
    private boxwidth;

    constructor(settings: PojoSettings, pojo: object, vault: Vault, app: App) {
        this.settings = settings;
        this.pojo = pojo
        this.vault = vault;
        this.app = app;
        this.scale = 1;
        this.mindur = 40;

        // https://zsviczian.github.io/obsidian-excalidraw-plugin/
        // NOTE that y direction is vertical and y positive is down.
        // NOTE that x direction is horizontal and x positive to right.
        // NOTE three columns: col0, col1, col2
        // NOTE that x=0 is the left side of col1 
        this.timewidth = 75;
        this.colwidth = 500;
        this.boxwidth = this.colwidth - this.timewidth;

        // TODO - move these to POJO settings.
        this.zeroy = this._getMins("5:00");
        this.dbasesAdd = ["Places", "Night"];
        this.dbIgnore = ["Photo", "Tasks"];
        this.lasty = { col0: this.zeroy, col1: this.zeroy, col2: this.zeroy, colt: this.zeroy };


        this.EA = getEA();
        if (!this.EA) {
            (new WarningPrompt(
                this.app,
                "⚠ Excalidraw Plugin not found",
                "EXCALIDRAW_NOT_FOUND")
            ).show(async (result: boolean) => {
                new Notice("Excalidraw plugin not found.", 8000);
                errorlog({ fn: "constructor", where: "pojo_timeline.ts/PojoTimeline", message: "Excalidraw not found" });
            });
            return;
        } else {
            console.log("HERE IS the EA eh?", this.EA);
        }

        console.log("HERE IS timewidth", this.timewidth, this.scale);
    }

    async testing () {
        if (!this.EA) {
            new Notice("Excalidraw plugin not found. Cannot perform timeline visualization.", 8000);
            return false;
        }
        this.EA.reset();
        this.EA.addText(0, 0, "HERE DA TEST TEXT");
        this.EA.create({ onNewPane: true });

        return true;
    }

    async createTimeline () {

        const retobj = this._getEvents();
        if (!retobj || !retobj.success || !retobj.events) {
            return retobj;
        }

        this.EA.reset();
        // Draw the timeline
        for (let h = 0; h < 24; h++) {
            this._drawTime(h);
        }
        for (const event of retobj.events) {
            this._drawEvent(event);
        }
        this.EA.create({ onNewPane: true });

    }

    private _drawEvent (event) {

        const strokeColor = '#' + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, "0");

        this.EA.style.strokeColor = strokeColor;
        this.EA.style.strokeWidth = 2;

        let width = this.boxwidth;
        const bottom = event.start + event.dur;
        let duration = event.hasOwnProperty("dur") ? event.dur : 0;
        let x;
        let ystart = event.start;
        let txt = event.txt;
        const align = "left";
        let drawBox = true;
        let idlabel;
        if (event.start == 0) {
            // Event has no start time. Place this in colt
            x = 0;
            ystart = this.lasty.colt;
            duration = this.mindur * this.scale;
            this.lasty.colt = ystart - duration;
            drawBox = false;
        } else if (event.start < this.lasty.col0) {
            // Switch to col0
            x = -this.boxwidth - this.timewidth;
            this.lasty.col0 = bottom;
        } else {
            // Placing box in col1
            x = this.timewidth;
            this.lasty.col1 = bottom;
            if (duration < this.mindur * this.scale) {
                // Placing Label in col0
                txt = "";
                const len = event.txt.length;
                width = Math.min(this.boxwidth, len * 10);
                idlabel = this.EA.addText(-this.timewidth - this.boxwidth, ystart, event.txt, { box: false, width: width });
                const ell = this.EA.getElement(idlabel);
                //	    	console.log("HERE DA LABEL", ell);
                this.lasty.col0 = ystart + ell.height;
            }
        }

        // let txt = "( " + event.y + " to " + bottom + " )";

        let id = null;
        if (ystart) {
            if (!duration) {
                // Add just a line
                this.EA.style.strokeColor = "#000000";
                this.EA.style.strokeWidth = 10;
                id = this.EA.addLine([[x, ystart], [x + width, ystart]]);
                console.log("ADDED A LINE ", id, idlabel);
            } else {
                id = this.EA.addText(x, ystart, txt, { box: drawBox, height: duration, width: width, boxPadding: 0, textAlign: align });
            }
        }
        this.EA.style.strokeWidth = 2;
        this.EA.style.strokeColor = strokeColor;
        if (id && idlabel) {
            if (!duration) {
                const elLabel = this.EA.getElement(idlabel);
                const elLine = this.EA.getElement(id)
                console.log("HERE LABEL AND LINE", elLabel, elLine);
                this.EA.addArrow([[elLabel.x + elLabel.width, elLabel.y + elLabel.height * 0.5], [elLine.x, elLine.y]], { endArrowHead: "arrow" });
            } else {
                this.EA.connectObjects(idlabel, "right", id, "left", { endArrowHead: "arrow" });
            }
        }
        return id;
    }

    private _drawTime (hr) {
        let ht;
        if (hr < 12) {
            ht = hr + " am";
        } else {
            if (hr == 12) { ht = "12 pm"; }
            else {
                ht = hr - 12 + " pm";
            }
        }

        const ymins = hr * 60;
        const xend = this.colwidth;
        if (ymins > this.zeroy) {
            this.EA.addLine([[0, ymins * this.scale], [xend, ymins * this.scale]]);
            this.EA.addText(0, ymins * this.scale, ht);
        }
    }

    private _getEvents (): object {

        //check if an editor is the active view
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        console.log("Active view", view);
        if (!view.editor) {
            console.error("DUDE NO...");
            return {
                success: false,
                error: "ERROR_NO_VIEW"
            };
        }

        const linecount = view.editor.lineCount();
        console.log("HERE IS LIJNE COUNE=T", linecount);

        const file = this.app.workspace.getActiveFile();
        console.log("Active file", file);
        const finfo = this.app.metadataCache.getFileCache(file);
        console.log("HERE is finfo", finfo);
        if (!finfo || !finfo.frontmatter || !finfo.frontmatter.metainfo) {
            const msg = "Cannot create timeline for active file: " + file.name;
            new Notice(msg, 8000);
            errorlog({ fn: this._getEvents, where: "pojo_timeline.ts/PojoTimeline", message: msg });
            return {
                success: false,
                error: "ERROR_NO_METAINFO",
                message: msg
            }
        }
        const metainfo = finfo.frontmatter.metainfo;
        console.log("METAINFO is ", metainfo);

        console.log("zeroy is " + this.zeroy);
        console.log("SCALE is ", this.scale);

        const events = [];
        const debug = true;
        for (const db in metainfo) {
            // Skip databases in ignore.
            if (this.dbIgnore.includes(db)) { continue; }
            const dbe = metainfo[db];
            for (const dbi of dbe) {
                const tinfo = this._getTimeInfo(dbi);
                const txt = this._getText(db, dbi);
                console.log(db + ": " + txt, tinfo);
                let y = tinfo.start * this.scale;
                let dur = tinfo.dur * this.scale;
                if (isNaN(y)) { y = 0; }
                if (isNaN(dur)) { dur = 0; }

                const event = {
                    "start": y,
                    "txt": txt
                };
                if (dur) {
                    event.dur = dur;
                    event.end = y + dur;
                }

                events.push(event);
            }
        }

        // Sort events by y value
        events.sort((a, b) => a.start - b.start);
        //        console.log("HERE is events", events);

        const newevents = events.map((el, idx, ea) => {
            const newel = el;
            if (!el.hasOwnProperty("overlaps")) {
                newel.overlaps = 0;
            }
            if (idx + 1 < ea.length) {
                for (let i = idx + 1; i < ea.length; i++) {
                    const cel = ea[i];
                    if (cel.start < el.end) {
                        if (!cel.hasOwnProperty("overlaps")) { cel.overlaps = 0; }
                        cel.overlaps++;
                        newel.overlaps++;
                    }
                }
            }

            return newel;
        })

        console.log("HERE is newevents", newevents);

        return {
            success: true,
            events: newevents
        }
    }

    private _getMins (timestr) {
        if (!timestr) { return -1; }
        const a = timestr.split(":");
        if (a.length !== 2) { return -2; }
        return parseInt(a[0], 10) * 60 + parseInt(a[1], 10);
    }


    private _getText (db, item) {
        let txt = "";
        for (const key in item) {
            if (key !== "Start Time" && key !== "End Time" && key !== "Duration") {
                let val = item[key];
                if (Array.isArray(val)) {
                    val = val.join(",");
                }
                txt += val + ". ";
                if (this.dbasesAdd.includes(db)) {
                    txt = db + " " + txt;
                }
            }
        }
        return txt;
    }

    private _getTimeInfo (item) {
        const tinfo = {};
        if (item["Start Time"]) { tinfo.start = this._getMins(item["Start Time"]) }
        if (item["End Time"]) { tinfo.end = this._getMins(item["End Time"]) }
        if (item["Duration"]) { tinfo.dur = item["Duration"] }

        if (!tinfo.end) {
            if (tinfo.start && tinfo.dur) { tinfo.end = tinfo.start + tinfo.dur; }
        }
        if (!tinfo.start) {
            if (tinfo.end && tinfo.dur) { tinfo.start = tinfo.end - tinfo.dur; }
        }
        return tinfo;
    }

}