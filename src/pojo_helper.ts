import { intoCompletrPath } from "./settings";
import { Suggestion } from "./provider/provider";
import { Vault } from "obsidian";
import { stringify } from "querystring";

const POJO_TAG_PREFIX_REGEX = /^#(?!#)/;
const POJO_H3_PREFIX_REGEX = /^### /;

const POJO_HISTORY_FILE = "pojo_history.json";

export class PojoHelper {

    private settings: object;
    private pojoProvider: object;
    private loadedPojoDB: Record<string, never>;
    private loadedPojoHistory: object;

    constructor(pojoProvider: object, pojosettings: object, vault: Vault) {
        this.pojoProvider = pojoProvider;
        this.settings = pojosettings;

        const dbinfo = {};
        const dbkeys = [];
        for (const db of this.settings.databases.info) {
            dbinfo[db.database.toLowerCase()] = db;
            dbkeys.push(db.database);
        }
        this.loadedPojoDB = dbinfo;
        this.pojoDatabases = dbkeys;

    }

    async InitHistory (vault: Vault) {
        let loadedPojoHistory: object;
        const path = intoCompletrPath(vault, POJO_HISTORY_FILE);
        if (!(await vault.adapter.exists(path))) {
            loadedPojoHistory = {};
        } else {
            try {
                loadedPojoHistory = await loadFromFile(vault, path);
            } catch (e) {
                console.error("ERROR loading Pojo History", e);
                return;
            }
        }
        this.loadedPojoHistory = loadedPojoHistory;
    }

    getDatabases (): string[] {
        return this.pojoDatabases;
    }

    getDatabaseInfo (dbname: string): object | null {
        const dbinfo = this.loadedPojoDB[dbname.toLocaleLowerCase()];
        if (!dbinfo) {
            console.error("ERROR missing database info in pojo settings", dbname);
            return null;
        }
        return dbinfo;
    }

    stripLeading (line: string): string {
        let start = 1;
        let trigger = "#";
        let matches = POJO_TAG_PREFIX_REGEX.exec(line);
        if (matches == null) {
            matches = POJO_H3_PREFIX_REGEX.exec(line);
            if (!matches)
                return null;
            trigger = 'H3';
            start = 4;
        }

        return line.slice(start).trimStart();
    }

    parseTagLineDEPRECATED (tagline: string): object {

        // Tags do not have spaces in the reference except for Daily Entry
        if (tagline == "Daily Entry") {
            return {
                canonical: "Daily Entry",
                database: "Daily Entry"
            }
        }

        const taga = tagline.split(" ");

        const rtag = this.normalizeReference(taga[0]);

        const dbinfo = this.getDatabaseInfo(rtag.database);
        if (!dbinfo) {
            // ERROR
            return null;
        }
        const robj = {
            database: rtag.database,
            canonical: rtag.nref
        }
        robj[dbinfo.type] = rtag.type;

        const finfo = dbinfo["field-info"];

        if (finfo) {
            // Check if the type is limited to a set of allowed values
            const tinfo = finfo[dbinfo.type];
            if (tinfo && tinfo.allowed && tinfo.allowed == "fixed" && tinfo.values) {
                const vals = tinfo.values["_ALL"];
                const allowed = vals.find(el => el.toLowerCase() == rtag.type.toLowerCase());
                if (!allowed) {
                    const emsg = "INVALID type value for database " + rtag.database + " ref " + rtag.nref;
                    logError(emsg, rtag.type);
                    console.error(emsg, rtag.type);
                } else {
                    robj[dbinfo.type] = allowed;
                }
            }

            if (taga.length > 1) {
                taga.shift();
                const params = taga.join(" ");
                const aparams = params.split(";")

                if (aparams) {
                    let n = 0;
                    if (aparams.length > dbinfo.params.length) {
                        logError("ERROR in tag params. More than expected for tag ", aparams, dbinfo.params);
                        return null;
                    } else {
                        for (let p of aparams) {
                            if (p) {
                                p = p.trim();
                                const pkey = dbinfo.params[n];
                                if (pkey == "Description") {
                                    if (!robj.Description) { robj.Description = []; }
                                    robj.Description.push(p.trim());
                                } else {
                                    if (finfo[pkey]) {
                                        // Check if this is limited to a fixed set of allowed values
                                        if (finfo[pkey].allowed == "fixed" && finfo[pkey].values) {
                                            if (finfo[pkey].values["_ALL"] || finfo[pkey].values[robj[dbinfo.type]]) {
                                                const alla = finfo[pkey].values["_ALL"] ? finfo[pkey].values["_ALL"] : finfo[pkey].values[robj[dbinfo.type]];
                                                const allowedp = alla.find(el => {
                                                    if (el.toLowerCase() == p.toLowerCase()) {
                                                        return true;
                                                    }
                                                    return false;
                                                });
                                                if (!allowedp) {
                                                    const emsg = "INVALID parameter value for database " + rtag.database + " ref " + rtag.nref + " pvalue : " + p;
                                                    logError(emsg, alla);
                                                    console.error(emsg, alla);
                                                } else {
                                                    p = allowedp;
                                                }
                                            }
                                        }
                                        if (finfo[pkey].multi) {
                                            const splitchar = finfo[pkey].multi;
                                            const va = p.split(splitchar);
                                            for (let i = 0; i < va.length; i++) {
                                                va[i] = this.normalizeValue(va[i]);
                                            }
                                            //                                            robj[pkey] = va.join(splitchar);
                                            robj[pkey] = va;
                                        } else {
                                            robj[pkey] = this.normalizeValue(p);
                                        }
                                    }
                                }
                            }
                            n++;
                        }
                    }
                }

                // Check to see if missing params for this database entry and indicate that
                //        for (let pm of dbinfo.params) {
                //            if (pm !== "Description") {
                //               if (!robj[pm]) { robj[pm] = "_NONE_"; }
                //            }
                //        }

            }
        }

        return robj;
    }

    addToHistoryFromLine (line: string): boolean {
        if (!line) {
            return false;
        }

        line = this.stripLeading(line);
        console.log("HISTORY -------------------------------------------");
        console.log(`>>${line}<<`);
        const tobj: object = this.parsePojoLine(line);
        if (!tobj) { return false; }
        console.log("parsePojoLinen TOBJ", tobj);
        return this.addToHistory(tobj);
    }

    addToHistory (tobj: object): boolean {

        const dbname = tobj._database.toLowerCase();
        const dbinfo = this.getDatabaseInfo(dbname);
        console.log("addToHistory", tobj, dbinfo);
        if (!dbinfo) {
            console.error("ERROR getting database info for " + dbname);
            return false;
        }

        let bChanged = false;
        if (dbinfo["field-info"]) {
            if (!this.loadedPojoHistory[dbname]) {
                this.loadedPojoHistory[dbname] = {};
            }

            //            console.log("DA HISTORY", this.loadedPojoHistory);
            const finfo = dbinfo["field-info"];
            const self = this;
            for (const key in finfo) {
                if (finfo[key].allowed) {
                    let bHistory = false;
                    let hkey;
                    const multi = finfo[key].multi;
                    console.log("HISTORY for " + key, finfo);
                    if (finfo[key].allowed == "history") {
                        hkey = key;
                        bHistory = true;
                    } else if (finfo[key].allowed == "history-type") {
                        if (key == tobj._type) {
                            hkey = key;
                        } else {
                            hkey = tobj._type + "-" + key;
                        }
                        bHistory = true;
                    }

                    if (bHistory && tobj[key]) {
                        hkey = hkey.toLowerCase();
                        if (!this.loadedPojoHistory[dbname][hkey]) {
                            this.loadedPojoHistory[dbname][hkey] = [];
                        }

                        const _addItem = function (ival) {
                            if (!ival) { return; }
                            console.log("dname " + dbname + " hkey " + hkey, self.loadedPojoHistory[dbname]);
                            if (!self.loadedPojoHistory[dbname][hkey].includes(ival)) {
                                bChanged = true;
                                self.loadedPojoHistory[dbname][hkey].push(ival);
                            }
                        }

                        if (Array.isArray(tobj[key])) {
                            for (const val of tobj[key]) {
                                _addItem(val);
                            }
                        } else if (multi) {
                            const avals = tobj[key].split(multi);
                            for (const val2 of avals) {
                                _addItem(val2);
                            }
                        } else {
                            _addItem(tobj[key]);
                        }
                    }
                }
            }
        }

        return bChanged;
    }

    private getHistoryValues (dinfo: object, dkey: string): string[] {

        const dbname = dinfo.database.toLowerCase();
        dkey = dkey.toLowerCase();
        console.log("getHistoryValues with " + dkey);

        if (this.loadedPojoHistory[dbname]) {
            if (this.loadedPojoHistory[dbname][dkey]) {
                console.log("Get History  " + dinfo.database + " with " + dkey, this.loadedPojoHistory[dbname][dkey]);
                return this.loadedPojoHistory[dbname][dkey];
            }
        }

        return [];
    }

    async deleteHistory (vault: Vault) {
        this.loadedPojoHistory = {};
        await this.saveHistory(vault);
    }

    async saveHistory (vault: Vault) {

        console.log("POJO HISTORY!!", this.loadedPojoHistory);

        await vault.adapter.write(intoCompletrPath(vault, POJO_HISTORY_FILE), JSON.stringify(this.loadedPojoHistory, null, 3));
    }

    parsePojoLine (tagline: string): object | null {

        if (!tagline) return null;
        let bTrailingSpace = false;
        if (tagline.charAt(tagline.length - 1) == " ") {
            bTrailingSpace = true;
        }
        tagline = tagline.trimEnd();

        // Pojo Tags (or H3) do not have spaces in the reference except for Daily Entry
        if (this.settings.daily_entry_h3.includes(tagline)) {
            return {
                _database: tagline
            }
        }

        const params = tagline.split(" ");
        const plen = params.length;
        const taga = params[0].split("/");

        const robj = {};

        robj._database = taga[0];
        robj._type = "";
        if (taga.length > 1) {
            robj._type = taga[1];
        }

        const dbinfo = this.getDatabaseInfo(robj._database);
        if (!dbinfo) {
            // ERROR
            return null;
        }
        robj[dbinfo.type] = this.normalizeValue(taga[1]);

        const finfo = dbinfo["field-info"];
        if (finfo) {
            // Check if the type is limited to a set of allowed values
            const tinfo = finfo[dbinfo.type];
            if (tinfo && tinfo.allowed && tinfo.allowed == "fixed" && tinfo.values) {
                const vals = tinfo.values["_ALL"];
                const allowed = vals.find(el => el.toLowerCase() == robj._type.toLowerCase());
                if (!allowed) {
                    const emsg = "INVALID type value for database " + robj._database;
                    logError(emsg, robj.type);
                } else {
                    robj[dbinfo.type] = allowed;
                }
            }

            if (plen > 1) {
                params.shift();
                const roline = params.join(" ");
                const aparams = this.splitParams(roline);
                //                console.log("aparams", aparams);

                if (aparams) {
                    if (aparams.length > dbinfo.params.length) {
                        logError("ERROR in tag params. More than expected for tag ", aparams, dbinfo.params);
                        return null;
                    } else {
                        let pnum = 0;
                        for (let p of aparams) {
                            const pkey = dbinfo.params[pnum];
                            robj._loc = pkey;
                            robj._locval = p;
                            if (p) {
                                p = p.trim();
                                if (pkey == "Description") {
                                    if (!robj.Description) { robj.Description = []; }
                                    robj.Description.push(p.trim());
                                    //                                    robj._loc = pkey;
                                } else {
                                    //                                    robj._loc = `param${pnum + 1}`;
                                    if (finfo[pkey]) {
                                        // Check if this is limited to a fixed set of allowed values
                                        if (finfo[pkey].allowed == "fixed" && finfo[pkey].values) {
                                            if (finfo[pkey].values["_ALL"] || finfo[pkey].values[robj[dbinfo.type]]) {
                                                const alla = finfo[pkey].values["_ALL"] ? finfo[pkey].values["_ALL"] : finfo[pkey].values[robj[dbinfo.type]];
                                                const allowedp = alla.find(el => {
                                                    if (el.toLowerCase() == p.toLowerCase()) {
                                                        return true;
                                                    }
                                                    return false;
                                                });
                                                if (!allowedp) {
                                                    const emsg = "INVALID parameter value for database " + robj.database + " pvalue : " + p;
                                                    logError(emsg, alla);
                                                } else {
                                                    p = allowedp;
                                                }
                                            }
                                        }
                                        if (finfo[pkey].multi) {
                                            const splitchar = finfo[pkey].multi;
                                            const va = p.split(splitchar);
                                            for (let i = 0; i < va.length; i++) {
                                                va[i] = this.normalizeValue(va[i]);
                                            }
                                            //                                            robj[pkey] = va.join(splitchar);
                                            robj[pkey] = va;
                                        } else {
                                            robj[pkey] = this.normalizeValue(p);
                                        }
                                    }
                                }
                            }
                            pnum++;
                        }
                    }
                }

                // Check to see if missing params for this database entry and indicate that
                //        for (let pm of dbinfo.params) {
                //            if (pm !== "Description") {
                //               if (!robj[pm]) { robj[pm] = "_NONE_"; }
                //            }
                //        }

            } else {
                // Just the Pojo Tag without any metadata
                if (taga.length == 1 && !params[0].endsWith("/")) {
                    robj._loc = "database";
                    robj._locval = taga[0];
                } else if (!bTrailingSpace) {
                    robj._loc = "type";
                    robj._locval = taga[1];
                } else {
                    if (dbinfo.params && dbinfo.params.length > 0) {
                        robj._loc = dbinfo.params[0];
                        robj._locval = "";
                    }
                }
            }
        }

        return robj;
    }

    getSuggestedValues (pobj: object): Suggestion[] | null {


        if (!pobj || !pobj._loc) { return null; }

        let values = [];
        if (pobj._loc == "database") {
            values = this.filterValues(pobj._database, this.getDatabases());
        } else if (pobj._loc == "type") {
            const dinfo = this.getDatabaseInfo(pobj._database);
            if (!dinfo) {
                return null;
            }
            const svalues = this.getValues(dinfo, dinfo.type);
            values = this.filterValues(pobj._type, svalues);
        } else {
            const dinfo = this.getDatabaseInfo(pobj._database);
            if (!dinfo) {
                return null;
            }

            const svalues = this.getValues(dinfo, pobj._loc, pobj._type);

            let locval = pobj._locval;
            if (dinfo["field-info"] && dinfo["field-info"][pobj._loc]) {
                const multi = dinfo["field-info"][pobj._loc].multi;
                if (multi) {
                    console.log("WE DOING multi " + multi, dinfo, pobj);
                    const avals = locval.split(multi);
                    locval = avals[avals.length - 1].trim();
                    console.log("MULTI FILTER VALS ", avals, locval);
                }
            }
            values = this.filterValues(locval, svalues);
        }
        return values;
    }

    private filterValues (input: string, values: string[]): Suggestion[] {
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

    private getValues (dinfo: object, pname: string, type?: string): string[] | null {
        console.log("getValues with " + pname + " type: " + type, dinfo);
        if (!dinfo["field-info"] || !dinfo["field-info"][pname]) {
            return [];
        }

        const finfo = dinfo["field-info"][pname];
        //        console.log("field-info " + pname, finfo);
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
            return [...new Set([...values, ...this.getHistoryValues(dinfo, type + "-" + pname)])];
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

    private normalizeValue (val) {
        if (!val) {
            return "";
        }

        // normalize value if up to three words long to a canonical form.
        const value = val.trim();
        if (value.split(" ").length > 3) {
            // NO normalizing.
            return value;
        }

        if (!isNaN(value)) {
            // Number so no normalizing.
            return value;
        }

        const norm = [];
        // Split comma separated values
        const a = value.split(",");
        for (const v of a) {
            // Split this value into words
            const a1 = v.trim().split(" ");
            const norm1 = [];
            for (const w1 of a1) {
                // Split hyphenated words
                const a2 = w1.trim().split("-");
                const norm2 = [];
                for (const w2 of a2) {
                    if (w2) {
                        const wlc = w2.toLowerCase();
                        const nlc = wlc[0].toUpperCase() + wlc.substring(1);
                        norm2.push(nlc);
                    }
                }
                norm1.push(norm2.join("-"))
            }
            norm.push(norm1.join(" "));
        }
        const nval = norm.join(",");

        return nval;
    }

    private splitParams (pline: string): string[] {

        if (this.settings.split_param) {
            return pline.split(this.settings.split_param);
        } else {
            pline.split(";")
        }
    }
}

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

export function logError (msg: string, dobj?: object) {
    //        logs.errors.push(name);
    //        if (dobj) {
    //            logs.errors.push(JSON.stringify(dobj, null, 3));
    //        }
    console.error(msg, dobj);
}
