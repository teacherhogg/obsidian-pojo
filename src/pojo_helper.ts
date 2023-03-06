import { intoCompletrPath } from "./settings";
import { Suggestion } from "./provider/provider";
import { PojoConvert } from "./pojo_convert";
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
    private nohistoryx: boolean;
    private defsec: string;
    private vault: Vault;

    constructor(pojoProvider: object, pojosettings: object, vault: Vault) {
        this.pojoProvider = pojoProvider;
        this.settings = pojosettings;
        this.nohistoryx = false;
        this.defsec = this.settings.daily_entry_h3[0];
        this.vault = vault;

        const dbinfo = {};
        const dbkeys = [];
        for (const db of this.settings.databases.info) {
            dbinfo[db.database] = db;
            dbkeys.push(db.database);
        }
        this.loadedPojoDB = dbinfo;
        this.pojoDatabases = dbkeys;

    }

    getPluginFolder () {
        return this.vault.configDir + "/plugins/obsidian-pojo";
    }

    async createMarkdownFile (data: string, folder: string, filename: string, bOverwrite: boolean) {

        // First check if folder exists in vault.
        if (!(await this.vault.adapter.exists(folder))) {
            console.log("Folder " + folder + " must be created.");
            await this.vault.adapter.mkdir(folder);
        }

        const filepath = folder + "/" + filename;
        if (await this.vault.adapter.exists(filepath)) {
            console.error("FILE ALREADY EXISTS! " + filepath);
            if (bOverwrite) {
                await this.vault.adapter.write(filepath, data);
                console.log("OOO -> OVERRWORTE file " + filepath);
            }
        } else {
            await this.vault.create(filepath, data);
            console.log("CCC -> Created file " + filepath);
        }

    }

    pojoConversion ()

    getLogs () {
        console.log("HELPER LOGS", logs);
        return logs;
    }

    getHistory () {
        return this.loadedPojoHistory;
    }

    getHistoryVersion () {
        if (this.loadedPojoHistory) {
            console.log("HERE is the pojo version history", this.loadedPojoHistory);
            return this.loadedPojoHistory.version + " (" + this.loadedPojoHistory.numsaves + ") ";
        } else {
            return "Not Available";
        }
    }

    async InitHistory () {
        let loadedPojoHistory: object;
        const path = intoCompletrPath(this.vault, POJO_HISTORY_FILE);
        if (!(await this.vault.adapter.exists(path))) {
            logError("NO History file found to load: " + path);
            loadedPojoHistory = {
                "version": "???",
                "databases": {}
            };
        } else {
            try {
                loadedPojoHistory = await loadFromFile(this.vault, path);
            } catch (e) {
                logError("ERROR loading Pojo History", e);
                return;
            }
        }
        this.loadedPojoHistory = loadedPojoHistory;
        if (!loadedPojoHistory.version) {
            logError("ERROR in history file!", loadedPojoHistory);
            return;
        }
        console.log("POJO VERSION HISTORY " + this.loadedPojoHistory.version);
        logError("23fe23R 10:00");
    }

    getDatabases (): string[] {
        return this.pojoDatabases;
    }

    getFieldMOCName (dbinfo: object, type: string, fieldname: string, fieldvalues: string): string[] | null {
        if (!dbinfo || !dbinfo["field-info"]) { return null; }

        const allowed = dbinfo["field-info"][fieldname].allowed;
        const multi = dbinfo["field-info"][fieldname].multi;

        if (!allowed) {
            // Treat any value: fixed, history, history-type as YES for moc
            return null;
        }

        console.log("MOSC TIMES " + fieldname, fieldvalues);

        let retarray = null;
        if (allowed == "history" || allowed == "fixed") {
            retarray = [];
            if (multi) {
                if (Array.isArray(fieldvalues)) {
                    retarray = fieldvalues;
                } else {
                    const a1 = fieldvalues.split(multi);
                    for (const v1 of a1) {
                        retarray.push(v1);
                    }
                }
            } else {
                retarray.push(fieldvalues);
            }
        } else if (allowed == "history-type") {
            retarray = [];
            if (multi) {
                let a2;
                if (Array.isArray(fieldvalues)) {
                    a2 = fieldvalues;
                } else {
                    a2 = fieldvalues.split(multi);
                }
                for (const v2 of a2) {
                    retarray.push(type + " " + v2);
                }
            } else {
                retarray.push(type + " " + fieldvalues);
            }
        } else {
            console.error("UNKNOWN allowed value " + allowed, fieldname, dbinfo);
        }

        return retarray;
    }

    getDatabaseInfo (dbname: string): object | null {

        if (dbname == this.defsec) {
            return null;
        }

        const dbinfo = this.loadedPojoDB[dbname];
        if (!dbinfo) {
            console.error("ERROR missing database info in pojo settings", dbname);
            console.error("dbinfo is ", this.loadedPojoDB);
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

    addToHistory (tobj: object): object[] | null {

        const dbname = tobj._database;
        const dbinfo = this.getDatabaseInfo(dbname);
        console.log("addToHistory", tobj, dbinfo);
        if (!dbinfo) {
            console.error("ERROR getting database info for " + dbname);
            return null;
        }

        let bChanged = false;
        const changes = [];
        if (dbinfo["field-info"]) {
            if (!this.loadedPojoHistory.databases[dbname]) {
                this.loadedPojoHistory.databases[dbname] = {};
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
                            hkey = tobj._type + "_" + key;
                        }
                        bHistory = true;
                    }

                    if (bHistory && tobj[key]) {
                        if (!this.loadedPojoHistory.databases[dbname][hkey]) {
                            this.loadedPojoHistory.databases[dbname][hkey] = [];
                        }

                        const _addItem = function (ival) {
                            if (!ival) { return; }
                            console.log("dname " + dbname + " hkey " + hkey, self.loadedPojoHistory.databases[dbname]);
                            if (!self.loadedPojoHistory.databases[dbname][hkey].includes(ival)) {
                                bChanged = true;
                                console.log("ADDING THIS to " + dbname + " db -> " + hkey, ival);
                                changes.push({ "database": dbname, "key": hkey, "value": ival });

                                //                                self.loadedPojoHistory.databases[dbname][hkey].push(ival);
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

        if (bChanged) {
            return changes;
        } else {
            return null;
        }
    }

    async saveHistoryChanges (vault: Vault, changes: object[]): boolean {

        for (const item of changes) {

            const dbname = item.database;
            const dbinfo = this.getDatabaseInfo(dbname);
            if (!dbinfo) {
                console.error("ERROR getting database info", item);
            } else {
                const hkey = item.key;
                if (!this.loadedPojoHistory.databases[dbname]) {
                    this.loadedPojoHistory.databases[dbname] = {};
                }
                if (!this.loadedPojoHistory.databases[dbname][hkey]) {
                    this.loadedPojoHistory.databases[dbname][hkey] = [];
                }
                if (!this.loadedPojoHistory.databases[dbname][hkey].includes(item.value)) {
                    this.loadedPojoHistory.databases[dbname][hkey].push(item.value);
                }

            }

        }

        await this.saveHistory(vault);

        return true;
    }

    getHistoryChanges (tobj: object): object[] | null {

        const dbname = tobj._database;
        const dbinfo = this.getDatabaseInfo(dbname);
        console.log("getHistoryChanges from", tobj);
        if (!dbinfo) {
            console.error("ERROR getting database info for " + dbname);
            return null;
        }

        let bChanged = false;
        const changes = [];
        const finfo = dbinfo["field-info"];
        const self = this;
        for (const key in finfo) {
            if (finfo[key].allowed) {
                let bHistory = false;
                let hkey;
                const multi = finfo[key].multi;
                if (finfo[key].allowed == "history") {
                    hkey = key;
                    bHistory = true;
                } else if (finfo[key].allowed == "history-type") {
                    if (key == tobj._type) {
                        hkey = key;
                    } else {
                        hkey = tobj._type + "_" + key;
                    }
                    bHistory = true;
                }

                if (bHistory && tobj[key]) {
                    const _addItem = function (ival) {
                        if (!ival) { return; }
                        console.log("dname " + dbname + " hkey " + hkey, self.loadedPojoHistory.databases[dbname]);
                        if (!self.loadedPojoHistory.databases[dbname][hkey].includes(ival)) {
                            bChanged = true;
                            changes.push({ "database": dbname, "key": hkey, "value": ival });
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

        if (bChanged) {
            return changes;
        } else {
            return null;
        }
    }

    private getHistoryValues (dinfo: object, dkey: string): string[] {

        const dbname = dinfo.database;
        console.log("getHistoryValues with " + dkey, this.loadedPojoHistory);

        if (this.loadedPojoHistory.databases[dbname]) {
            if (this.loadedPojoHistory.databases[dbname][dkey]) {
                console.log("Get History  " + dinfo.database + " with " + dkey, this.loadedPojoHistory.databases[dbname][dkey]);
                console.log("pojoHistory for " + dbname, this.loadedPojoHistory.databases[dbname]);
                return this.loadedPojoHistory.databases[dbname][dkey];
            }
        }

        return [];
    }

    async deleteHistory (vault: Vault) {

        if (this.nohistoryx) {
            return;
        }

        this.loadedPojoHistory = {
            "version": "zzz",
            "databases": {}
        };

        await this.saveHistory(vault);
    }

    async saveHistory (vault: Vault, override: object) {

        if (override) {
            console.log("WILL be overriding the history with supplied object!", override);
            this.loadedPojoHistory = override;
        }

        if (!this.loadedPojoHistory.hasOwnProperty("numsaves")) {
            this.loadedPojoHistory.numsaves = 0;
        }
        this.loadedPojoHistory.numsaves++;
        console.log("POJO HISTORY!!", this.loadedPojoHistory);
        if (this.nohistoryx) {
            console.log("NO HISTORY CHANGES will be saved!!!");
            return;
        }

        logError(">>> SAVING TO HISTORY " + this.loadedPojoHistory.numsaves);

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

        robj._database = this.normalizeValue(taga[0]);
        robj._type = "";
        if (taga.length > 1) {
            robj._type = this.normalizeValue(taga[1]);
        }

        const dbinfo = this.getDatabaseInfo(robj._database);
        if (!dbinfo) {
            // ERROR
            return null;
        }
        robj[dbinfo.type] = this.normalizeValue(taga[1]);
        robj._params = dbinfo.params;
        robj._typeparam = dbinfo.type;

        const finfo = dbinfo["field-info"];
        if (finfo) {
            // Check if the type is limited to a set of allowed values
            const tinfo = finfo[dbinfo.type];
            if (tinfo && tinfo.allowed && tinfo.allowed == "fixed" && tinfo.values) {
                const vals = tinfo.values["_ALL"];
                const allowed = vals.find(el => el == robj._type);
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
                                                    if (el == p) {
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

        //        console.log("HERE IS ROBJ", robj);

        return robj;
    }

    getSuggestedValues (pobj: object): Suggestion[] | null {

        //        console.log("getSuggestedValues", pobj);

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
            console.log("JUST FILTERED with >>" + locval + "<<");
            for (const v of values) {
                v.origContext = locval;
            }
            console.log("HERE is values", values);
        }

        return values;
    }

    // Parse for key:: value pairs.
    parseForAnnotations (line: string): object | null {

        const aval = line.split("::");
        if (aval.length > 1) {
            if (aval[0] && aval[1]) {
                const key = this.normalizeReference(aval[0]);
                const value = this.normalizeValue(aval[1]);
                const robj = {};
                robj[key] = value;
                return robj;
            }
        }

        return null;
    }

    private normalizeReference (ref: string): object {
        // Tags and Header3 sections are case insensitive but normalized to a canonical form.
        const a = ref.split("/");
        if (a.length == 1) {
            // NOT actually a database name, just the normalized value
            return this.normalizeValue(ref);
        } else {
            const norm = [];
            for (w of a) {
                norm.push(this.normalizeValue(w));
            }
            const nref = norm.join("/");
            const database = norm[0];
            const type = norm[1];
            return { database, type, nref };
        }
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
        //        console.log("getValues with " + pname + " type: " + type, dinfo);
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
            return [...new Set([...values, ...this.getHistoryValues(dinfo, type + "_" + pname)])];
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

const logs = {
    errors: [],
    debug: []
}


export function logDebug (category: string, msg: string, dobj?: object) {
    if (!logs.debug[category]) { logs.debug[category] = []; }
    logs.debug[category].push(msg);
    if (dobj) {
        logs.debug[category].push(JSON.stringify(dobj, null, 3));
    }
}


export function logError (msg: string, dobj?: object) {
    logs.errors.push(msg);
    if (dobj) {
        logs.errors.push("   " + JSON.stringify(dobj, null, 3));
    }
    console.error(msg, dobj);
}
