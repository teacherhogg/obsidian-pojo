import { Vault, TFile, App, Notice, MarkdownView } from "obsidian";
import { getEA } from "obsidian-excalidraw-plugin";
import { ExcalidrawAutomate } from 'obsidian-excalidraw-plugin/lib/ExcalidrawAutomate';
import { PojoSettings, generatePath } from "./settings";
import { WarningPrompt } from './utils/Prompts';
import { errorlog } from './utils/utils';
import * as path from "path";


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
    private maxL;
    private maxR;

    // Width for time on col1
    private timewidth;
    // Width for col0, col1, and col2
    private colwidth;
    // Boxwidth in col1 (colwidth - timewidth)
    private boxwidth;

    private defwidth;
    private defheight;
    private minwidth;
    private labelspace;
    private bEventOrder;
    private RLabelArray;
    private LLabelArray;
    private disabled;
    private subfolder_timelines;
    private event_colors;
    private catinfo;

    constructor(settings: PojoSettings, pojo: object, vault: Vault, app: App) {
        const self = this;
        this.settings = settings;
        this.pojo = pojo
        this.vault = vault;
        this.app = app;
        this.RLabelArray = [];
        this.LLabelArray = [];
        this.disabled = false;

        // https://zsviczian.github.io/obsidian-excalidraw-plugin/
        // NOTE that y direction is vertical and y positive is down.
        // NOTE that x direction is horizontal and x positive to right.
        // NOTE three columns: col0, col1, col2
        // NOTE that x=0 is the left side of col1 

        // Setup Options
        const _setSetting = function (key) {
            if (self.settings?.timelines.hasOwnProperty(key)) {
                return self.settings.timelines[key];
            } else {
                warning(self.app, key + "not found.", "timelines options not complete");
                self.disabled = true;
                return null;
            }
        }

        if (!this.settings.timelines || !this.settings.timelines.enabled) {
            warning(self.app, "timelines settings invalid", "timelines settings not available or disabled.");
            self.disabled = true;
            return null;
        } else {
            this.timewidth = _setSetting("timewidth");
            this.mindur = _setSetting("min_duration");
            this.defwidth = _setSetting("default_width");
            this.minwidth = _setSetting("min_width");
            this.labelspace = _setSetting("labelspace");
            this.event_colors = _setSetting("event_colors");
            this.subfolder_timelines = _setSetting("subfolder_timelines");
            this.bEventOrder = _setSetting("event_order");
            const daystart = _setSetting("daystart");
            this.zeroy = this._getMins(daystart);
        }
        this.scale = 1;
        this.colwidth = 500;
        this.defheight = 35;
        this.boxwidth = this.colwidth - this.timewidth;

        if (this.event_colors) {
            this.catinfo = this.pojo.getCategories();

            console.log("HERE ARE CATINFO", this.catinfo);
        }


        // TODO - move these to POJO settings.
        this.dbasesAdd = ["Places", "Night"];
        this.dbIgnore = ["Photo", "Tasks"];

        this.lasty = this.zeroy;
        this.maxL = this.zeroy;
        this.maxR = this.zeroy;

        this.EA = getEA();
        if (!this.EA) {
            warning(self.app, "EXCALIDRAW_NOT_FOUND", "⚠ Excalidraw Plugin not found");
            return;
            //            console.log("HERE IS the EA eh?", this.EA);
        }

        //        console.log("HERE IS timewidth", this.timewidth, this.scale);
    }

    async testing () {
        if (!this.EA) {
            new Notice("Excalidraw plugin not found. Cannot perform timeline visualization.", 8000);
            return false;
        }
        this.EA.reset();
        this.EA.addText(0, 0, "HERE DA TEST TEXT");
        const id = this.EA.addText(20, 20, "HERE DA TEST TEXT 2");
        const ell = this.EA.getElement(id);
        ell.isDeleted = true;
        this.EA.create({ onNewPane: true });

        return true;
    }

    async createTimeline (note_file: string, timeline_file: string, fileinfo: object, dailyentry: object) {

        if (this.disabled) {
            console.error("Timeline creation disabled.");
            return;
        }

        const finfo = await this._getNoteInfo(note_file, fileinfo);
        if (!finfo || !finfo.success) {
            return finfo;
        }

        // Get events sorted in time
        const retobj = this._getEvents(finfo.metainfo);
        if (!retobj || !retobj.success || !retobj.events) {
            return retobj;
        }

        // Split events into arrays that don't overlap in time
        const eventobj = this._eventCollisions(retobj.events);
        //        console.log("HERE are event arrays", eventobj);

        // Now determine the width and locations of all events
        const allcolw = this._eventWidths(this.defwidth, this.minwidth, eventobj)

        this.EA.reset();
        // Draw the timeline
        let yMax = this.zeroy;
        for (let h = 0; h < 24; h++) {
            const yVal = this._drawTime(this.timewidth, allcolw, h);
            if (yVal > yMax) { yMax = yVal; }
        }
        for (const eArray of eventobj.eArrays) {
            for (const event of eArray) {
                this._drawEvent(allcolw, event);
            }
        }

        for (const event of eventobj.eNoDuration) {
            this._drawEvent(allcolw, event);
        }

        // Add Header info
        const header = [];
        if (finfo.frontmatter && finfo.frontmatter["Daily Note"]) { header.push(finfo.frontmatter["Daily Note"]); }
        if (dailyentry && dailyentry.Heading) { header.push(dailyentry.Heading) }
        if (note_file) {
            const pinfo = path.parse(note_file);
            //            console.log("PINFO is ", pinfo)
            header.push(`[[${pinfo.base}]]`)
        }

        await this._drawHeader(allcolw, header);

        // Add Daily Entry
        //        console.log("HERE is dailyentry", dailyentry)
        if (dailyentry) {
            this._drawDiaryEntry(allcolw, dailyentry, yMax);
        }

        // Add Any Photos
        if (finfo.frontmatter && finfo.metainfo) {
            await this._drawPhotos(allcolw, finfo.metainfo, yMax);
        }

        let filename;
        if (!timeline_file) {
            if (finfo.frontmatter["Diary Date"]) {
                filename = finfo.frontmatter["Diary Date"] + " timeline";
            }
        } else {
            filename = timeline_file;
        }

        if (filename) {
            const folder = generatePath(this.settings.folder_pojo, this.subfolder_timelines);
            const eaoptions = {
                filename: filename,
                foldername: folder,
                onNewPane: true
            }
            this.EA.create(eaoptions);
        } else {
            this.EA.create({ onNewPane: true });
        }

    }

    private _setStyle (stype) {

        if (stype == "header") {
            const strokeColor = '#' + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, "0");
            this.EA.style.roughness = 2; // 0, 1, 2
            this.EA.style.strokeColor = strokeColor;
            this.EA.style.strokeWidth = 2;
            this.EA.setFillStyle(0); // 0,1,2
            this.EA.setStrokeStyle(0); // 0,1,2
            this.EA.setStrokeSharpness(0); // 0,1
            this.EA.style.fontSize = 48;
            this.EA.setFontFamily(0);  // 0, 1, 2
        } else if (stype == "body") {
            const strokeColor = '#000000';
            this.EA.style.roughness = 2; // 0, 1, 2
            this.EA.style.strokeColor = strokeColor;
            this.EA.style.strokeWidth = 2;
            this.EA.setFillStyle(0); // 0,1,2
            this.EA.setStrokeStyle(0); // 0,1,2
            this.EA.setStrokeSharpness(1); // 0,1
            this.EA.style.fontSize = 24;
            this.EA.setFontFamily(0);  // 0, 1, 2
        } else if (stype == "right" || stype == "left") {
            const strokeColor = '#080808';
            this.EA.style.roughness = 2; // 0, 1, 2
            this.EA.style.strokeColor = strokeColor;
            this.EA.style.strokeWidth = 2;
            this.EA.setFillStyle(0); // 0,1,2
            this.EA.setStrokeStyle(0); // 0,1,2
            this.EA.setStrokeSharpness(1); // 0,1
            this.EA.style.fontSize = 24;
            this.EA.setFontFamily(0);  // 0, 1, 2
        } else {
            const strokeColor = '#' + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, "0");
            this.EA.style.roughness = 1; // 0, 1, 2
            this.EA.style.strokeColor = strokeColor;
            this.EA.style.strokeWidth = 2;
            this.EA.style.fontSize = 20;
        }
    }

    private _drawDiaryEntry (allcolw, dailyentry: object, yMax: number) {
        const self = this;

        this._setStyle("body");
        const x = -this.timewidth;
        const y = yMax + this.defheight * 2;

        if (dailyentry && dailyentry.Description) {

            const regex = /\[\[(.*?)\]\]/;
            const newdesc = dailyentry.Description.filter((val) => {
                const link = val.match(regex);
                if (link) { return false; }
                else { return true; }
            });

            const content = newdesc.join("\n\n");
            this.EA.addText(x, y, content, { width: allcolw, box: "box", boxPadding: 5 });
        }
    }

    private async _drawPhotos (allcolw, metainfo: object, yMax: number) {
        const self = this;

        this._setStyle("default");

        // Include any photos!
        let yLeft = this.maxL + this.defheight;
        let yRight = this.maxR + this.defheight;
        if (yMax) {
            yLeft = yMax + this.defheight;
            yRight = yMax + this.defheight;
        }
        let bPlaceLeft = true;

        if (metainfo && metainfo.Photo) {

            for (const photo of metainfo.Photo) {
                if (photo.image) {
                    let x = allcolw;
                    let y = yRight;
                    if (bPlaceLeft) {
                        x = -allcolw;
                        y = yLeft;
                    }

                    const captions = photo[photo.Type];
                    if (captions && captions.length > 0) {
                        const caption = captions.join(" ");
                        this.EA.addText(x, y, caption);
                        y += this.defheight;
                    }

                    const ipath = generatePath(this.settings.folder_attachments, photo.image);
                    const iFile = this.vault.getAbstractFileByPath(ipath) as TFile;
                    //                    console.log("HERE IS THE IMAGE", iFile, ipath);
                    const idimage = await this.EA.addImage(x, y, iFile, true, true);

                    const elinfo = this.EA.getElement(idimage);
                    //                    console.log("IMAGE ELEMENT INFO ", elinfo);
                    let height = 500;
                    if (elinfo) { height = elinfo.height; }

                    if (bPlaceLeft) {
                        yLeft = height + y;
                    } else {
                        yRight = height + y;
                    }
                    bPlaceLeft = !bPlaceLeft;
                }
            }
        }
    }

    private async _drawHeader (allcolw, header) {
        const self = this;

        this._setStyle("header");

        const x = -this.timewidth;
        let y = this.zeroy - 50;

        for (let n = header.length - 1; n >= 0; n--) {
            self.EA.addText(x, y, header[n]);
            y -= 50;
        }

        this._setStyle("default");
    }

    private _drawLabelL (event) {
        // Add label to left of timeline
        this._setStyle("left");
        let idlabel;
        let bPlaceLabel = true;
        while (bPlaceLabel) {
            idlabel = this.EA.addText(
                event.x,
                event.y,
                event.txt,
                { box: false, width: event.width, boxPadding: 0, textAlign: "left" }
            );
            const ell = this.EA.getElement(idlabel);
            const labelinfo = {
                dur: ell.height,
                start: ell.y,
                width: ell.width,
                end: ell.y + ell.height,
                x: ell.x
            };
            if (this._checkEventCollision(labelinfo, this.LLabelArray)) {
                // This label location collides. Try again.
                event.y += 25;
                ell.isDeleted = true;
            } else {
                if (labelinfo.end > this.maxL) { this.maxL = labelinfo.end; }
                this.LLabelArray.push(labelinfo);
                bPlaceLabel = false;
            }
        }
        this._setStyle("default");

        return idlabel;
    }

    private _drawLabelR (allcolw, txt, y) {
        // Add label to right of timeline
        //        this._setStyle("right");
        let ylabel = y;
        const len = txt.length;
        const textwidth = Math.min(this.boxwidth, len * 10);
        let idlabel;
        let bPlaceLabel = true;
        while (bPlaceLabel) {
            idlabel = this.EA.addText(this.labelspace + allcolw, ylabel - this.defheight * 0.5, txt, { box: false, width: textwidth });
            const ell = this.EA.getElement(idlabel);
            const labelinfo = {
                dur: ell.height,
                start: ell.y,
                width: ell.width,
                end: ell.y + ell.height,
                x: ell.x
            };
            if (this._checkEventCollision(labelinfo, this.RLabelArray)) {
                // This label location collides. Try again.
                ylabel += 25;
                ell.isDeleted = true;
            } else {
                if (labelinfo.end > this.maxR) { this.maxR = labelinfo.end; }
                this.RLabelArray.push(labelinfo);
                bPlaceLabel = false;
            }
        }
        //        this._setStyle("default");

        return idlabel;
    }

    private _drawEvent (allcolw, event) {

        let strokeColor;
        let backgroundColor;
        let opacity = 100;
        let strokeWidth = 2;
        let bTextInBox = true;
        if (!event.color || event.color == "#000000") {
            if (!event.color) {
                strokeColor = '#' + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, "0");
            } else {
                strokeColor = event.color;
            }
            backgroundColor = "transparent";
        } else {
            if (event.start == 0 || !event.dur) {
                strokeColor = event.color;
                backgroundColor = "transparent";
            } else {
                // Regular event with start time and duration and event color defined!
                bTextInBox = false;
                strokeColor = event.color;
                backgroundColor = event.color;
                opacity = 100;
                strokeWidth = 4;
            }
        }

        this.EA.style.roughness = 1; // 0, 1, 2
        this.EA.style.strokeColor = strokeColor;
        this.EA.style.backgroundColor = backgroundColor;
        this.EA.style.strokeWidth = strokeWidth;
        this.EA.style.opacity = opacity;

        const duration = event.hasOwnProperty("dur") ? event.dur : 0;

        if (event.start == 0) {
            // Event has no start time. 
            this._drawLabelL(event);
        } else {
            if (!duration) {
                // Event has a time but no duration.

                // Draw a line across all columns
                //                this.EA.style.strokeColor = "#00008B";
                //                this.EA.style.strokeWidth = 3;
                const id = this.EA.addLine([[0, event.start], [allcolw, event.start]]);

                // Draw a label
                const idlabel = this._drawLabelR(allcolw, event.txt, event.start);


                // Draw an arrow connecting label and line
                const elLabel = this.EA.getElement(idlabel);
                const elLine = this.EA.getElement(id)
                this.EA.addArrow([[elLabel.x, elLabel.y], [elLine.x + allcolw, elLine.y]], { endArrowHead: "arrow" });

            } else {
                // Standard event that has start time and duration. 
                const align = "left";
                let id = null;
                if (!bTextInBox || event.dur < this.mindur) {
                    // NOT enough room to add text to box

                    // Draw box without text
                    id = this.EA.addText(event.x, event.start, "", { box: true, height: event.dur, width: event.width, boxPadding: 0, textAlign: align });

                    // Add label to right of timeline
                    const idlabel = this._drawLabelR(allcolw, event.txt, event.start);

                    // Add Connection for label and box
                    this.EA.connectObjects(idlabel, "left", id, "right", { endArrowHead: "arrow" });

                } else {
                    // Just draw box with text in col1
                    id = this.EA.addText(event.x, event.start, event.txt, { box: true, height: event.dur, width: event.width, boxPadding: 0, textAlign: align });
                    //                    const ell = this.EA.getElement(id);
                    //                    const bb = this.EA.getBoundingBox([ell]);
                    //                    if (ell.height > event.dur) {
                    //                    console.log("OMG - Size then expected " + event.dur + " -> " + ell.height + "[ " + event.txt + " ]", event, bb);
                    //                    }
                }
                //                this._drawBoxAndLabel(allcolw, event);
            }
        }
    }

    private _drawTime (timew, allcolw, hr): number {
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
        if (ymins > this.zeroy) {
            this.EA.addLine([[-timew, ymins * this.scale], [allcolw, ymins * this.scale]]);
            this.EA.addText(-timew, ymins * this.scale, ht);
        }
        return ymins;
    }


    private _eventWidths (defw, minw, eventobj) {

        const nCols = eventobj.eArrays.length;
        let colw = defw;
        if (nCols) {
            colw = Math.max(minw, defw / nCols);
        }
        const allcolw = colw * nCols;


        // Get width and x of events in eArrays
        for (let n = 0; n < nCols; n++) {
            const eArray = eventobj.eArrays[n];
            for (let j = 0; j < eArray.length; j++) {
                const event = eArray[j];

                let lenr = 0;
                let lenl = 0;

                // Check for collisions to right (if not in last array)
                if (n !== nCols - 1) {
                    for (let r = n + 1; r < nCols; r++) {
                        if (!this._checkEventCollision(event, eventobj.eArrays[r])) {
                            lenr++;
                        } else {
                            break;
                        }
                    }
                }

                // Check for collisions to left (if not in first array)
                if (n !== 0) {
                    for (let r = n - 1; r > 0; r--) {
                        if (!this._checkEventCollision(event, eventobj.eArrays[r])) {
                            lenl++;
                        } else {
                            break;
                        }
                    }
                }

                if (lenr > lenl) {
                    // Span to the right
                    event.x = n * colw;
                    event.width = lenr * colw;
                } else if (lenl > lenr) {
                    // Span to the left
                    event.x = (n - lenl) * colw;
                    event.width = lenl * colw;
                } else {
                    // No span
                    event.x = n * colw;
                    event.width = colw;
                }
            }
        }

        // Get width and x of events without duration
        for (const event of eventobj.eNoDuration) {
            if (!event.start) {
                // Event with no start time and no duration
                // Base the y location on the order of the event in original array.
                event.x = -this.defwidth - this.labelspace;
                event.width = this.defwidth;
                if (this.bEventOrder) {
                    let pos = eventobj.eOrder.min;
                    let ypos = this.zeroy;
                    let delta = eventobj.eOrder.max;
                    while (pos <= eventobj.eOrder.max) {
                        const yval = eventobj.eOrder.dict[pos];
                        if (yval) {
                            const tdelta = Math.abs(event.order - pos);
                            if (tdelta < delta) {
                                delta = tdelta;
                                ypos = yval;
                            }
                        }
                        pos++;
                    }
                    event.y = ypos;
                } else {
                    // Event with no duration, no start time, and we are NOT using the event order.
                    event.y = this.lasty;
                    this.lasty = event.y + this.mindur;
                }
            }
        }

        return allcolw;
    }

    private _checkEventCollision (event, eArray) {

        const __eventCollision = function (evt1: object, evt2: object): boolean {
            if (evt2.start > evt1.start) {
                if (evt2.start < evt1.end) { return true; }
            } else {
                if (evt1.start < evt2.end) { return true; }
            }
            return false;
        }

        let bCollision = false;
        for (let j = 0; j < eArray.length; j++) {
            if (__eventCollision(event, eArray[j])) {
                bCollision = true;
                break;
            }
        }

        return bCollision;
    }

    private _eventCollisions (events): object {

        // Now check for events that overlap in time or have no duration
        const eNoDuration = [];
        const eArrays = [[]];
        const nevents = events.length;
        const eOrder = { dict: {} };
        for (let n = 0; n < nevents; n++) {
            const event = events[n];
            if (event.start) {
                if (!eOrder.hasOwnProperty("min")) {
                    eOrder.min = event.order;
                    eOrder.max = event.order;
                }
                eOrder.dict[event.order] = event.start;
                if (event.order < eOrder.min) { eOrder.min = event.order; }
                if (event.order > eOrder.max) { eOrder.max = event.order; }
            }
            if (!event.hasOwnProperty("dur") || !event.dur) {
                // Event with no duration. 
                eNoDuration.push(event);
            } else {
                for (let a = 0; a < eArrays.length; a++) {
                    // Check if events collide in this event array.
                    const bCollision = this._checkEventCollision(event, eArrays[a]);

                    if (bCollision) {
                        if (a == eArrays.length - 1) {
                            // Create new event array and put this event there.
                            eArrays.push([event]);
                            break;
                        }
                    } else if (!bCollision) {
                        // Put event in this event array
                        eArrays[a].push(event);
                        break;
                    }
                }
            }
        }

        return { eNoDuration, eArrays, eOrder };
    }

    /**
     * Creates an array of event objects that are sorted in time.
     */
    private async _getNoteInfo (notefilepath: string, finfo: object): Promise<object> {

        console.log("HERE IS FILE INFO ", finfo);

        if (!finfo) {
            let notefile: TFile;

            if (!notefilepath) {
                notefile = this.app.workspace.getActiveFile();
                console.log("file for timeline", notefilepath);
            } else {
                notefile = this.app.vault.getAbstractFileByPath(notefilepath) as TFile;
            }
            finfo = await this.pojo.getMarkdownFileInfo(notefile, "filecache", false);
        }

        if (!finfo || !finfo.frontmatter || !finfo.frontmatter.metainfo) {
            const msg = "Cannot create timeline for active file: " + notefile.name + " . Must be a processed Daily Note!";
            warning(this.app, "Cannot create timeline.", msg);
            new Notice(msg, 8000);
            errorlog({ fn: this._getEvents, where: "pojo_timeline.ts/PojoTimeline", message: msg });
            return {
                success: false,
                error: "ERROR_NO_METAINFO",
                message: msg
            }
        }

        let metainfo = finfo.frontmatter.metainfo;
        if (typeof metainfo == "string") {
            metainfo = JSON.parse(metainfo);
        }

        return {
            success: true,
            metainfo: metainfo,
            frontmatter: finfo.frontmatter,
            bodycontent: finfo.bodycontent
        }
    }

    private _getColor (dbinfo, dbe) {
        /* Get the most specific color specifier */

        const catkeys = this.catinfo.catkeys[this.event_colors];
        if (!catkeys) {
            // No category colors group info found.
            console.error("MISSING category groups for " + this.event_colors);
            return "#000000";
        }
        //        console.log("HERE are catkeys", catkeys);

        const __checkForColor = function (arrayc) {
            for (const cat of arrayc) {
                if (catkeys[cat]) {
                    return catkeys[cat].colorcode;
                }
            }

            return null;
        }
        // Get type key and value
        const type = dbinfo.type;
        const tval = dbe[type];

        let rkey = `${dbinfo.database}-${type}-${tval}`;
        let color = null;
        if (this.catinfo.catmap[rkey]) {
            color = __checkForColor(this.catinfo.catmap[rkey]);
        }
        if (!color) {
            rkey = `${dbinfo.database}-${type}`;
            if (this.catinfo.catmap[rkey]) {
                color = __checkForColor(this.catinfo.catmap[rkey]);
            }
        }

        if (color) {
            return color;
        } else {
            return "#000000";
        }
    }

    private _getEvents (metainfo: object): object {

        //        console.log("HERE is metainfo", metainfo);

        const events = [];
        const debug = true;
        let n = 1;
        for (const db in metainfo) {
            // Skip databases in ignore.
            if (this.dbIgnore.includes(db)) { continue; }
            const dbe = metainfo[db];
            const dbinfo = this.pojo.getDatabaseInfo(db);
            for (const dbi of dbe) {
                const tinfo = this._getTimeInfo(dbi);
                const txt = this._getText(db, dbi);
                const color = this._getColor(dbinfo, dbi);

                //                console.log(db + ": " + txt, tinfo);
                let y = tinfo.start * this.scale;
                let dur = tinfo.dur * this.scale;
                if (isNaN(y)) { y = 0; }
                if (isNaN(dur)) { dur = 0; }

                const event = {
                    "start": y,
                    "txt": txt,
                    "order": n,
                    "color": color
                };
                if (dur) {
                    event.dur = dur;
                    event.end = y + dur;
                }

                events.push(event);
                n++;
            }
        }

        // Sort events by y value
        events.sort((a, b) => a.start - b.start);
        console.log("HERE is events", events);

        return {
            success: true,
            events: events
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

const warning = function (app, title, message) {
    (new WarningPrompt(
        app, title, message)
    ).show(async (result: boolean) => {
        new Notice(message, 8000);
        console.error(title + " -> " + message);
    });
}