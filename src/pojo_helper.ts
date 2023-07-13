import { PojoSettings, generatePath, pluginPath } from "./settings";
import { Suggestion } from "./provider/provider";
import { Vault, Platform, TFile, TFolder, App } from "obsidian";

const POJO_TAG_PREFIX_REGEX = /^#(?!#)/;
const POJO_H3_PREFIX_REGEX = /^### /;

const POJO_HISTORY_FILE = "pojo_history.json";

export class PojoHelper {

    private settings: PojoSettings;
    private pojoProvider: object;
    private loadedPojoDB: Record<string, never>;
    private loadedPojoHistory: object;
    private nohistoryx: boolean;
    private defsec: string;
    private vault: Vault;
    private app: App;
    private metaunits: object;
    private metatimes: object;
    private logs: object;
    private debugging: boolean;
    private errorstack: null;

    constructor(pojoProvider: object, pojosettings: PojoSettings, vault: Vault, app: App) {
        this.pojoProvider = pojoProvider;
        this.settings = pojosettings;
        this.nohistoryx = false;
        this.defsec = this.settings.daily_entry_h3[0];
        this.vault = vault;
        this.app = app;
        this.logs = {};
        this.errorstack = [];

        // DEBUGGING MODE
        this.debugging = false;

        this.metaunits = {};
        this.metatimes = {};
        if (this.settings.metameta) {
            for (const field in this.settings.metameta) {
                const ifield = this.settings.metameta[field];
                ifield.name = field;
                if (ifield.units) {
                    for (const unit of ifield.units) {
                        if (unit) {
                            this.metaunits[unit] = ifield;
                        } else {
                            this.metaunits["_default-" + ifield.type] = ifield;
                        }
                    }
                } else {
                    this.metaunits["_default"] = ifield;
                }
                this.metatimes[ifield.type] = ifield;
            }
        }
    }

    getPluginFolder () {
        return this.vault.configDir + "/plugins/obsidian-pojo";
    }

    async saveConversionLogFile (infoobj: object) {

        const logfile = [];
        const _addToLog = function (line: string) {
            logfile.push(line);
        }


        const now = new Date();
        const nowinfo = now.toDateString() + " " + now.valueOf();

        const _getItemString = function (note: string, type: string, item: object): string {

            let msg;
            if (type == "error") {
                msg = "❌ ";
            } else if (type == "warn") {
                msg = "⚠ ";
            } else {
                msg = "✔ ";
            }
            msg += note;

            const _parseItem = function (key, val) {
                if (val == null) {
                    msg += ` ${key}:`
                } else if (typeof val === 'object') {
                    msg += ` (${key}:`;
                    for (const key2 in val) {
                        _parseItem(key2, val[key2]);
                    }
                    msg += ')';
                } else if (Array.isArray(val)) {
                    msg += ` [${key}:`
                    let index = 1;
                    for (const aitem of val) {
                        _parseItem(index, aitem);
                        index++;
                    }
                    msg += ']';
                } else {
                    msg += ` ${key}: ${val}`;
                }
            }

            if (item) {
                for (const key in item) {
                    _parseItem(key, item[key]);
                }
            }
            return msg;
        }

        _addToLog("## Conversion Summary");
        _addToLog("");

        let msgend = ""
        const nSuccess = Object.keys(infoobj.success).length;
        if (nSuccess > 0) {
            if (nSuccess == 1) { msgend = " note." } else { msgend = " notes." }
            _addToLog("Succesfully processed " + nSuccess + msgend);
        }
        const nFailure = Object.keys(infoobj.failure).length;
        if (nFailure > 0) {
            if (nFailure == 1) { msgend = " failure encountered." } else { msgend = " failures encountered." }
            _addToLog(nFailure + msgend)
        }
        const nWarning = Object.keys(infoobj.warning).length;
        if (nWarning > 0) {
            if (nWarning == 1) { msgend = " warning encountered." } else { msgend = " warnings encountered." }
            _addToLog(nWarning + msgend);
        }
        _addToLog("");
        _addToLog(this.getPlatformInfo());


        let note;
        if (nFailure > 0) {
            _addToLog("");
            _addToLog("## Failures");
            _addToLog("");
            for (note in infoobj.failure) {
                const failobj = infoobj.failure[note];
                const msg = _getItemString(note, "error", failobj);
                _addToLog(msg);

            }
        }

        if (nWarning > 0) {
            _addToLog("");
            _addToLog("## Warnings");
            _addToLog("");
            for (note in infoobj.warning) {
                const warnobj = this.infoobj.warning[note];
                const msg = _getItemString(note, "warn", warnobj);
                _addToLog(msg);
            }
        }

        const foldername = generatePath(this.settings.folder_pojo, this.settings.subfolder_logs);
        const filename = nowinfo + ".md";

        await this.createVaultFile(logfile.join("\n"), foldername, filename, false);
    }

    async createVaultFile (data: string, folder: string, filename: string, bOverwrite: boolean) {

        // First check if folder exists in vault.
        if (!(await this.vault.adapter.exists(folder))) {
            this.logDebug("Folder " + folder + " must be created.");
            await this.vault.adapter.mkdir(folder);
        }

        const filepath = generatePath(folder, filename);
        if (await this.vault.adapter.exists(filepath)) {
            if (bOverwrite) {
                await this.vault.adapter.write(filepath, data);
                this.logDebug("OOO -> OVERRWORTE file " + filepath);
            }
        } else {
            await this.vault.create(filepath, data);
            this.logDebug("CCC -> Created file " + filepath);
        }

    }

    pojoConversion ()

    getLogs () {
        this.logDebug("HELPER LOGS", this.logs);
        return this.logs;
    }

    async saveTextToFile (messages: string[], filename: string) {
        const fcontent = messages.join("\n");
        await this.vault.adapter.write(pluginPath(this.vault, filename), fcontent);
    }

    saveLogs () {
        // Just errors for now!
        this.saveTextToFile(this.logs["errors"], "errors.txt");
    }

    async pojoLogs (category: string, errs: string[], dobj?: object, bend?: boolean) {

        if (this.debugging) { console.log(">>>>>>>>>>>>>>>"); }
        for (const eem of errs) {
            if (category == "errors") {
                console.error(eem);
            } else if (this.debugging) {
                console.log(eem);
            }
        }
        if (dobj) {
            if (category == "errors") {
                console.error(dobj);
            } else if (this.debugging) {
                console.log(dobj);
            }
        }
        if (this.debugging) { console.log("<<<<<<<<<<"); }

        if (!this.debugging && category !== "errors") {
            return;
        }

        if (!this.logs[category]) { this.logs[category] = []; }
        let pref = "[[ ";
        let suffix = "";
        for (let n = 0; n < errs.length; n++) {
            if (n == 0) {
                pref = "[[ ";
            } else if (n == errs.length && !dobj) {
                pref = " ]]";
            } else {
                pref = ""
            }
            if (errs.length == 1) {
                suffix = " ]]";
            }
            this.logs[category].push(pref + errs[n] + suffix);
        }

        if (dobj) {
            let emsg;
            try {
                emsg = JSON.stringify(dobj, null, 3);
            } catch {
                emsg = "Error stringifying object";
            }

            this.logs[category].push(emsg);
            this.logs[category].push(" ]]");
        }

        if (bend) {
            this.saveLogs();
        }
    }

    logDebug (category: string, obj?: string | object, dobj?: object) {
        const msgs = [category];
        if (obj) {
            if (typeof obj === 'string') {
                msgs.push(obj);
            } else {
                dobj = obj;
            }
        }
        this.pojoLogs("debug", msgs, dobj);
    }

    errorStack (bReset: boolean): Array<T> {
        if (bReset) {
            this.errorstack = [];
        }
        return this.errorstack;
    }

    logError (msg: string, dobj?: object) {
        this.pojoLogs("errors", [msg], dobj);
        this.errorstack.push({
            message: msg,
            object: dobj
        });
    }

    getPlatformInfo () {
        const platform = Platform;
        let info = "";

        if (platform.isMobileApp) { info += " MobileApp"; }
        if (platform.isDesktopApp) { info += " DesktopApp"; }
        if (platform.isIosApp) { info += " IosApp"; }
        if (platform.isAndroidApp) { info += " AndroidApp"; }


        if (platform.isMacOS) { info += " MacOS"; }
        if (platform.isWin) { info += " Win"; }
        if (platform.isLinux) { info += " Linux"; }
        if (platform.isSafari) { info += " Safari"; }

        if (platform.isDesktop) { info += " Desktop"; }
        if (platform.isMobile) { info += " Mobile"; }
        if (platform.isTablet) { info += " Tablet"; }
        if (platform.isPhone) { info += " Phone"; }

        return info;
    }

    getHistory () {
        return this.loadedPojoHistory;
    }

    async InitDatabases () {

        const dbpath = generatePath(this.settings.folder_pojo, this.settings.subfolder_databases);
        const dbfolder = this.vault.getAbstractFileByPath(dbpath) as TFolder;
        this.logDebug("initDB stuff for " + dbpath + " !!!", dbfolder);
        if (!dbfolder) {
            this.logError("ERROR - database folder is NOT FOUND!", dbpath);
            return false;
        }

        const pojoDB = {};
        const pojoHistory = {
            version: "???",
            databases: {}
        };
        const dbkeys = [];

        this.logDebug("Get contents of databases folder " + dbpath);

        if (dbfolder && dbfolder.children) {
            for (const fobj of dbfolder.children) {
                const fname = this.vault.getAbstractFileByPath(fobj.path);
                this.logDebug("Get Markdown Info", fname.path);
                const fm = await this.getMarkdownFileInfo(fname, false);
                if (fm) {
                    this.logDebug("FMINFO ", fm);
                    const dbname = fm._database.database;
                    dbkeys.push(dbname);
                    pojoDB[dbname] = fm._database;
                    pojoHistory.databases[dbname] = fm;
                }
            }
        } else {
            this.logError("ERROR on dbfolder eh?");
            return false;
        }

        this.loadedPojoDB = pojoDB;
        this.loadedPojoHistory = pojoHistory;

        this.logDebug("POJO DB NEW", pojoDB);
        //        this.logDebug("POJO DB OLD", this.loadedPojoDB);

        this.logDebug("POJO HISTORY NEW", pojoHistory);
        //      this.logDebug("POJO HISTORY OLD", this.loadedPojoHistory);

        this.pojoDatabases = dbkeys;

        return true;
    }

    getDatabases (bDetailed: boolean): string[] {
        if (bDetailed) {
            return this.loadedPojoHistory;
        } else {
            return this.pojoDatabases;
        }
    }

    async getMOCTemplates (): Promise<object> | null {
        const mtpath = generatePath(this.settings.folder_pojo, this.settings.subfolder_templates);
        const mtfolder = this.vault.getAbstractFileByPath(mtpath) as TFolder;
        if (!mtfolder) {
            this.logError("ERROR - moc template folder is NOT FOUND!", mtpath);
            return null;
        }

        const pojoMT = {};
        if (mtfolder && mtfolder.children) {
            for (const fobj of mtfolder.children) {
                const fname = this.vault.getAbstractFileByPath(fobj.path);
                this.logDebug("Get Markdown Info", fname.path);
                const finfo = await this.getMarkdownFileInfo(fname, true);
                // finfo.content finfo.frontmatter
                if (finfo && finfo.frontmatter && finfo.frontmatter.Category) {
                    this.logDebug("FMINFO ", finfo);
                    const catname = finfo.frontmatter.Category;
                    pojoMT[catname] = finfo.frontmatter;
                    pojoMT[catname].content = finfo.content;
                } else {
                    this.logError("ERROR in MOC Template file " + fobj.path, finfo);
                    console.error("ERROR in MOC Template file " + fobj.path, finfo);
                }
            }
        } else {
            this.logError("ERROR on mtfolder eh?");
            return null;
        }

        return pojoMT;
    }

    displayMetaMeta (pname, pvalue) {

        this.logDebug("displayMetaMeta:" + pname + ":" + pvalue + ":", this.settings.metameta);

        if (!this.settings.metameta || !this.settings.metameta[pname]) {
            return pvalue;
        }

        const fieldi = this.settings.metameta[pname];

        if (fieldi.type == "duration") {
            if (pvalue > 60) {
                pvalue = pvalue / 60 + " hr";
            } else {
                pvalue += " min";
            }
        } else if (fieldi.type == "text") {
            pvalue = "[[" + pvalue + "]] " + fieldi.display;
        } else {
            pvalue += fieldi.display
        }

        return " (" + pvalue + ")";
    }

    calcPeriod (starttime, endtime, duration) {

        const _convertTime = function (timeval) {
            const a = timeval.split(":");
            const hr = parseInt(a[0], 10);
            const min = parseInt(a[1], 10);
            return hr * 60 + min;
        }

        const _convertMin = function (durationval) {
            const hr = parseInt(durationval / 60, 10);
            const min = durationval % 60;
            if (min < 10) {
                return hr + ":0" + min;
            } else {
                return hr + ":" + min;
            }
        }

        if (starttime == "_CALC_") {
            const start = _convertTime(endtime) - duration;
            return _convertMin(start);
        } else if (endtime == "_CALC_") {
            const end = _convertTime(starttime) + duration;
            return _convertMin(end);
        } else if (duration == "_CALC_") {
            const start = _convertTime(starttime);
            const end = _convertTime(endtime);
            return end - start;
        }
    }

    extractMetaMeta (record: object): boolean {

        if (!this.settings.metameta || !record._tags) {
            return false;
        }

        this.logDebug("extrctMetaMeta metaunits", this.metaunits);
        this.logDebug("HERE is record to add meta", record);

        for (let tag of record._tags) {
            const leadingnum = tag.replace(/[^0-9]/g, "");
            let num = parseFloat(leadingnum);
            const unit = tag.replace(/[0-9.:;]/g, '');
            const ca = tag.split(":");
            let type = "duration";
            let fieldi;
            if (isNaN(num)) {
                // Assume it is a text field.
                let tkey = "_default-text";
                if (ca.length == 2) {
                    tkey = ca[0];
                    tag = ca[1];
                }
                fieldi = this.metaunits[tkey];
            } else {
                if (ca.length == 2) { type = "start-time"; }
                if (!unit) {
                    fieldi = this.metaunits["_default-" + type];
                    if (!fieldi) {
                        fieldi = this.metaunits["_default"];
                    }
                } else {
                    fieldi = this.metaunits[unit];
                }
            }
            //            this.logDebug("here is fieldi for " + tag + " and unit " + unit, fieldi);

            if (!fieldi) {
                this.logError("ERROR getting fieldi for tag " + tag);
                return false;
            }

            type = fieldi.type;

            if (type == "text") {
                record[fieldi.name] = tag;
            } else {
                if (fieldi.type == "duration") {
                    if (unit == "h" || unit == "hr") {
                        num *= 60;
                        num = parseInt(num + '', 10);
                    }
                } else if (fieldi.type.search("time") != -1) {
                    num = tag.replace(/[a-zA-Z.;]/g, '');
                }
                record[fieldi.name] = num;
            }
        }

        // Add time related info if it can be calculated.
        const starttimekey = this.metatimes["start-time"] ? this.metatimes["start-time"].name : "_NOTSET_";
        const endtimekey = this.metatimes["end-time"] ? this.metatimes["end-time"].name : "_NOTSET_";
        const durationkey = this.metatimes["duration"] ? this.metatimes["duration"].name : "_NOTSET_";
        if (record[starttimekey]) {
            if (record[endtimekey]) {
                // Calculate duration based on start and ends.
                if (durationkey !== "_NOTSET_") {
                    record[durationkey] = this.calcPeriod(record[starttimekey], record[endtimekey], "_CALC_");
                }
            } else if (record[durationkey]) {
                // Calculate endtime based on duration
                if (durationkey !== "_NOTSET_") {
                    record[endtimekey] = this.calcPeriod(record[starttimekey], "_CALC_", record[durationkey]);
                }
            }
        } else if (record[endtimekey]) {
            if (record[durationkey]) {
                // Calculate endtime based on duration
                if (durationkey !== "_NOTSET_") {
                    record[endtimekey] = this.calcPeriod("_CALC_", record[endtimekey], record[durationkey]);
                }
            }
        }

        this.logDebug("ADDED meta", record);

        return true;
    }

    getFieldMOCName (dbinfo: object, type: string, fieldname: string, fieldvalues: string): string[] | null {
        if (!dbinfo || !dbinfo["field-info"] || !dbinfo["field-info"][fieldname]) { return null; }

        // moc is the field which indicates if a moc is going to be created. The allowed values are moc and moc-type
        const mocref = dbinfo["field-info"][fieldname].mocref;
        const multi = dbinfo["field-info"][fieldname].multi;

        if (!mocref) {
            return null;
        }

        this.logDebug("MOSC TIMES " + fieldname + " mocref " + mocref, fieldvalues);

        let retarray = null;
        if (mocref == "moc") {
            retarray = [];
            if (multi && multi !== "NA") {
                if (Array.isArray(fieldvalues)) {
                    retarray = fieldvalues;
                } else {
                    const a1 = this.splitParam(multi, fieldvalues);
                    for (const v1 of a1) {
                        retarray.push(v1);
                    }
                }
            } else {
                retarray.push(fieldvalues);
            }
        } else if (mocref == "moc-type") {
            retarray = [];
            if (multi && multi !== "NA") {
                let a2;
                if (Array.isArray(fieldvalues)) {
                    a2 = fieldvalues;
                } else {
                    a2 = this.splitParam(multi, fieldvalues);
                }
                for (const v2 of a2) {
                    retarray.push(type + " " + v2);
                }
            } else {
                retarray.push(type + " " + fieldvalues);
            }
        } else {
            if (mocref !== "NA") {
                this.logError("UNKNOWN mocref value " + mocref, fieldname, dbinfo);
            }
        }


        this.logDebug("MOSC returns", retarray);
        return retarray;
    }

    getDatabaseInfo (dbname: string): object | null {

        if (dbname == this.defsec) {
            return null;
        }

        const dbinfo = this.loadedPojoDB[dbname];
        if (!dbinfo) {
            this.logError("ERROR missing database info in pojo settings", dbname);
            this.logError("dbinfo is ", this.loadedPojoDB);
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

    convertDBInfoToYaml (dbinfo: object, md: string[],) {
        md.push("_database: ");

        if (dbinfo.database) {
            md.push("   database: " + dbinfo.database);
        }

        if (dbinfo.type) {
            md.push("   type: " + dbinfo.type);
        }

        if (dbinfo.params) {
            const pstr = "[" + dbinfo.params.join(",") + "]";
            md.push("   params: " + pstr);
        }

        if (dbinfo["field-info"]) {
            md.push("   field-info:");
            for (const field in dbinfo["field-info"]) {
                const finfo = dbinfo["field-info"][field];
                md.push("      " + field + ":");
                for (const fp in finfo) {
                    if (fp !== "values") {
                        let val = "NA";
                        if (finfo[fp]) {
                            val = finfo[fp];
                        }
                        if (val == "-") {
                            val = "DASH";
                        } else if (val == ",") {
                            val = "COMMA";
                        }
                        md.push("         " + fp + ": " + val);
                    }
                }
            }
        }
    }

    async checkAttachmentExists (fname: string): Promise<boolean> {
        const attachment = generatePath(this.settings.folder_attachments, fname);
        return await this.vault.adapter.exists(attachment);
    }

    async loadDailyNoteImageFile (imageinfo: object): Promise<object> {


        // First find the image file.
        const imagefile = generatePath(this.settings.folder_daily_notes, imageinfo.imagedir, imageinfo.imagesource);
        const retobj = {
            imagefile: imagefile,
            data: null,
            status: "success"
        }

        if (!await this.vault.adapter.exists(imagefile)) {
            console.error("ERROR finding image file " + imagefile, imageinfo);
            retobj.status = "NOT FOUND";
            return retobj;
        }

        try {
            retobj.data = await this.vault.adapter.read(imagefile);
        } catch (err) {
            console.error("ERROR reading source file", imagefile, err);
            retobj.status = err.message;
            return retobj;
        }

        return retobj;
    }

    async copyDailyNoteImageFile (imageinfo: object, bCleanup: boolean): Promise<object> {
        // First find the image file.
        const imagefile = generatePath(this.settings.folder_daily_notes, imageinfo.imagedir, imageinfo.imagename);

        const retobj = {
            status: "success",
            imagefile: imagefile
        }

        if (!await this.vault.adapter.exists(imagefile)) {
            console.error("ERROR finding image fileL " + imagefile, imageinfo);
            // Does not exist
            retobj.status = "NO IMAGE FOUND";
            return retobj;
        }

        // Copy
        const targetfile = generatePath(this.settings.folder_attachments, imageinfo.imagename);
        try {
            await this.vault.adapter.copy(imagefile, targetfile);
        } catch (err) {
            console.error("ERROR copying file", imagefile, targetfile, err);
            retobj.status = "Error copying image. " + err.message;
            return retobj;
        }

        // Delete source file and folder 
        if (bCleanup) {
            console.log("TODO - cleanup stuff!!!");
        }

        return retobj;
    }

    async writeDailyNoteImageFile (imageinfo: object, outputBuffer: ArrayBuffer): Promise<boolean> {

        const targetfile = generatePath(this.settings.folder_attachments, imageinfo.imagename);
        try {
            await this.vault.adapter.writeBinary(targetfile, outputBuffer);
        } catch (e) {
            console.error("ERROR writing out file " + targetfile, e);
            return false;
        }

        return true;
    }

    async saveDatabaseFile (dbname: string): boolean {
        const mdfilename = dbname + ".md";
        const md = [];
        md.push("---");

        const dbdata = this.loadedPojoHistory.databases[dbname];

        const dbinfo = this.loadedPojoDB[dbname];
        this.logDebug("Saving DB File " + dbname, dbdata);
        this.logDebug("HERE is db info for " + dbname, dbinfo);
        this.convertDBInfoToYaml(dbinfo, md);

        for (const key in dbdata) {
            if (key !== "_database") {
                md.push(key + ":");
                const keya = dbdata[key];
                if (keya) {
                    if (Array.isArray(keya)) {
                        for (const val of keya) {
                            md.push("   - " + val);
                        }
                    }
                } else {
                    this.logError("ERROR found unexpected key value" + key, keya);
                }
            }
        }
        md.push("---");
        md.push("");
        md.push("# " + dbname);

        if (dbinfo.params) {
            md.push("");
            md.push("## Entries can include the following parameters:");
            for (const p of dbinfo.params) {
                md.push("* " + p);
            }
        }
        md.push("")
        md.push("## Additional Parameters:")
        md.push("* You may also include @TIME @CLOCK and/or @CLOCKe:");
        md.push("* Where TIME is a duration (number) in minutes.");
        md.push("* Where CLOCK is a 24 hour clock time in hours:minutes");
        md.push("* @CLOCK is the start time and @CLOCKe is the end time.")
        md.push("* @NUMz (energy) and @NUMj (happiness) on scales where NUM is from 1 to 10.");

        const foldername = generatePath(this.settings.folder_pojo, this.settings.subfolder_databases);
        await this.createVaultFile(md.join("\n"), foldername, mdfilename, true);

        return true;
    }

    /*
    async convertHistoryTime (vault: Vault): boolean {
        this.logDebug("HERE is the convertHistoryTime!", this.loadedPojoHistory);
        this.logDebug("DB Stuff", this.loadedPojoDB);

        for (const dbname in this.loadedPojoHistory.databases) {
            await this.saveDatabaseFile(dbname);
        }

        return true;
    }
*/

    async getMarkdownFileInfo (mfile: TFile, bContentAlso: boolean): object | null {
        // Returns file frontmatter ONLY if bContent is false.
        let content;
        if (bContentAlso) {
            try {
                content = await this.vault.read(mfile);
            } catch (err) {
                this.logError("ERROR reading file ", mfile.path);
                this.logError("Error", err);
                return null;
            }
        }
        //        console.log("HERE is the file content", content);

        let frontmatter = {};
        let bodytext = "";
        try {

            const filecontent = this.app.metadataCache.getFileCache(mfile);
            frontmatter = filecontent?.frontmatter;


            if (bContentAlso) {
                let endfm = 0;
                if (filecontent.sections && filecontent.sections[0] && filecontent.sections[0].type == "yaml") {
                    // Remove the frontmatter.
                    endfm = filecontent.sections[0].position.end.line + 1;
                }
                bodytext = content.split("\n").slice(endfm).join("\n");
            }
        } catch (err) {
            this.logError("ERROR extracting frontmatter " + mfile.path);
            this.logError("ERROR reading file contents ", err);
            return null;
        }

        if (bContentAlso) {
            return {
                frontmatter: frontmatter,
                content: bodytext
            }
        } else {
            return frontmatter;
        }
    }

    addToHistoryFromLine (line: string): boolean {
        if (!line) {
            return false;
        }

        line = this.stripLeading(line);
        this.logDebug("HISTORY -------------------------------------------");
        this.logDebug(`>>${line}<<`);
        let tobj;
        try {
            tobj = this.parsePojoLine(line);
        } catch (err) {
            this.logError("ERROR parsing pojo line", err);
        }
        this.logDebug("parsePojoLine on " + line, tobj);
        if (!tobj) { return false; }

        return this.addToHistory(tobj);
    }

    addToHistory (tobj: object): object[] | null {

        const dbname = tobj._database;
        const dbinfo = this.getDatabaseInfo(dbname);
        this.logDebug("addToHistory", tobj, dbinfo);
        if (!dbinfo) {
            this.logError("ERROR getting database info for " + dbname);
            return null;
        }

        let bChanged = false;
        const changes = [];
        if (dbinfo["field-info"]) {
            if (!this.loadedPojoHistory.databases[dbname]) {
                this.loadedPojoHistory.databases[dbname] = {};
            }

            //            this.logDebug("DA HISTORY", this.loadedPojoHistory);
            const finfo = dbinfo["field-info"];
            const self = this;
            for (const key in finfo) {
                if (finfo[key].allowed && finfo[key].allowed !== "NA") {
                    let bHistory = false;
                    let hkey;
                    const multi = finfo[key].multi;
                    this.logDebug("HISTORY for " + key, finfo);
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
                            this.logDebug("dname " + dbname + " hkey " + hkey, self.loadedPojoHistory.databases[dbname]);
                            if (!self.loadedPojoHistory.databases[dbname][hkey].includes(ival)) {
                                bChanged = true;
                                this.logDebug("ADDING THIS to " + dbname + " db -> " + hkey, ival);
                                changes.push({ "database": dbname, "key": hkey, "value": ival });

                                //                                self.loadedPojoHistory.databases[dbname][hkey].push(ival);
                            }
                        }

                        if (Array.isArray(tobj[key])) {
                            for (const val of tobj[key]) {
                                _addItem(val);
                            }
                        } else if (multi && multi !== "NA") {
                            const avals = this.splitParam(multi, tobj[key]);
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

        console.log("saveHistoryChanges", changes);
        const dbchanges = {};
        for (const item of changes) {

            const dbname = item.database;
            const dbinfo = this.getDatabaseInfo(dbname);
            if (!dbinfo) {
                this.logError("ERROR getting database info", item);
            } else {
                const hkey = item.key;
                if (!this.loadedPojoHistory.databases[dbname]) {
                    this.loadedPojoHistory.databases[dbname] = {};
                }
                if (!this.loadedPojoHistory.databases[dbname][hkey]) {
                    this.loadedPojoHistory.databases[dbname][hkey] = [];
                }
                if (!this.loadedPojoHistory.databases[dbname][hkey].includes(item.value)) {
                    const val = item.value;
                    // TODO. Make sure val doesn't include invalid YAML values!!!
                    this.loadedPojoHistory.databases[dbname][hkey].push(val);
                }

                dbchanges[dbname] = true;
            }
        }

        console.log("HERE is loadedPojoHistory", this.loadedPojoHistory);

        for (const dbx in dbchanges) {
            await this.saveDatabaseFile(dbx);
        }

        return true;
    }

    getHistoryChanges (tobj: object): object[] | null {

        const dbname = tobj._database;
        const dbinfo = this.getDatabaseInfo(dbname);
        this.logDebug("getHistoryChanges from", tobj);
        if (!dbinfo) {
            this.logError("ERROR getting database info for " + dbname);
            return null;
        }

        let bChanged = false;
        const changes = [];
        const finfo = dbinfo["field-info"];
        const self = this;
        for (const key in finfo) {
            if (finfo[key].allowed && finfo[key].allowed !== "NA") {
                let bHistory = false;
                let hkey;
                let multi = finfo[key].multi;
                if (multi == "DASH") {
                    multi = "-";
                } else if (multi == "COMMA") {
                    multi = ","
                }
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
                        self.logDebug("ZZ dname " + dbname + " hkey " + hkey, self.loadedPojoHistory.databases[dbname]);
                        if (!self.loadedPojoHistory.databases[dbname][hkey]) {
                            self.loadedPojoHistory.databases[dbname][hkey] = [];
                        }
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
        this.logDebug("getHistoryValues with " + dkey, this.loadedPojoHistory);

        if (this.loadedPojoHistory.databases[dbname]) {
            if (this.loadedPojoHistory.databases[dbname][dkey]) {
                this.logDebug("Get History  " + dinfo.database + " with " + dkey, this.loadedPojoHistory.databases[dbname][dkey]);
                this.logDebug("pojoHistory for " + dbname, this.loadedPojoHistory.databases[dbname]);
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
            this.logDebug("WILL be overriding the history with supplied object!", override);
            this.loadedPojoHistory = override;
        }

        if (!this.loadedPojoHistory.hasOwnProperty("numsaves")) {
            this.loadedPojoHistory.numsaves = 0;
        }
        this.loadedPojoHistory.numsaves++;

        const now = new Date();
        const nowinfo = now.toLocaleString();
        const platforminfo = this.getPlatformInfo();
        if (!this.loadedPojoHistory.history_editors) { this.loadedPojoHistory.history_editors = {}; }
        this.loadedPojoHistory.history_editors[platforminfo] = this.loadedPojoHistory.version + "-" + this.loadedPojoHistory.numsaves + " --> " + nowinfo;

        this.logDebug("POJO HISTORY!!", this.loadedPojoHistory);
        if (this.nohistoryx) {
            this.logDebug("NO HISTORY CHANGES will be saved!!!");
            return;
        }

        this.logError(">>> SAVING TO HISTORY " + this.loadedPojoHistory.numsaves);

        await vault.adapter.write(pluginPath(vault, POJO_HISTORY_FILE), JSON.stringify(this.loadedPojoHistory, null, 3));
    }

    parsePojoLine (tagline: string): object | null {

        if (!tagline) return null;
        let bTrailingSpace = false;
        if (tagline.charAt(tagline.length - 1) == " ") {
            bTrailingSpace = true;
        }
        tagline = tagline.trimEnd();

        this.logDebug("HERE DA LINE", tagline);

        // Pojo Tags (or H3) do not have spaces in the reference except for Daily Entry
        if (this.settings.daily_entry_h3.includes(tagline)) {
            return {
                _database: tagline
            }
        }

        const robj = {};

        // First strip out all @tags 
        let bLastParamTag = false;
        let params = tagline.split(" ");
        let plen = params.length;
        let tags = null;
        this.logDebug("STARTING PARAMS " + plen, params);

        if (plen > 0) {
            params = params.filter(function (val) {
                if (val && val.charAt(0) == "@") {
                    if (!tags) { tags = []; }
                    tags.push(val.slice(1));
                    bLastParamTag = true;
                    return false;
                } else {
                    bLastParamTag = false;
                    return true;
                }
            });
        }

        plen = params.length;
        this.logDebug("FILTERED PARAMS " + plen, params);

        if (tags) {
            robj._tags = tags;
            this.logDebug("Stripped out tags! ", tags);
            this.logDebug("Last param is tag: " + bLastParamTag + " trailing space: " + bTrailingSpace);
        }

        const taga = params[0].split("/");
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
        robj._params = [...dbinfo.params];

        // Add the possible @tags types
        if (this.settings.metameta) {
            for (const mtag in this.settings.metameta) {
                //                const tagi = this.metameta[mtag];
                robj._params.push(mtag);
            }
        }
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
                    this.logError(emsg, robj.type);
                } else {
                    robj[dbinfo.type] = allowed;
                }
            }

            if (plen > 1) {
                params.shift();

                const roline = params.join(" ");
                this.logDebug("roline is " + roline);
                const aparams = this.splitParams(roline);

                if (aparams) {
                    if (aparams.length > dbinfo.params.length) {
                        this.logError("ERROR in tag params. More than expected for tag ");
                        this.logError("Problem line content: " + roline);
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
                                        // TODO: Need to change how fixed is handled.
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
                                                    this.logError(emsg, alla);
                                                } else {
                                                    p = allowedp;
                                                }
                                            }
                                        }
                                        if (finfo[pkey].multi) {
                                            const va = this.splitParam(finfo[pkey].multi, p);
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

        if (bLastParamTag && !bTrailingSpace) {
            // In a tag at the moment.
            robj._loc = "tag";
        }

        // We check if the _params[0] is empty. If so, we set any metadata values for it.
        //        const subtype = robj._params[0];
        //        if (!robj[subtype] && robj[_tags]){
        //
        //      })

        //        this.logDebug("HERE IS ROBJ", robj);
        //        console.log("HERE DA ROBJ", robj);

        return robj;
    }

    getSuggestedValues (pobj: object): Suggestion[] | null {

        //        this.logDebug("getSuggestedValues POJO Object", pobj);

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
                if (locval && multi && multi !== "NA") {
                    this.logDebug("WE DOING multi " + multi, dinfo, pobj);
                    const avals = this.splitParam(multi, locval);
                    locval = avals[avals.length - 1].trim();
                    this.logDebug("MULTI FILTER VALS ", avals, locval);
                }
            }
            values = this.filterValues(locval, svalues);
            this.logDebug("JUST FILTERED with >>" + locval + "<<");
            for (const v of values) {
                v.origContext = locval;
            }
            this.logDebug("HERE is suggested values", values);
        }

        this.logDebug("getSuggestedValues number " + values.length);

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
            av = values.filter(value => {
                if (value && typeof value === 'string') {
                    return value.toLowerCase().startsWith(lcin);
                } else {
                    return true;
                }
            });
        }

        for (const v of av) {
            sa.push(Suggestion.fromString(v, null, "pojo"));
        }
        return sa;
    }

    private getValues (dinfo: object, pname: string, type?: string): string[] | null {
        //        this.logDebug("getValues with " + pname + " type: " + type, dinfo);
        if (!dinfo["field-info"] || !dinfo["field-info"][pname]) {
            return [];
        }

        const finfo = dinfo["field-info"][pname];
        //        this.logDebug("field-info " + pname, finfo);
        if (finfo.allowed == "fixed") {
            if (!finfo.values || !finfo.values["_ALL"]) {
                this.logError("ERROR getting field info for " + pname, dinfo);
                return [];
            }
            return finfo.values["_ALL"];
        } else if (finfo.allowed == "history-type") {
            if (!type) {
                this.logError("ERROR with finfo.allowed of " + finfo.allowed, finfo);
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
            if (finfo.allowed !== "NA") {
                this.logError("ERROR - unknown allowed property: " + finfo.allowed, finfo);
            }
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

    // Default param delimiter is ; but can be changed in data.json 
    private splitParams (pline: string): string[] {

        if (this.settings.split_param) {
            return pline.split(this.settings.split_param);
        } else {
            pline.split(";")
        }
    }

    // Typically splitting A parameter with either COMMA or DASH
    private splitParam (multi: string, param: string): string[] | string {

        if (!param) {
            return [""];
        }

        if (!multi) {
            this.logError("SPLITTING param that is not multi-valued!", param);
            return [param];
        }

        multi = multi.trim();
        if (multi == "COMMA" || multi == ",") {
            multi = ",";
        } else if (multi == "DASH" || multi == "-") {
            multi = "-";
        } else if (multi == "NA") {
            return [param];
        } else {
            this.logError("SPLITTING param NOT recognized value for multi " + multi, param);
            return [param];
        }

        return param.split(multi);
    }
}



