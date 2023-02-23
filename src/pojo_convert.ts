import { Vault, TFile } from "obsidian";
import { intoCompletrPath } from "./settings";
import { logError, logDebug } from "./pojo_helper"
import { parse } from "@textlint/markdown-to-ast";
import { path } from "path";

const imageactions = {
    convert: [],
    copy: []
};
const logs = {
    debug: {},
    tracking: {},
    newstuff: {},
    errors: []
}
// Default section
const defcatch = "Daily Info";

export class PojoConvert {

    private settings: object;
    private vault: Vault;
    private defsec: string;
    private currentdb: string;
    private currentidx = 0;
    private currentfile: TFile;
    private pojo: object;
    private memoizeTracking = {};

    constructor(settings: object, pojo: object, vault: Vault) {
        this.settings = settings;
        this.pojo = pojo
        this.vault = vault;
        this.defsec = this.settings.daily_entry_h3[0];
        this.currentdb = this.settings.daily_entry_h3[0];
    }

    async convertDailyNote (noteFile: Tfile): Promise<boolean> {

        console.log("Converting Daily Note ", noteFile);

        // Start import of list of markdown files
        const exportContent = {
            diary: {},
            notes: []
        };
        try {
            await this.markdownImportFile(exportContent, noteFile);
        } catch (err) {
            logError("ERROR on markdownImport!", err);
        }
        console.log("FINISHED import of markdown file", exportContent);
        logDebug("exported", "FOUND FOR EXPORT", exportContent);

        const nrecords = Object.keys(exportContent.diary).length;
        console.log("BEGIN export of " + nrecords + " content entries to obsidian vault");
        try {
            this.markdownExport(exportContent);
        } catch (err) {
            console.error("ERROR caught on markdownexport", err);
            exitNow();
        }
        console.log("FINISHED export of content to obsidian vault");


        // Copy (and convert if HEIC) with any referenced images
        if (!this.settings.donotcopyattachments) {
            console.log("BEGIN copy of " + imageactions.copy.length + " and convert of " + imageactions.convert.length + " images to obsidian vault");
            const attdir = path.join(this.settings.export_folder, this.settings.attachments);
            fs.ensureDirSync(attdir);

            nCount = 0;
            for (const img of imageactions.copy) {
                try {
                    fs.copySync(img.source, img.target);
                    nCount++;
                    process.stdout.write(nCount + ",");
                } catch (err) {
                    console.error("SOURCE " + img.source);
                    console.error("ERROR during copy of image", err);
                    exitNow();
                }
            }
            console.log("----------------------------->");
            for (const imgc of imageactions.convert) {
                try {
                    const inputBuffer = fs.readFileSync(imgc.source);
                    const outputBuffer = await convert({
                        buffer: inputBuffer,
                        format: 'JPEG',
                        quality: 0.9
                    });
                    fs.outputFileSync(imgc.target, outputBuffer);
                    nCount++;
                    process.stdout.write(nCount + ",");
                } catch (err) {
                    console.error("SOURCE " + imgc.source);
                    console.error("ERROR during convert of image", err);
                    exitNow();
                }
            }
            console.log("FINISHED copy of images to obsidian vault");
        } else {
            console.log("NOTE - attachments not copied due to setting donotcopyattachments being true.")
        }

        console.log("EXITING NOW!!!");
    }

    async convertNow (): Promise<boolean> {

        // Read previous import tracking info
        console.log("Read in tracking file");
        this.readTrackingInfo();

        // Get the list of markdown files in the import directory and start processing.
        if (!this.settings.import_folder) {
            logError("MISSING import folder in this.settings file.")
            return false;
        }
        const importFiles = this.getInputFiles(this.settings.import_folder);
        logDebug("debug", "Number of files to import: " + importFiles.length);

        // Start import of list of markdown files
        console.log("BEGIN import of " + importFiles.length + " markdown files");
        let exportContent;
        try {
            exportContent = this.markdownImportFiles(importFiles);
        } catch (err) {
            logError("ERROR on markdownImport!", err);
        }
        console.log("FINISHED import of " + importFiles.length + " markdown files");

        // Output tracking files
        try {
            this.writeTrackingFiles();
        } catch (err) {
            const errmsg = "ERROR writing out tracking files.";
            console.error(errmsg, err);
        }

        logDebug("exported", "FOUND FOR EXPORT", exportContent);

        const nrecords = Object.keys(exportContent.diary).length;
        console.log("BEGIN export of " + nrecords + " content entries to obsidian vault");
        try {
            this.markdownExport(exportContent);
        } catch (err) {
            console.error("ERROR caught on markdownexport", err);
            exitNow();
        }
        console.log("FINISHED export of content to obsidian vault");

        console.log("CREATE MOC Files based on tracking.json contents");
        try {
            this.createMOCFiles(true);
        } catch (err) {
            console.error("Error creating MOC Files!", err);
        }
        console.log("FINISHED creating MOC files.");


        // Copy (and convert if HEIC) with any referenced images
        if (!this.settings.donotcopyattachments) {
            console.log("BEGIN copy of " + imageactions.copy.length + " and convert of " + imageactions.convert.length + " images to obsidian vault");
            const attdir = path.join(this.settings.export_folder, this.settings.attachments);
            fs.ensureDirSync(attdir);

            nCount = 0;
            for (const img of imageactions.copy) {
                try {
                    fs.copySync(img.source, img.target);
                    nCount++;
                    process.stdout.write(nCount + ",");
                } catch (err) {
                    console.error("SOURCE " + img.source);
                    console.error("ERROR during copy of image", err);
                    exitNow();
                }
            }
            console.log("----------------------------->");
            for (const imgc of imageactions.convert) {
                try {
                    const inputBuffer = fs.readFileSync(imgc.source);
                    const outputBuffer = await convert({
                        buffer: inputBuffer,
                        format: 'JPEG',
                        quality: 0.9
                    });
                    fs.outputFileSync(imgc.target, outputBuffer);
                    nCount++;
                    process.stdout.write(nCount + ",");
                } catch (err) {
                    console.error("SOURCE " + imgc.source);
                    console.error("ERROR during convert of image", err);
                    exitNow();
                }
            }
            console.log("FINISHED copy of images to obsidian vault");
        } else {
            console.log("NOTE - attachments not copied due to setting donotcopyattachments being true.")
        }

        console.log("EXITING NOW!!!");

        exitNow(true);
    }

    async readTrackingFile () {

        const trackfile = path.join(trackingFolder, "tracking.json");
        let tracking: object;
        const path = intoCompletrPath(this.vault, POJO_TRACKING_FILE);
        if (!(await this.vault.adapter.exists(path))) {
            tracking = {};
        } else {
            try {
                tracking = await loadFromFile(this.vault, path);
            } catch (e) {
                console.error("ERROR loading Pojo History", e);
                return;
            }
        }
        this.logs.tracking = tracking;
    }

    private getInputFiles (folder): TFile[] {

        const inputfiles = [];
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            if (file.path.startsWith(folder)) {
                inputfiles.push(file);
            }
        }
        return inputfiles;
    }

    private async markdownImportFile (exported: object, mdfile: TFile) {

        const mdcontent = await mdfile.vault.cachedRead(mdfile);
        this.currentfile = mdfile;
        this.currentdb = this.defsec;
        this.currentidx = 0;

        const parsedContent = this.parseMarkdown(mdcontent);
        console.log("HERE is parsedContent", parsedContent);
        if (!parsedContent) {
            logDebug("notjournal", "ASSUMING NOT JOURNAL: ", mdfile);
        } else if (!parsedContent[this.defsec] || !parsedContent[this.defsec][0].Date) {
            logDebug("other", "Assumed this file is a note or quote - NO VALID DATE FOUND!", mdfile)
            logDebug("other", "CONTENT ", parsedContent);
            let note = parsedContent;
            if (parsedContent[this.defsec]) {
                if (parsedContent[this.defsec][0].Description) {
                    note = parsedContent[this.defsec][0].Description
                }
            }
            exported.notes.push(note);
        } else {
            logDebug("parsedfinal", mdfile, parsedContent);
            const diarydate = parsedContent[this.defsec][0].Date;
            exported.diary[diarydate] = parsedContent;
        }
        this.currentfile = null;
    }

    private async markdownImportFiles (mdfiles: TFile[]) {

        const exported = {
            diary: {},
            notes: []
        };
        for (const file of mdfiles) {
            this.markdownImportFile(exported, file);
        }
        return exported;
    }

    // Parse markdown into Abstract Symbolic Tree (AST)
    private parseMarkdown (mdcontent) {
        const ast = parse(mdcontent);

        logDebug("astTree", "AST Tree", ast);

        // Parse tree. First element is the document!
        if (!ast || ast.type !== "Document") {
            logError("ERROR getting ast tree", ast);
            return;
        }

        const parsed = {};

        logDebug("debug", ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        for (const child of ast.children) {
            const rval = this.parseAST(child);
            if (!rval) {
                // ERROR
                return null;
            }
            logDebug("debug", rval.key, rval.values);
            if (!this.parseItem(parsed, rval.key, rval.values)) {
                // ERROR
                return null;
            }
        }

        return parsed;
    }

    private parseAST (el: object): object {

        let key, values;
        switch (el.type) {
            //            case 'Yaml': 
            //                break;
            case 'Header':
                key = "H" + el.depth;
                if (el.children && el.children.length == 1 && el.children[0].type == "Str") {
                    const v = el.children[0].value;
                    values = v.split("\n");
                } else {
                    logError("Unexpected Header type", el);
                    return null;
                }
                break;
            case 'HorizontalRule':
                key = "P";
                values = ["___"];
                break;
            case 'Paragraph':
            case 'CodeBlock':
                key = "P";
                if (!el.children) {
                    values = el.value.split("\n");
                    if (el.type == 'CodeBlock') { key = "CodeBlock"; }
                }
                else if (el.children[0].type == "Image") {
                    key = "Image";
                    values = [];
                    let iobj = null;
                    for (const c of el.children) {
                        if (c.type == "Image") {
                            if (iobj) {
                                values.push(iobj);
                            }
                            iobj = {};
                            iobj.imageurl = decodeURI(c.url);
                            const pimage = path.parse(iobj.imageurl);
                            iobj.imageext = pimage.ext;
                            iobj.source = path.join(this.settings.import_folder, iobj.imageurl);
                            iobj.imagename = pimage.base;
                            if (pimage.ext == ".HEIC") {
                                // Need to convert to jpg.
                                iobj.imagename = pimage.name + ".jpg";
                            }
                            iobj.target = path.join(this.settings.export_folder, this.settings.attachments, iobj.imagename);
                        } else {
                            if (iobj && c.value && c.value !== "\n") {
                                iobj.caption = c.value;
                            }
                        }
                    }
                    if (iobj) {
                        values.push(iobj);
                    }
                } else {
                    values = [];
                    for (const c of el.children) {
                        const v = c.raw;
                        const va = v.split("\n");
                        values = [...values, ...va];
                    }
                }
                break;
            case 'List':
                key = "UL";
                values = [];
                if (el.children) {
                    for (const c of el.children) {
                        if (c.type == "ListItem") {
                            const v = c.raw;
                            const va = v.split("\n");
                            values = [...values, ...va];
                        } else {
                            logError("Unexpected List Child type", c);
                            return null;
                        }
                    }
                } else {
                    logError("Unexpected List type", el);
                    return null;
                }
                break;
            default:
                logError("Unrecognized ast element type " + el.type, el);
                return null;
        }

        return { key, values }
    }

    private checkMultiValued (db: string, key: string): boolean {

        console.log("HERE IS check multi values", db, key);
        if (db == this.defsec) {
            return false;
        }

        const dbinfo = this.pojo.getDatabaseInfo(db);
        if (dbinfo && dbinfo["field-info"] && dbinfo["field-info"][key]) {
            const finfo = dbinfo["field-info"][key];
            if (finfo.multi) {
                return true;
            }
        }
        return false;
    }

    private parseLine (parsed: object, key: string, line: string): boolean {

        const self = this;
        console.log("parseLine " + key, line, parsed);

        const _addParsed = function (info) {
            console.log("_addParsed", info);
            const dbref = info._database;
            if (!parsed[dbref]) { parsed[dbref] = []; }
            if (dbref == self.defsec) {
                // Daily Entry
                if (!parsed[dbref][0]) { parsed[dbref].push(info); }
                else {
                    Object.assign(parsed[dbref][0], info);
                }
            } else {
                parsed[dbref].push(info);
            }
            const last = parsed[dbref].length - 1;
            delete parsed[dbref][last].database;
            delete parsed[dbref][last].canonical;

            for (const kyp in parsed[dbref][last]) {
                console.log("parsed times " + kyp, last, parsed[dbref]);
                const kval = parsed[dbref][last][kyp];
                if (self.checkMultiValued(dbref, kyp)) {
                    //                    console.log("Here is kval!", kval);
                    if (!Array.isArray(kval)) {
                        const aval = kval.split(",");
                        for (let i = 0; i < aval.length; i++) {
                            const nobj = {};
                            nobj[kyp] = aval[i];
                            self.trackingInfo(parsed, dbref, nobj);
                        }
                    }
                } else {
                    const nobj2 = {};
                    nobj2[kyp] = kval;
                    self.trackingInfo(parsed, dbref, nobj2);
                }
            }
        }

        if (key == "H1") {
            // Check if this is a date!
            if (!parsed[this.defsec]) { parsed[this.defsec] = []; }
            if (!parsed[this.defsec][0]) { parsed[this.defsec].push({}); }
            const date = new Date(line);
            console.log("CONVERT " + line + " to date:", date)
            if (!date || (date instanceof Date && isNaN(date.valueOf()))) {
                // See if it is an ISO Date
                parsed[this.defsec][0].ISOdave = line;
                parsed[this.defsec][0].Date = this.convertISODave(line);
            } else {
                parsed[this.defsec][0].Date = line;
            }
            if (!parsed[this.defsec][0].Date) {
                // Error
                console.log("POSSIBLY NOT A DATE " + line)
                return false;
            } else {
                console.log("HERE BE THE DATE " + parsed[this.defsec][0].Date);
            }
        } else if (key == "H2") {
            // Title on Daily Entry
            if (!parsed[this.defsec]) { parsed[this.defsec] = []; }
            if (!parsed[this.defsec][0]) { parsed[this.defsec].push({}); }
            parsed[this.defsec][0]._Title = line;
            if (!parsed[this.defsec][0].Date) {
                parsed[this.defsec][0].Date = this.getDateFromFile();
            }
        } else if (key == "Image") {
            // Image, possibly with caption. Use the Obsidian plugin for image captions.
            if (line && line.imageurl) {
                let decurl;
                try {
                    decurl = decodeURI(line.imageurl);
                } catch (err) {
                    console.error("ERROR decoding image uri ", err);
                    logError("ERROR decoding image url ", err);
                    exitNow();
                }
                line.imageurl = decurl;
                logDebug("images", line.imageurl);

                if (!parsed[this.defsec]) { parsed[this.defsec] = []; }
                if (!parsed[this.defsec][0]) { parsed[this.defsec][0] = {}; }
                if (!parsed[this.defsec][0]._images) { parsed[this.defsec][0]._images = []; }
                parsed[this.defsec][0]._images.push(line);
            } else {
                logError("Unexpected Image type", line);
                return false;
            }
        } else if (key == "UL") {
            // Unordered List.
            if (!parsed[this.currentdb]) { parsed[this.currentdb] = []; }
            if (!parsed[this.currentdb][this.currentidx]) { parsed[this.currentdb][this.currentidx] = {}; }
            if (!parsed[this.currentdb][this.currentidx].Description) { parsed[this.currentdb][this.currentidx].Description = []; }
            parsed[this.currentdb][this.currentidx].Description.push("* " + line);
        } else if (key == "H3" || line.charAt(0) == '#') {

            if (!parsed[this.defsec][0].Date) {
                parsed[this.defsec][0].Date = this.getDateFromFile();
            }

            let pline = line;
            if (line.charAt(0) == '#') {
                pline = line.slice(1);
            }
            const pinfo = this.pojo.parsePojoLine(pline);
            if (!pinfo) {
                // ERROR
                return false;
            }
            console.log("HERE is pinfo from " + pline, pinfo);
            const db = pinfo._database;
            _addParsed(pinfo);
            console.log("HERE is parsed and db " + db, parsed);
            logDebug("parse1", "TAG PARSE with length " + parsed[db].length, pinfo);
            //        if (key == "H3") {
            this.currentdb = db;
            if (db == this.defsec) {
                // Only one entry per day for Daily Entry
                this.currentidx = 0;
            } else {
                this.currentidx = parsed[db].length - 1;
            }
            //            lastdb = null;
            //            lastidx = 0;
            //        } else {
            // This is setup in case we have a codeblock following a tag OR just text. This is another way 
            // of adding multiline descriptions.
            //            lastdb = db;
            //            lastidx = parsed[db].length-1;
            //        }
        } else {
            // Text 
            logDebug("parse1", "HERE is line for key " + key, line);
            if (!parsed[this.currentdb]) { parsed[this.currentdb] = []; }
            if (!parsed[this.currentdb][this.currentidx]) { parsed[this.currentdb][this.currentidx] = {}; }

            const ainfo = this.pojo.parseForAnnotations(line);
            if (ainfo) {
                logDebug("parse1", "MUST add this annotation ", ainfo);
                this.trackingInfo(parsed, this.currentdb, ainfo);

                for (const k in ainfo) {
                    parsed[this.currentdb][this.currentidx][k] = ainfo[k];
                }

            } else {
                //            console.log("HERE IS key " + key, lastdb, currentfile);
                //            console.log(parsed[lastdb]);
                // CodeBlock is normally used as an alternative way to add Description content to a section. 
                //            if (key == "CodeBlock" && lastdb && parsed[lastdb]) {
                //                if (!parsed[lastdb][lastidx].Description) { parsed[lastdb][lastidx].Description = []; }
                //                parsed[lastdb][lastidx].Description.push(line);
                //            } else {
                if (!parsed[this.currentdb][this.currentidx].Description) { parsed[this.currentdb][this.currentidx].Description = []; }
                parsed[this.currentdb][this.currentidx].Description.push(line);
                //            }
            }
        }

        return true;
    }

    private parseItem (parsed: object, key: string, values: string[]): boolean {

        for (const line of values) {
            if (!this.parseLine(parsed, key, line)) {
                return false;
            }
        }
        return true;
    }

    private createMOCFiles (bOverwrite: boolean) {

        const _getMOCcontent = function (moctype: string): object {
            const moctemplate = path.join(process.env.POJO_FOLDER, "this.settings", "templates", moctype + ".md");
            let mdcontent;
            try {
                mdcontent = fs.readFileSync(moctemplate, 'utf8');
            } catch (err) {
                const errmsg = "ERROR getting MOC template file for " + moctype;
                console.error(errmsg);
                logError(errmsg, err);
                exitNow();
            }
            return mdcontent;
        }

        const MOCtemplate = {
            database: _getMOCcontent("database"),
            param: _getMOCcontent("param"),
            value: _getMOCcontent("value")
        }

        const _getMOCfrontmatter = function (moctype: string, dbname: string, param: string, value: string): string[] {

            const dbinfo = this.pojo.getDatabaseInfo(dbname);

            const fm = [];
            fm.push("---");
            if (this.settings.frontmatter_always_add_moc) {
                for (const line of this.settings.frontmatter_always_add_moc) {
                    fm.push(line);
                }
            }
            fm.push(`database: ${dbname}`);
            fm.push(`Category: MOC-${moctype}`);
            if (moctype == 'database') {
                fm.push(`viewparams: []`);
            } else if (moctype == 'param') {
                fm.push(`viewparams: []`);
                fm.push(`filterkey: ${param}`);
            } else if (moctype == 'value') {
                const vps = [];
                for (const vp of dbinfo.params) {
                    if (!this.settings.tracking_params_exclude.includes(vp)) {
                        vps.push(vp);
                    }
                }
                const vpval = vps.join(",");
                fm.push(`viewparams: [${vpval}]`);
                fm.push(`filterkey: ${param}`);
                fm.push(`filtervalue: ${value}`);
            } else {
                const emsg = "Unknown MOC Type " + moctype;
                logError(emsg);
                console.error(emsg);
                exitNow();
            }

            fm.push("---");
            return fm;
        }


        const _createMOC = function (fname: string, moctype: string, dbname: string, param: string, value: string) {

            let mocname;
            if (moctype == "value") {
                // Only create MOC for values that appear more than once.
                const a = fname.split("=");
                const count = parseInt(a[1], 10);
                if (count <= 1) {
                    return;
                }
                mocname = a[0];
                value = a[0];
            } else {
                mocname = fname;
            }
            const moc = path.join(this.settings.export_folder, this.settings.moc_folder, mocname + ".md");

            if (bOverwrite || !fs.existsSync(moc)) {
                // Only create if an existing file does not exist!
                const mfm = _getMOCfrontmatter(moctype, dbname, param, value);
                const md = mfm.join("\n") + "\n" + MOCtemplate[moctype];
                fs.outputFileSync(moc, md);
            }
        };


        for (const dbname in logs.tracking) {
            const dbe = logs.tracking[dbname];
            // Create a database MOC
            _createMOC(dbname, "database", dbname);

            //        console.log("DBE for " + dbname, dbe);
            for (const param in dbe) {
                const pvs = dbe[param];
                _createMOC(param, "param", dbname, param)
                for (const pv of pvs) {
                    _createMOC(pv, "value", dbname, param, pv)
                }
            }
        }
    }

    private writeTrackingFiles () {

        // Update tracking.json with the latest new imports.
        for (const db in logs.newstuff) {
            if (!logs.tracking[db]) { logs.tracking[db] = {}; }
            for (const p in logs.newstuff[db]) {
                if (!logs.tracking[db][p]) { logs.tracking[db][p] = []; }
                for (const pval of logs.newstuff[db][p]) {
                    logs.tracking[db][p].push(pval);
                }
            }
        }

        const trackfile = path.join(trackingFolder, "tracking.json");
        try {
            fs.outputFileSync(trackfile, JSON.stringify(logs.tracking, null, 3));

            const cdate = new Date();
            const lasttrack = path.join(trackingFolder, "lasttrack " + cdate.toDateString() + ".json");
            fs.outputFileSync(lasttrack, JSON.stringify(logs.newstuff, null, 3));
        } catch (err) {
            console.warn(`Error writing trackfile ` + trackfile, err);
            process.exit(1);
        }
    }

    private markdownExport (exportContent) {

        console.log("markdownExport begin", exportContent);

        const newrecords: object[] = [];
        let nDiary = 0;
        for (const dt in exportContent.diary) {
            const md = this.markdownDiary(exportContent.diary[dt], newrecords);
            const mdcontent = md.join("\n");
            const mdfile = this.getDiaryFile(dt);
            this.vault.create("archived daily notes/" + dt + ".md", mdcontent);
            console.log("HERE IS the markdown content for " + mdfile, mdcontent);

            //            fs.outputFileSync(mdfile, mdcontent);
            nDiary++;
            //        console.log(`${nDiary}: ${mdfile}`);
        }

        // Create markdown files for metadata records
        this.writeOutMetadataRecords(newrecords);
    }

    private addFrontMatterForDatabase (frontmatter: string[], db: string, dbentry: object[], dbinfo: object) {

        const _checkKey = function (key: string): boolean {
            // Excluded params
            if (this.settings.frontmatter_params_exclude) {
                for (const fme of this.settings.frontmatter_params_exclude) {
                    const a = fme.split(":");
                    if (a[0] == db && a[1] == key) {
                        return false;
                    }
                }
            }
            // Included params
            if (this.settings.frontmatter_params_include) {
                for (const fme of this.settings.frontmatter_params_include) {
                    const a = fme.split(":");
                    if (a[0] == db) {
                        // Can exclude entire database by just excluding the colon
                        if (a.length == 1 || a[1] == key) {
                            return true;
                        }
                    }
                }
                // Otherwise the type field or the first parameter are always included.
                if (dbinfo.type == key || dbinfo.params[0] == key) {
                    return true;
                }

                return false;
            }

            const vals = [];
            const _addValue = function (v) {
                if (!vals.includes(v)) {
                    vals.push(v);
                }
            }

            for (const item of dbentry) {
                for (const p in item) {
                    if (_checkKey(p)) {
                        // Check if multi valued.
                        console.log("Check multi value for database " + db, p, item[p]);
                        if (this.checkMultiValued(db, p)) {
                            const av = item[p].split(",");
                            for (const a of av) {
                                _addValue(a);
                            }
                        } else {
                            _addValue(item[p]);
                        }
                    }
                }
            }

            if (vals.length > 0) {
                frontmatter.push(db + ": [" + vals.join(",") + "]");
            }
        }
    }

    private addFootLinks (footlinks: string[], db: string, dbentry: object[], dbinfo: object): number {

        const _addFootLink = function (newlink) {
            if (!footlinks.includes(newlink)) {
                footlinks.push(newlink);
            }
        }

        const nentry = footlinks.length;

        if (!this.settings.links_params_exclude.includes(db)) {
            _addFootLink(db);
        }

        for (const item of dbentry) {
            for (const p in item) {
                const value = item[p];
                if (p.charAt(0) !== '_' && !this.settings.links_params_exclude.includes(p)) {
                    let bKeyItems = false;
                    if (p == dbinfo.type || p == dbinfo.params[0]) {
                        bKeyItems = true;
                    }
                    //                console.log(`Key: ${p} Value: ${value} ` + bKeyItems);
                    if (bKeyItems || this.settings.params_multi.includes(p)) {
                        if (!bKeyItems) {
                            _addFootLink(p);
                        }
                        const mp = value.split(",");
                        for (const mpp of mp) {
                            const mm = mpp.trim();
                            _addFootLink(mm);
                        }
                    } else {
                        _addFootLink(p);
                        _addFootLink(value);
                    }
                }
            }
        }

        return footlinks.length - nentry;
    }

    private addMarkdownSection (sections: object, date: string, db: string, dbentry: object[], dbinfo: object) {

        let catchall = true;
        for (const entry of dbentry) {
            if (entry.Description) {
                catchall = false;
            }
        }
        if (this.settings.sections_verbose) {
            catchall = false;
        }

        /** 
         * Create a section for all entries of a database IF one or more of those entries has a description OR always
         * if sections_verbose is true.
         * Otherwise, put all entries of all databases with NO descriptions into a catch-all section.
         **/
        let section;
        if (catchall) {
            // No Description field for any of these entries for this database.
            if (!sections[defcatch]) {
                sections[defcatch] = {
                    database: defcatch,
                    content: [],
                    callout: "Info"
                };
            }
            section = sections[defcatch];
        } else {
            if (!sections[db]) {
                sections[db] = {
                    database: db,
                    content: [],
                    callout: db.toLowerCase()
                };
            }
            section = sections[db];
        }

        for (const entry of dbentry) {
            let typeparam = "";
            let firstparam = "";
            if (entry[dbinfo.type]) { typeparam = ` ${entry[dbinfo.type]}`; }
            if (entry[dbinfo.params[0]]) {
                firstparam = `${entry[dbinfo.params[0]]}`;
            }

            const newitem = {
                typeparam: typeparam,
                firstparam: firstparam
            };
            for (const p in entry) {
                if (p !== dbinfo.type && p !== dbinfo.params[0] && !this.settings.sections_params_exclude.includes(p)) {
                    newitem[p] = entry[p];
                }
            }

            section.content.push(newitem);
        }
    }

    private createNewRecords (newrecords: object[], date: string, db: string, dbentry: object[], dbinfo: object): number {

        const typeparam = dbinfo.type;

        // Note that these records will be files in the folder defined by the this.settings parameter 'metadata_folder'
        let nentry = 1;
        for (const item of dbentry) {
            const newrecord = {
                Database: db,
                Date: date,
                Nentry: nentry
            }
            if (db !== this.defsec && !item[typeparam]) {
                logError("ERROR - no type defined for dbEntry ( " + typeparam + " )", dbentry);
                break;
            }
            Object.assign(newrecord, item);
            nentry++;
            newrecords.push(newrecord);
        }

        return nentry;
    }

    private createMarkdownDiary (date: string, frontmatter: string[], dailyentry: object, sections: object, footlinks: string[]): string[] {

        const md = [];

        // Frontmatter
        md.push("---");
        for (const fm of frontmatter) {
            md.push(fm);
        }
        md.push("---");
        md.push(" ");

        // Daily Entry
        if (dailyentry.Heading) {
            md.push("# " + dailyentry.Heading);
            md.push("");
        }

        let bAddRule = false;
        if (dailyentry.Description) {
            bAddRule = true;
            for (const desc of dailyentry.Description) {
                md.push(desc);
                md.push("");
            }
        }

        // Add images reference to entries
        if (dailyentry._images && !this.settings.donotcopyattachments) {
            bAddRule = true;
            for (const image of dailyentry._images) {
                if (image.caption) {
                    md.push(`![[${image.imagename}|${image.caption}]]`);
                } else {
                    md.push(`![[${image.imagename}]]`);
                }
                const aobj = { source: image.source, target: image.target };
                if (image.imageext == ".HEIC") {
                    imageactions.convert.push(aobj);
                } else {
                    imageactions.copy.push(aobj);
                }
            }
            md.push("");
        }

        if (bAddRule) {
            md.push("-----------------------------------");
        }

        // Sections (using callouts!)
        try {
            for (const header in sections) {
                const section = sections[header];
                const callout = section.callout;
                const title = section.database;
                const content = section.content;
                const dbinfo = this.pojo.getDatabaseInfo(section.database);

                md.push(`> [!${callout}]+ [[${title}]]`);
                for (const item of content) {
                    if (item.typeparam) {
                        let hline = `> `;
                        hline += `**[[${item.typeparam}]]**`;
                        if (item.firstparam) {
                            if (!this.settings.links_params_exclude.includes(dbinfo.params[0])) {
                                hline += `: **[[${item.firstparam}]]**`;
                            } else {
                                hline += `: **${item.firstparam}**`;
                            }
                        }
                        md.push(hline);
                    }
                    for (const key in item) {
                        if (key == "Description") {
                            for (const line of item.Description) {
                                md.push(`> ${line}`);
                                md.push("> ");
                            }
                        } else if (key !== "typeparam" && key !== "firstparam") {
                            // mulivalue
                            if (item[key] && this.checkMultiValued(title, key)) {
                                const aval = item[key].split(",");
                                let newline = `> [[${key}]]:`;
                                for (const av of aval) {
                                    newline += ` [[${av}]]`;
                                }
                                md.push(newline);
                            } else {
                                md.push(`> [[${key}]]: [[${item[key]}]]`);
                            }
                        }
                    }
                }
                md.push("");
            }
        } catch (err) {
            const errmsg = "ERROR output of sections";
            console.error(errmsg, err);
            logError(errmsg, err);
            exitNow();
        }

        md.push("");

        // Foot Links (using Callout)
        const fcallout = 'TIP';
        const ftitle = 'Links';
        const maxlink = 6;
        if (footlinks.length > 0) {
            md.push(`> [!${fcallout}]+ ${ftitle}`);
            let n = 0;
            let cl = `> `;
            for (const link of footlinks) {
                if (n >= maxlink - 1) {
                    n = 0;
                    cl += ` - [[${link}]]`;
                    md.push(cl);
                    cl = `> `;
                } else {
                    if (n > 0) { cl += ` - `; }
                    cl += `[[${link}]]`;
                    n++;
                }
            }
            md.push(cl);
        }

        return md;
    }

    private addFrontMatterForEntry (frontmatter: string[], dbentry: object[]) {

        // Add always add to frontmatter from this.settings
        if (this.settings.frontmatter_always_add) {
            for (const fma of this.settings.frontmatter_always_add) {
                frontmatter.push(fma);
            }
        }

        // Add items from this.settings for add_to_frontmatter
        if (this.settings.frontmatter_add) {
            for (const fma of this.settings.frontmatter_add) {
                const af = fma.split(":");
                // Three parameters -> Source Database/param;Field Type;Target Field
                const sr = af[0].split("/");
                if (dbentry[sr[0]]) {
                    // NOTE we only do this for ONE entry of this database type.
                    const dbe = dbentry[sr[0]][0];
                    console.log("DATABASE ENTRY", dbe);
                    const source = dbe[sr[1]];
                    const action = af[1];
                    if (action == 'Date') {
                        const newDate = new Date(source);
                        const obsidianDate = newDate.toISOString().split('T')[0];
                        frontmatter.push([af[2]] + ": " + obsidianDate);
                    } else if (action == 'String') {
                        frontmatter.push([af[2]] + ": " + source);
                    } else if (action == 'DatePlus') {
                        // Going to create a whole set of Frontmatter fields based on dateplus_to_frontmatter
                        let newDate = new Date(source);
                        if (!(newDate instanceof Date) || isNaN(newDate.valueOf())) {
                            // Didn't work. Try removing the end.
                            const ad = source.split(" ");
                            newDate = new Date(ad[0] + " 12:00");
                        }
                        console.log("HERE IS newDate from " + source, newDate);
                        const obsidianDate = newDate.toISOString().split('T')[0];
                        frontmatter.push([af[2]] + ": " + obsidianDate);
                        if (this.settings.frontmatter_dateplus) {
                            for (const dp of this.settings.frontmatter_dateplus) {
                                switch (dp) {
                                    case 'Season':
                                        const mss = newDate.getMonth() + 1;
                                        let season = "";
                                        switch (mss + '') {
                                            case '1':
                                            case '2':
                                                season = "Deep Winter";
                                                break;
                                            case '3':
                                            case '4':
                                                season = "Early Spring";
                                                break;
                                            case '5':
                                            case '6':
                                                season = "Late Spring";
                                                break;
                                            case '7':
                                            case '8':
                                                season = "Summer";
                                                break;
                                            case '9':
                                            case '10':
                                                season = "Fall";
                                                break;
                                            case '11':
                                            case '12':
                                                season = "Early Winter";
                                                break;
                                        }
                                        frontmatter.push(dp + ": " + season);
                                        break;
                                    case 'Quarter':
                                        const q = Math.floor((newDate.getMonth() / 3) + 1);
                                        frontmatter.push(dp + ": Q" + q);
                                        break;
                                    case 'Month':
                                        const ms = newDate.toLocaleDateString("en-US", {
                                            month: "short"
                                        })
                                        frontmatter.push(dp + ": " + ms);
                                        break;
                                    case 'YY-MM':
                                        const yr = newDate.toLocaleDateString("en-US", {
                                            year: "2-digit"
                                        })
                                        const mn = newDate.toLocaleDateString("en-US", {
                                            month: "2-digit"
                                        })
                                        frontmatter.push(dp + ": " + yr + "-" + mn);
                                        break;
                                    case 'YY-WK':
                                        const yr2 = newDate.toLocaleDateString("en-US", {
                                            year: "2-digit"
                                        })
                                        const onejan = new Date(newDate.getFullYear(), 0, 1);
                                        const week = Math.ceil((((newDate.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
                                        let wk = "" + week;
                                        if (week < 10) { wk = "0" + wk; }
                                        frontmatter.push(dp + ": " + yr2 + "-" + wk);
                                        break;
                                    case 'Day of Week':
                                        const wd = newDate.toLocaleDateString("en-US", {
                                            weekday: "short"
                                        })
                                        frontmatter.push(dp + ": " + wd);
                                        break;
                                    default:
                                        logError("ERROR in dateplus_to_frontmatter. Not recognized option", dp);
                                }
                            }
                        }
                    } else {
                        logError("Unsupported add_to_frontmatter action: " + action, fma);
                        process.exit(-1);
                    }
                }
            }
        }

        // Add reference to all used databases
        const dbs = [];
        for (const db in dbentry) {
            if (db !== this.defsec) {
                dbs.push(db);
            }
        }
        if (dbs.length > 0) {
            frontmatter.push("Databases: [" + dbs.join(",") + "]");
        }
    }

    private markdownDiary (diaryEntry: object, newrecords: object[]): string[] {

        // Export Diary Entry
        // NOTE that for database metadata, we need to do four things:
        // 1) Determine what frontmatter metadata to add (fm - key/value pairs) type:firstparam
        // 2) Determine what LINKS will be added to the bottom of the entry. (footlinks)
        // 3) Determine what metadata should be added directly to the body of the entry. (sections)
        // 4) Determine information for record associated with database. (newrecords)

        const dailyentry = {};
        const frontmatter: string[] = [];
        const footlinks: string[] = [];
        const sections = {};

        const date = diaryEntry[this.defsec][0].Date;

        // Add frontmatter
        this.addFrontMatterForEntry(frontmatter, diaryEntry);

        for (const db in diaryEntry) {

            // Add daily entry
            if (db == this.defsec) {
                const entry = diaryEntry[db][0];
                for (const key in entry) {
                    if (key == "_Title") {
                        dailyentry.Heading = entry._Title;
                    } else {
                        dailyentry[key] = entry[key];
                    }
                }
            } else {
                const dbinfo = this.pojo.getDatabaseInfo(db)

                // Add frontmatter from database entries
                this.addFrontMatterForDatabase(frontmatter, db, diaryEntry[db], dbinfo);

                // Add sections for other database information 
                this.addMarkdownSection(sections, date, db, diaryEntry[db], dbinfo);

                // Add LINKS to be added to the bottom of the diary entry
                //        addFootLinks(footlinks, db, diaryEntry[db], dbinfo);

                // Create new records
                this.createNewRecords(newrecords, date, db, diaryEntry[db], dbinfo);
            }
        }

        //    console.log("EXPORTED STUFF for " + date);
        //    console.log("frontmatter: ", frontmatter);
        //    console.log("dailyentry: ", dailyentry);
        //    console.log("sections: ", sections);
        for (const s in sections) {
            logDebug("sectionsinfo", s, sections[s]);
        }
        //    console.log("footlinks: ", footlinks);
        //    console.log("newrecords: ", newrecords);
        //    console.log("=======================================================");

        if (this.settings.donotcreatefiles) {
            console.log("NOT creating actual files in Obsidian Vault due to 'donotcreatefiles' option!");
            return;
        }

        const md = this.createMarkdownDiary(date, frontmatter, dailyentry, sections, footlinks);

        return md;
    }

    private convertISODave (dddate: string): string {

        // ISO Dave 1.0: Xdmyr
        // ISO Dave 2.0: yrmmdX
        const _ISODave1 = function (ddate) {

            const dow = ddate[0];
            const len = ddate.length;

            const yr = "20" + ddate[len - 2] + ddate[len - 1];
            const mn = ddate[len - 3];
            let month;
            switch (mn) {
                case "j": month = "01"; break;
                case "f": month = "02"; break;
                case "m": month = "03"; break;
                case "a": month = "04"; break;
                case "y": month = "05"; break;
                case "u": month = "06"; break;
                case "l": month = "07"; break;
                case "g": month = "08"; break;
                case "s": month = "09"; break;
                case "o": month = "10"; break;
                case "n": month = "11"; break;
                case "d": month = "12"; break;
                default:
                    console.error("ERROR on month!!! ISODave1 " + mn + " ->" + ddate);
                    logError("ERROR on H1 as date " + mn, dddate);
                    return null;
            }
            const rem = ddate.substring(1, len - 3);
            const dom = parseInt(rem);
            if (isNaN(dom) || isNaN(yr)) {
                logError("ERROR getting date from " + dddate, dddate);
                return null;
            }

            let dayom = dom;
            if (dom <= 9) {
                dayom = "0" + dom;
            }

            //		console.log("Dave Date 1.0: " + ddate);
            //		console.log(yr + "/" + month + "/" + dayom);

            return yr + "-" + month + "-" + dayom;
        }

        const _ISODave2 = function (ddate) {
            const yr = "20" + ddate[0] + ddate[1];
            const mn = ddate[2] + ddate[3];
            let month;
            switch (mn) {
                case "ja": month = "01"; break;
                case "fe": month = "02"; break;
                case "mr": month = "03"; break;
                case "ap": month = "04"; break;
                case "my": month = "05"; break;
                case "jn": month = "06"; break;
                case "jl": month = "07"; break;
                case "au": month = "08"; break;
                case "se": month = "09"; break;
                case "oc": month = "10"; break;
                case "nv": month = "11"; break;
                case "de": month = "12"; break;
                default:
                    console.error("ERROR on month!!! ISODave2 " + mn + " ->" + ddate);
                    logError("ERROR on H1 as date " + mn, dddate);
                    return null;
            }
            const rem = ddate.slice(4);
            const dom = parseInt(rem);
            if (isNaN(dom) || isNaN(yr)) {
                logError("ERROR getting date from " + dddate, dddate);
                return null;
            }

            let dayom = dom;
            if (dom <= 9) {
                dayom = "0" + dom;
            }

            const dow = ddate.charAt(ddate.length - 1);

            //		console.log("Dave Date 2.0: " + ddate);
            //		console.log(yr + "/" + month + "/" + dayom);

            return yr + "-" + month + "-" + dayom;
        }

        if (isNaN(parseInt(dddate[0], 10))) {
            return _ISODave1(dddate);
        } else {
            return _ISODave2(dddate);
        }
    }

    private writeOutMetadataRecords (newrecords: object[]) {

        console.log("writeOutMetadataRecords here...", newrecords);
        let rcount;

        // console.log("newrecords", newrecords);
        const metadir = path.join(this.settings.export_folder, this.settings.metadata_folder);
        fs.ensureDirSync(metadir);

        const _createNewMetadataRecord = function (record: object, typename: string, pname: string, pvalue: string): void {

            const md = [];
            md.push("---");
            md.push("Database: " + record.Database);
            md.push("Date: " + record.Date);
            md.push(`${typename}: ${record[typename]}`);
            if (pname) {
                md.push(`${pname}: ${pvalue}`);
            }
            md.push("---");
            if (record.Description) {
                md.push("");
                for (const line of record.Description) {
                    md.push(line);
                    md.push("");
                }
                md.push("");
            }

            const filename = record.Database + "-" + record.Date + "-" + record.Nentry + rcount + ".md";
            const target = path.join(metadir, filename);

            //      if (fs.existsSync(target)) {
            //         logError("Metadata record already exists", target);
            //      }

            fs.outputFileSync(target, md.join("\n"));
            rcount++;
        };

        const _createNewMetadataRecords = function (record: object, typename: string, pname: string, pvalues: string): void {
            //        console.log(typename + " -> " + pname, record);
            if (pname && this.checkMultiValued(record.Database, pname)) {
                const pa = pvalues.split(",");
                for (const p of pa) {
                    _createNewMetadataRecord(record, typename, pname, p.trim());
                }
            } else {
                _createNewMetadataRecord(record, typename, pname, pvalues);
            }
        };

        try {
            for (const record of newrecords) {
                if (record.Database !== this.defsec) {

                    rcount = 1;
                    const dbinfo = this.pojo.getDatabaseInfo(record.Database);
                    const rparams = [];
                    for (const p in record) {
                        if (dbinfo.params.includes(p)) {
                            if (this.checkParamOutputMetadata(p)) {
                                rparams.push(p);
                            }
                        }
                    }

                    if (rparams.length == 0) {
                        // NO params specified, only type, so we create one metadata record
                        _createNewMetadataRecords(record, dbinfo.type);
                    } else {
                        for (const rparam of rparams) {
                            _createNewMetadataRecords(record, dbinfo.type, rparam, record[rparam]);
                        }
                    }
                }
            }
        } catch (err) {
            const errmsg = "ERROR writing out record";
            console.error(errmsg, err);
            logError(errmsg, err);
            exitNow();
        }
    }

    private getDiaryFile (dt: string): string {
        return this.settings.export_folder + "\\" + this.settings.diary_folder + "\\" + dt + " Entry.md";
    }

    private getDateFromFile (): string {
        //        console.log("HERE IS THE currentfile", this.currentfile);
        const basename = this.currentfile.basename;
        return basename;
    }

    private checkParamOutputMetadata (key: string): boolean {
        if (this.settings.params_not_metadata) {
            if (this.settings.params_not_metadata.includes(key)) { return false; }
        }
        return true;
    }

    private trackingInfo (parsed, db, robj): object {

        console.log("Called trackingInfo!", parsed, db, robj);
        console.log("NOT IMPLEMENTED FOR NOW");
        const bSkip = true;
        if (bSkip) {
            return;
        }

        // The following prevents adding tracking information for the import of the same daily entry more than once.
        if (parsed[this.defsec] && parsed[this.defsec][0].Date) {
            const edate = parsed[this.defsec][0].Date;
            if (this.memoizeTracking.hasOwnProperty(edate)) {
                if (this.memoizeTracking[edate]) {
                    // Exists already.
                    return;
                }
            } else {
                // Check if daily entry already exists for this date in the vault. If it does, we DO NOT track again (skipped).
                const mdfile = getDiaryFile(edate);
                if (fs.existsSync(mdfile)) {
                    this.memoizeTracking[edate] = true;
                    return;
                } else {
                    this.memoizeTracking[edate] = false;
                }
            }
        }
        //    console.log("ADDING TRACKING FOR " + parsed[this.defsec][0].Date, this.memoizeTracking);

        const _checkIfExistsAlready = function (valsNow, valsNew, key) {
            //        console.log('KEY is ' + key, valsNow, valsNew);
            //        console.log("INPUT OBJ ", robj);
            // Check if we encountered this before in this import
            // Check if we encountered this before in previous imports
            let pos = 0;
            for (const k of valsNow) {
                const ka = k.split("=");
                let count = parseInt(ka[1], 10);
                if (isNaN(count)) {
                    console.error("ERROR ERROR on number", valsNow);
                }
                if (ka[0] == key) {
                    count++;
                    return { exists: 1, index: pos, newval: key + "=" + count };
                }
                pos++;
            }

            pos = 0;
            for (const k of valsNew) {
                if (!k) {
                    console.log("BAD NEWS on newStuff!", valsNew);
                }
                const ka = k.split("=");
                let count = parseInt(ka[1], 10);
                if (isNaN(count)) {
                    console.error("ERROR ERROR on number", valsNew);
                }
                if (ka[0] == key) {
                    count++;
                    const newval = key + "=" + count;
                    return { exists: 2, index: pos, newval: newval };
                }
                pos++;
            }


            //        console.log("HERE NEW ITEM for key " + key + " -> " );

            return { exists: 0, index: 0, newval: key + "=1" };
        }

        if (!logs.tracking[db]) {
            logs.tracking[db] = {};
        }
        if (!logs.newstuff[db]) {
            logs.newstuff[db] = {};
        }

        for (const p in robj) {
            let bSkipError = false;
            if (typeof robj[p] === 'string') {
                const wc = robj[p].split(" ").length;
                if (wc > this.settings.tracking_max_word_count) {
                    logError("ERROR with tracked content. Too many words to be included! Perhaps a mistake in the entry for " + p, robj[p]);
                    logError("ABOVE was while parsing the file " + currentfile);
                    bSkipError = true;
                }
            }
            if (!bSkipError && !this.settings.tracking_params_exclude.includes(p) && p.charAt(0) !== "_" && robj[p] !== "_NONE_") {
                if (!logs.newstuff[db][p]) { logs.newstuff[db][p] = []; }
                if (!logs.tracking[db][p]) { logs.tracking[db][p] = []; }

                const { exists, index, newval } = _checkIfExistsAlready(logs.tracking[db][p], logs.newstuff[db][p], robj[p]);
                if (!exists) {
                    // This is a NEW item that has never been encountered on any import.
                    logs.newstuff[db][p].push(newval);
                } else if (exists == 1) {
                    // This an item that HAS been encountered on previous imports.
                    logs.tracking[db][p][index] = newval;
                } else if (exists == 2) {
                    // This is an item that HAS been encountered previously on THIS import and NOT on a previous import.
                    logs.newstuff[db][p][index] = newval;
                } else {
                    logError("ERROR encountered checking if tracking item exists. Returned " + exists);
                }
            }
        }
    }
}
//let lastdb = null;
//let lastidx = 0;

let trackingFolder;
let logFolder;

/*
const init = function () {
    if (!process.env.POJO_FOLDER) {
        console.error("ERROR - Need to define POJO_FOLDER in .env file!");
        process.exit(1);
    }

    // this.settings
    this.settingsFolder = path.join(process.env.POJO_FOLDER, "this.settings");

    // Process options
    let this.settingsfile;
    for (let n = 2; n < process.argv.length; n++) {
        if (process.argv[n].charAt(0) == "-") {
            switch (process.argv[n].charAt(1)) {
                default:
                    console.error("Unexpected option paramater.", process.argv[n]);
                    process.exit(1);
            }
        } else {
            this.settingsfile = process.argv[n];
        }
    }

    // Read in this.settings file and put contents into this.settings
    console.log("REad in this.settings file " + this.settingsfile);
    readthis.settingsFile(this.settingsfile);

    if (!this.settings.daily_entry_h3) {
        this.defsec = "Daily Entry";
    } else {
        this.defsec = this.settings.daily_entry_h3;
    }

    if (!this.settings.conversion_info_folder) {
        console.error("conversion_info_folder not specified in this.settings file", this.settingsfile);
        process.exit(1);
    }

    // Tracking Information
    trackingFolder = path.join(process.env.POJO_FOLDER, this.settings.conversion_info_folder, "Tracking");

    // Logging
    logFolder = path.join(process.env.POJO_FOLDER, this.settings.conversion_info_folder, "Logs");

}

const exitNow = function (end) {

    // Output the debug files and errors.txt files.
    for (let dfile in logs.debug) {
        let debugfile = path.join(logFolder, dfile + '.txt');
        console.log("DEBUG INFO FILE " + debugfile);
        if (logs.debug[dfile].length > 0) {
            fs.outputFileSync(debugfile, logs.debug[dfile].join("\n"));
        } else {
            fs.removeSync(debugfile);
        }
    }

    const errFile = path.join(logFolder, "errors.txt");
    if (logs.errors.length > 0) {
        console.error("ERRORS found and logged in " + errFile);
        fs.writeFileSync(errFile, logs.errors.join("\n"));
        //        console.error(" ");
        //        console.error(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
        //        for (let error of logs.errors) {
        //            console.error(error);
        //        }
        //        console.error(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
    } else {
        fs.removeSync(errFile);
        console.log("NO ERRORS found. Complete.");
    }

    if (!end) {
        console.error("Process exited early!");
        if (currentfile) {
            console.error(" -> Was processing this file at exit: " + currentfile);
        }
    }
    process.exit(1);
}
*/

const exitNow = function (end) {
    console.error("EXIT NOW CALLED!!!!");
}


