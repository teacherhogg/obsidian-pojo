import { Vault, TFile, App, getAllTags, stringifyYaml, parseYaml } from "obsidian";
// BELOW IS DEPRECATED!
import { parse } from "@textlint/markdown-to-ast";
// BELOW IS DEPRECATED!
import { fromMarkdown } from 'mdast-util-from-markdown';
import { PojoSettings, generatePath } from "./settings";
import * as path from "path";
import * as url from "url";
// import convert from "heic-convert";


const logs = {
    debug: {},
    tracking: {},
    newstuff: {},
    errors: []
}
// Default section
const defcatch = "Daily Info";

export class PojoConvert {

    private settings: PojoSettings;
    private vault: Vault;
    private app: App;
    private defsec: string;
    private currentdb: string;
    private currentidx = 0;
    private currentfile: TFile;
    private pojo: object;
    private memoizeTracking = {};
    private convertEnabled = true;

    constructor(settings: PojoSettings, pojo: object, vault: Vault, app: App) {
        this.settings = settings;
        this.pojo = pojo
        this.vault = vault;
        this.app = app;
        this.defsec = this.settings.daily_entry_h3[0];
        this.currentdb = this.settings.daily_entry_h3[0];
        if (!settings.isDesktop) {
            this.convertEnabled = false;
        }
    }

    async createMOCFiles (bCreateOnly: boolean): Promise<object> | null {

        // Load the MOC templates.
        const templates = await this.pojo.getTemplates();
        if (!templates) {
            this.logError("ERROR on getting templates!");
            console.error("Error reading Templates");
            return null;
        }

        // Get the tag summaries
        const tagSummary = await this.getTaggedFiles(this.settings.folder_daily_notes, true);

        const info = {
            mocCount: 0,
            mocCollisions: [],
            mocNames: {},
            bCreateOnly: bCreateOnly
        }
        const dbs = this.pojo.getDatabases(true);
        console.log("HERE ARE databases", dbs);

        for (const db in dbs.databases) {
            const mret = await this.createMOCFile(db, dbs.databases[db], templates, tagSummary, info);
        }

        return info;
    }

    async createMOCFile (dbname: string, dbdata: object, templates: object, tagsummary: object, info: object): Promise<object> {
        //        console.log("createMOC Files for " + dbname, dbdata);
        const self = this;
        const dbinfo = dbdata._database;
        const typekey = dbinfo.type;
        const metadatafolder = generatePath(self.settings.folder_pojo, self.settings.subfolder_metadata);

        // Get params array without last param (which is always Description).
        const sparams = dbinfo.params.slice(0, -1);

        const _initMOCFile = async function (mname: string): Promise<object> {

            const mocFileName = mname.replace(/[^a-zA-Z0-9\-_ ]/g, '') + ".md";
            let mocFileInfo = null;

            if (info.mocNames[mocFileName]) {
                // Collision! This means the same mocname has been used before.
                info.mocNames[mocFileName]++;
                info.mocCollisions.push(mocFileName);
                const mocFile = generatePath(self.settings.folder_moc, mocFileName);
                const mocFileRef = self.vault.getAbstractFileByPath(mocFile) as TFile;
                mocFileInfo = await self.pojo.getMarkdownFileInfo(mocFileRef, "content", true);
                //                console.log("mocFileInfo2 returns", mocFileInfo);
                if (!mocFileInfo) {
                    console.error("SOMETHING WRONG! Missing existing MOC file.", mocExistingFile);
                    self.logError("Collision with MOC, but existing moc not found! " + mocFileName, mocExistingFile);
                    mocFileInfo = null;
                }
            } else {
                info.mocNames[mocFileName] = 1;
            }

            //            console.log("HERE Is returned for " + mocFileName, mocFileInfo);
            return { mocFileName, mocFileInfo };
        }

        const _addMOCtablesFM = function (fmobj: object, moctype: string, filterkey?: string, filtervalue?: string, subfilterkey?: string, subfiltervalue?: string) {
            const tobj = {
                viewparams: sparams,
                filterkey: filterkey,
                filtervalue: filtervalue,
                database: dbname,
            }
            if (subfilterkey) {
                tobj.subfilterkey = subfilterkey;
                tobj.subfiltervalue = subfiltervalue;
            }

            if (!fmobj.tables) {
                fmobj.tables = [];
            }
            fmobj.tables.push(tobj);
        }


        const _getMOCfrontmatter = function (moctype: string, filterkey?: string, filtervalue?: string, subfilterkey?: string, subfiltervalue?: string): object {

            const fm = [];

            const vps = [];
            for (const vp of sparams) {
                vps.push(vp);
            }
            const vpval = vps.join(",");

            //            fm.push("---");
            if (self.settings.frontmatter_always_add_moc) {
                for (const line of self.settings.frontmatter_always_add_moc) {
                    fm.push(line);
                }
            }
            fm.push(`metadata: ${metadatafolder}`);
            fm.push(`Category: ${moctype}`);
            if (moctype == 'MOC-database') {
                fm.push(`viewparams: [${vpval}]`);
                fm.push(`database: ${dbname}`);
            } else if (moctype == 'MOC-filtered') {
                fm.push(`database: ${dbname}`);
                fm.push(`viewparams: [${vpval}]`);
                fm.push(`filterkey: ${filterkey}`);
                fm.push(`filtervalue: ${filtervalue}`);
                if (subfilterkey) {
                    fm.push(`subfilterkey: ${subfilterkey}`);
                    fm.push(`subfiltervalue: ${subfiltervalue}`);
                }
            } else if (moctype == 'MOC-multi') {
                const tobj = {
                    viewparams: sparams,
                    filterkey: filterkey,
                    filtervalue: filtervalue,
                    database: dbname,
                }
                if (subfilterkey) {
                    tobj.subfilterkey = subfilterkey;
                    tobj.subfiltervalue = subfiltervalue;
                }

                fm.push(`tables: [${JSON.stringify(tobj)}]`);

            } else {
                this.exitNow(["Unknown MOC Type " + moctype]);
            }

            //            fm.push("---");

            const fmobj = parseYaml(fm.join("\n"));
            //            console.log("HERe is the frontmatter", fmobj, fm);
            return fmobj;
        }

        const _createMOCTableHeader = function (dbname: string, filterkey: string, filtervalue: string, subfilterkey: string, subfiltervalue: string) {

            const head = [];

            const _addHeader = function (headername: string) {
                head.push("");
                head.push(`## ${headername}`);
                head.push(`> [!info] ${headername}`);
                head.push(`> Database: ${dbname}`);
                if (subfilterkey) {
                    head.push(`> ${filterkey}: ${filtervalue}`);
                    head.push(`> ${subfilterkey}: ${subfiltervalue}`);
                } else if (filterkey) {
                    head.push(`> ${filterkey}: ${filtervalue}`);
                }
                head.push("");
            }

            if (!filterkey) {
                _addHeader(dbname);
            }
            else if (subfilterkey) {
                const hname = `${subfiltervalue} (${dbname} -> ${filtervalue} -> ${subfilterkey})`;
                _addHeader(hname);
            }
            else {
                const hname = `${filtervalue} (${dbname} -> ${filterkey})`;
                _addHeader(hname);
            }

            return head;
        }

        const _createMOC = async function (mocname: string, moctype: string, filterkey?: string, filtervalue?: string, subfilterkey?: string, subfiltervalue?: string) {

            //            console.log(`_createMoc ${mocname} type ${moctype} [${filterkey} = ${filtervalue}, ${subfilterkey} = ${subfiltervalue}] <${dbname}>`);

            const { mocFileName, mocFileInfo } = await _initMOCFile(mocname);
            //            console.log("returned from _initMocFile " + mocFileName, mocFileInfo);

            let moc;
            if (!mocFileInfo) {
                // This MOC has not been created so far this time.
                const fm = _getMOCfrontmatter(moctype, filterkey, filtervalue, subfilterkey, subfiltervalue);

                moc = "---\n"
                moc += stringifyYaml(fm);
                moc += "---\n";

                const head = _createMOCTableHeader(dbname, filterkey, filtervalue, subfilterkey, subfiltervalue);
                let newmoc = head.join("\n");
                newmoc += "\n" + templates[moctype].contentstart;
                newmoc += "\nlet tabledata = fm.tables[0]";
                newmoc += "\n" + templates[moctype].contentend;

                moc += newmoc;

                info.mocCount++;
            } else {
                // MOC exists so we will ADD to it.
                //                console.log("EXISTING MOC found for " + mocname, mocFileInfo);
                _addMOCtablesFM(mocFileInfo.frontmatter, moctype, filterkey, filtervalue, subfilterkey, subfiltervalue);

                moc = "---\n"
                moc += stringifyYaml(mocFileInfo.frontmatter);
                moc += "---\n";

                const head = _createMOCTableHeader(dbname, filterkey, filtervalue, subfilterkey, subfiltervalue);
                let newmoc = mocFileInfo.content + "\n" + head.join("\n");

                const tindex = info.mocNames[mocFileName] - 1;
                newmoc += "\n" + templates[moctype].contentstart;
                newmoc += `\nlet tabledata = fm.tables[${tindex}]`;
                newmoc += "\n" + templates[moctype].contentend;

                moc += newmoc;
            }

            //            console.log("Creating MOC file " + mocFileName);
            await self.pojo.createVaultFile(moc, self.settings.folder_moc, mocFileName, !info.bCreateOnly);
            //            console.log("Finished creating MOC file...");
        }

        const minMoc = this.settings.minEntriesForMoc;
        const _mocOK = function (dbn: string, typeval: string, subtype?: string): boolean {
            const mkey = subtype ? typeval + "_" + subtype : typeval;
            if (!tagsummary[dbn]) {
                console.error("ERROR getting summary for database " + dbn);
                return false;
            }
            if (tagsummary[dbn][mkey] >= minMoc) {

                //                console.log("MOC " + dbn + " > " + mkey + `(${tagsummary[dbn][mkey]})`);
                return true;
            }
            return false;
        }

        // Create a Database MOC
        //        console.log("CREATE DABASE MOC " + dbname);
        await _createMOC(dbname, "MOC-database");

        const _createMOCs = async function (mocname: string, moctype: string, multi: string, filterkey: string, filtervalue: string, subfilterkey?: string, subfiltervalue?: string) {
            if (filtervalue && Array.isArray(filtervalue)) {
                console.warn("NOT expecting this value to be an array!", filtervalue);
            }
            if (subfiltervalue && Array.isArray(subfiltervalue)) {
                console.warn("NOT expecting this sub-value to be an array!", subfiltervalue);
            }

            let valsa = [filtervalue];
            if (multi == "DASH" && filtervalue) {
                valsa = filtervalue.split("-");
            }

            if (valsa.length > 1) {
                console.warn("MULTIPLE TIMES..." + mocname, valsa);
            }
            for (const val of valsa) {
                if (_mocOK(dbname, val, subfiltervalue)) {
                    await _createMOC(mocname, moctype, filterkey, val, subfilterkey, subfiltervalue);
                }
            }
        }

        // Create a MOC for each Database Type Value

        let tmulti = "NA";
        if (dbinfo["field-info"] && dbinfo["field-info"][typekey]) {
            tmulti = dbinfo["field-info"][typekey].multi;
        }

        if (dbdata[typekey]) {
            const typevals = dbdata[typekey];
            //            if (typevals.length > 1) {
            //                console.warn("MULTIPLE MOCS typevals " + dbname + " -> " + typekey, typevals);
            //            }
            for (const typeval of typevals) {

                if (_mocOK(dbname, typeval)) {
                    await _createMOCs(typeval, "MOC-multi", tmulti, typekey, typeval);
                }
            }
        }


        // Create a MOC for each Database Param Value
        if (dbinfo.params && dbinfo["field-info"]) {
            for (const param of dbinfo.params) {
                // Check if field-info there.
                const fldinfo = dbinfo["field-info"][param];
                if (fldinfo && fldinfo.allowed) {
                    if (fldinfo.allowed == "history" || fldinfo.allowed == "fixed") {
                        if (dbdata[param]) {
                            for (const pvalue of dbdata[param]) {
                                await _createMOCs(pvalue, "MOC-multi", "NA", param, pvalue);
                            }
                        }
                    } else if (fldinfo.allowed == "history-type") {
                        const typevals = dbdata[typekey];
                        if (typevals) {
                            for (const typeval of typevals) {
                                const hkey = typeval + "_" + param;
                                //                                if (typevals.length > 1) {
                                //                                    console.warn("MULTIPLE MOCS history-type " + dbname + " -> " + hkey, typevals, dbdata[hkey]);
                                //                                }
                                if (dbdata[hkey]) {
                                    for (const pvalue of dbdata[hkey]) {
                                        await _createMOCs(pvalue, "MOC-multi", tmulti, typekey, typeval, param, pvalue);
                                    }
                                }
                            }
                        } else {
                            console.warn("Interestingly no data found for " + dbname + " and " + typekey);
                        }
                    }
                }
            }
        }

        return {};
    }

    async convertDailyNote (inputFile: TFile, databases: string[], suggestedTags: object[], imageactions: object, convertAgain: boolean, convertTry: boolean): Promise<object> {


        // We are converting a daily note AGAIN if convertAgain is ture
        // This means the original file has already been archived and we need to redo from that copy!

        this.pojo.logDebug("Converting Daily Note ", inputFile, convertAgain);
        console.log("HERE are suggestedTags", suggestedTags);
        console.log("HERE are databases", databases);

        let fname = null;
        let fileinfo = null;
        let contentFile = inputFile;
        let archiveFile = !convertAgain;
        if (convertTry) {
            archiveFile = false;
        }
        try {
            // Get file contents
            if (convertAgain || convertTry) {
                //                console.log("CONVERTING NOTE ", inputFile);
                fname = generatePath(
                    this.settings.folder_pojo,
                    this.settings.subfolder_archived_daily_notes,
                    this.getNoteFileName(inputFile.name, false));
                //                console.log("READING ARCHIVE FILE AT:" + fname);
                contentFile = this.vault.getAbstractFileByPath(fname);
                if (!contentFile && convertTry) {
                    contentFile = inputFile;
                    archiveFile = true;
                }
                //                console.log("READING FILE", contentFile);
            }


            fileinfo = await this.pojo.getMarkdownFileInfo(contentFile, "filecache", false);

        } catch (err) {
            this.logError("ERROR on reading file info!", err);
            console.error("input file", inputFile);
            console.error("ERROR reading content of file " + fname, contentFile);
            return {
                "type": "error_reading",
                "msg": "Cannot read note at " + fname + " ( " + err.message + " )"
            }
        }

        console.log("HERE Is fileinfo!!!", fileinfo);

        const bCompareDeprecated = false;
        if (bCompareDeprecated) {
            console.warn("Converting TWICE including old markdown parsing!");
        }

        // Start import of Daily Note markdown file.
        let frontmatter = null;
        let diarydate = null;
        let parsedcontent = null;
        let tags = null;
        try {
            // Check for frontmatter
            frontmatter = fileinfo?.frontmatter;
            if (!frontmatter) { frontmatter = {}; }

            //            const filematter = matter(content);
            //            frontmatter = filematter.data;

            // TODO - Check to see if Daily Note has ALREADY been converted!
            if (frontmatter && frontmatter.POJO) {
                this.pojo.logDebug("Already Converted!", frontmatter);
                return {
                    "type": "noconvert_alreadyconverted",
                    "msg": "This note has already been converted previously."
                }
            }

            /**
             * fcache will possibly include keys: 
             *  embeds, headings, links, listItems, sections, tags
             */



            // Parse the markdown contents
            this.currentdb = this.defsec;
            this.currentidx = 0;

            parsedcontent = this.parseMarkdownNew(fileinfo, databases, suggestedTags, true);

            // Check to see IF this is actually a daily note
            if (!parsedcontent || Object.keys(parsedcontent).length == 0) {
                this.pojo.logDebug("Empty daily not!");
                return {
                    "type": "noconvert_empty",
                    "msg": "This note is devoid of content."
                };
            } else if (!parsedcontent[this.defsec] || !parsedcontent[this.defsec][0].Date) {
                this.pojo.logDebug("Some type of markdown note, but NOT a daily note!", parsedcontent);
                return {
                    "type": "noconvert_markdownnote",
                    "msg": "This is a markdown note, but not a POJO compliant daily note."
                };
            } else {
                //                console.log("parsedcontent", parsedcontent);

                diarydate = parsedcontent[this.defsec][0].Date;

                // Get all the tags found in file.
                tags = [];
                for (const sect in parsedcontent) {
                    if (sect !== this.defsec) {
                        for (const sitem of parsedcontent[sect]) {
                            if (sitem._database && sitem._type) {
                                const newtag = sitem._database + "/" + sitem._type;
                                if (!tags.includes(newtag)) { tags.push(newtag); }
                            }
                        }
                    }
                }
            }

        } catch (err) {
            this.logError("ERROR on importing and parsing markdown!", err);
            return {
                "type": "error_parsing",
                "msg": "Error Encountered: " + err.message
            }
        }

        this.logDebug("exported", "FOUND FOR EXPORT", parsedcontent);
        console.log("Parsed Content", parsedcontent);
        console.log("Tags " + diarydate, tags);

        if (bCompareDeprecated) {
            this.currentfile = contentFile;
            let parsedcontentOLD;
            try {
                parsedcontentOLD = this.parseMarkdownDEPRECATED(fileinfo.origcontent);
            } catch (err) {
                console.error("ERROR parsing content with OLD method ", err);
                return {
                    "type": "error_parsing",
                    "msg": "Error Encountered: " + err.message
                }
            }
            this.currentfile = null;
            console.log("Parsed Content OLD", parsedcontentOLD);

            // Content Comparison!

            for (const cs in parsedcontent) {
                const as = parsedcontent[cs];
                for (let nn = 0; nn < as.length; nn++) {
                    //                    console.log("HERE BE " + cs + " >" + nn + "<");
                    const obj2 = parsedcontent[cs][nn];
                    const obj1 = parsedcontentOLD[cs] ? parsedcontentOLD[cs][nn] : null;
                    if (!obj1) {
                        console.error("DIFFERENCE - NOT FOUND in old parse", obj2);
                    } else {
                        for (const prop in obj2) {
                            if (!obj1[prop]) {
                                console.error("DIFFERENCE - Missing prop " + prop + " in old parse.");
                            } else {
                                if (JSON.stringify(obj1[prop]) !== JSON.stringify(obj2[prop])) {
                                    console.error("OBJECT DIFFERENCE for " + cs + " num " + nn + " and prop " + prop, obj1[prop], obj2[prop]);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Construct the NEW daily note from parsedcontent
        const newrecords: object[] = [];
        const dailyentry = {};
        const sections = {};
        const footlinks = [];
        let dailynotefile = null;
        try {

            // Add frontmatter
            this.addFrontMatterForEntry(parsedcontent, tags, frontmatter);

            for (const db in parsedcontent) {

                // Add daily entry
                if (db == this.defsec) {
                    const entry = parsedcontent[db][0];
                    for (const key in entry) {
                        if (key == "_Title") {
                            dailyentry.Heading = entry._Title;
                        } else {
                            dailyentry[key] = entry[key];
                        }
                    }
                } else {
                    const dbinfo = this.pojo.getDatabaseInfo(db)

                    if (this.settings.databases_no_callouts && this.settings.databases_no_callouts.includes(db)) {
                        console.log("SKIP creation of callout for database " + db, frontmatter, dailyentry);
                    } else {
                        // Add frontmatter from database entries
                        this.addFrontMatterForDatabase(frontmatter, db, parsedcontent[db], dbinfo);

                        // Add sections for other database information 
                        this.addMarkdownCalloutSection(sections, diarydate, db, parsedcontent[db], dbinfo);
                    }

                    // Add LINKS to be added to the bottom of the diary entry
                    //        addFootLinks(footlinks, db, diaryEntry[db], dbinfo);

                    // Create new records
                    this.createNewRecords(newrecords, diarydate, db, parsedcontent[db], dbinfo);
                }
            }

            if (this.settings.donotcreatefiles) {
                this.pojo.logDebug("NOT creating actual files in Obsidian Vault due to 'donotcreatefiles' option!");
                return {
                    "type": "notfinished_nocreatefiles",
                    "msg": "Settings value donotcreatefiles is true!"
                };
            }

            // Archive the original daily note
            if (archiveFile) {
                const mfolder = generatePath(this.settings.folder_pojo, this.settings.subfolder_archived_daily_notes);
                await this.pojo.createVaultFile(fileinfo.origcontent, mfolder, this.getNoteFileName(inputFile.name, false, frontmatter["Daily Note"]));
            }

            dailynotefile = this.getNoteFileName(inputFile.name, true, frontmatter["Daily Note"]);
            const md = this.createNewDailyNoteMarkdown(dailynotefile, frontmatter, dailyentry, sections, footlinks, imageactions);

            // Output the new Daily Note file.
            const mdcontent = md.join("\n");
            await this.pojo.createVaultFile(mdcontent, this.settings.folder_daily_notes, dailynotefile, true);

        } catch (err) {
            this.pojo.logError("ERROR caught on markdownexport", err);
            const eobj = {
                "type": "error_export",
                "msg": "Error encountered: " + err.message,
            }
            return eobj;
        }
        //        console.warn("FINISHED export of content to obsidian vault");

        // Delete the Daily Note File WITHOUT the processed file name.
        const orignote = generatePath(
            this.settings.folder_daily_notes,
            this.getNoteFileName(inputFile.name, false));
        this.pojo.logDebug("Deleting original note :" + orignote + ":");
        const origNoteFile = this.vault.getAbstractFileByPath(orignote);

        // BOB
        const nodelorig = false;
        if (!nodelorig) {
            //        console.log("DELETING original noteFile " + orignote, origNoteFile);
            await this.vault.delete(origNoteFile);
        } else {
            console.warn("DISABLED DELETE OF ORIG FILE...");
        }

        // Create markdown files for metadata records
        await this.writeOutMetadataRecords(dailynotefile, newrecords);


        return {
            "type": "success",
            "msg": "Daily Note converted successfully."
        }
    }

    async manageImages (imageactions: object): Promise<object> {

        const retobj = {
            success: true,
            failures: [],
            ncount: 0
        }

        // Copy (and convert if HEIC) with any referenced images
        if (this.settings.donotcopyattachments) {
            console.log("NO copy or convert of image attachments as donotcopyattachments is true!");
            retobj.success = false;
            retobj.msg = "donotcopyattachments is set to true in settings!";
            return retobj;
        }

        //        console.log("NEED to manage images", imageactions);

        let nCount = 0;
        for (const refnote in imageactions) {
            const images = imageactions[refnote];
            for (const img of images) {
                if (!await this.pojo.checkAttachmentExists(img.imagename)) {
                    // Target image does not yet exist! 
                    if (this.convertEnabled && img.imageext === ".HEIC") {
                        // Need to CONVERT
                        const imageInfo = await this.pojo.loadDailyNoteImageFile(img);
                        if (!imageInfo.inputBuffer || imageInfo.status !== "success") {
                            retobj.success = false;
                            retobj.failures.push({ refnote: refnote, image: imageInfo.imagefile, error: "NO IMAGE FOUND", info: imageInfo.status });
                        } else {
                            let outputBuffer;
                            try {
                                outputBuffer = await convert({
                                    buffer: imageInfo.inputBuffer,
                                    format: 'JPEG',
                                    quality: 0.9
                                });
                            } catch (err) {
                                console.error("ERROR converting HEIC image to jpg", err);
                                retobj.success = false;
                                retobj.failures.push({ refnote: refnote, image: imageInfo.imagefile, error: "Error converting HEIC image. " + err.message });
                            }
                            if (outputBuffer) {
                                if (!await this.pojo.writeDailyNoteImageFile(img, outputBuffer)) {
                                    retobj.success = false;
                                    retobj.failures.push({ refnote: refnote, image: img.imagename, error: "Could not write HEIC converted file." });
                                } else {
                                    nCount++;
                                }
                            }
                        }
                    } else {
                        // Need to COPY
                        const imagestat = await this.pojo.copyDailyNoteImageFile(img);
                        if (imagestat.status !== "success") {
                            retobj.success = false;
                            retobj.failures.push({ refnote: refnote, image: imagestat.imagefile, error: imagestat.status });
                        } else {
                            nCount++;
                        }
                    }
                }
            }
        }

        retobj.ncount = nCount;

        return retobj;
    }

    async convertNowDEPRECATED (): Promise<boolean> {

        // Get the list of markdown files in the import directory and start processing.
        if (!this.settings.import_folder) {
            this.logError("MISSING import folder in this.settings file.")
            return false;
        }
        try {
            exportContent = this.markdownImportFilesDEPRECATED(importFiles);
        } catch (err) {
            this.logError("ERROR on markdownImport!", err);
        }
        this.pojo.logDebug("FINISHED import of " + importFiles.length + " markdown files");


        this.logDebug("exported", "FOUND FOR EXPORT", exportContent);

        const nrecords = Object.keys(exportContent.diary).length;
        this.pojo.logDebug("BEGIN export of " + nrecords + " content entries to obsidian vault");
        try {
            this.markdownExport(exportContent);
        } catch (err) {
            this.exitNow(["ERROR caught on markdownexport " + err.message]);
        }
        this.pojo.logDebug("FINISHED export of content to obsidian vault");

        this.pojo.logDebug("CREATE MOC Files based on tracking.json contents");
        try {
            this.createMOCFiles(true);
        } catch (err) {
            this.pojo.logError("Error creating MOC Files!", err);
        }
        this.pojo.logDebug("FINISHED creating MOC files.");

        this.pojo.logDebug("EXITING NOW!!!");

        this.exitNow([], true);
    }

    private getNoteFileName (filename: string, bProcessed: boolean, dailynotename: string): string {
        // Returns the filename for PROCESSED if bProcessed true, or NOT with PROCESSED if bProcessed false

        const a = filename.split(".");
        const lastchar = a[0].charAt(a[0].length - 1);

        if (bProcessed) {
            // Name should be of the form "YYYY-MM-DD dow ⚡" when returned.
            if (dailynotename) {
                return dailynotename + " ⚡." + a[1];
            } else {
                if (lastchar == "⚡") {
                    return filename;
                } else {
                    return a[0] + " ⚡." + a[1];
                }
            }
        } else {
            // Name should be of the form "YYYY-MM-DD dow" when returned.
            if (dailynotename) {
                return dailynotename + "." + a[1];
            } else {
                if (lastchar == "⚡") {
                    // Remove last two chars.
                    const newname = a[0].slice(0, a[0].length - 2);
                    return newname + "." + a[1];
                } else {
                    return filename;
                }
            }
        }
    }

    private exitNow (erra: string[], bend?: boolean) {
        this.pojo.pojoLogs("errors", erra, null, bend);
    }

    private logError (msg: string, obj?: object) {
        this.pojo.pojoLogs("errors", [msg], obj, false);
    }

    private logDebug (msg: string, obj?: object) {
        this.pojo.pojoLogs("debug", [msg], obj, false);
    }

    async getTaggedFiles (folder: string, bSummary: boolean): object {

        const taggedfiles = {};
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            if (file.path.startsWith(folder)) {
                const file_cache = this.app.metadataCache.getFileCache(file);
                const tags = getAllTags(file_cache);
                for (const tag of tags) {
                    if (!taggedfiles[tag]) { taggedfiles[tag] = []; }
                    taggedfiles[tag].push(file);
                }
            }
        }

        const tagsummary = {};
        const _addKeyEntry = function (dbname: string, key: string) {
            //            console.log(`_addKeyEntry key=${key} <${dbname}>`);
            if (!tagsummary[dbname]) { tagsummary[dbname] = {}; }
            if (!tagsummary[dbname][key]) { tagsummary[dbname][key] = 1; }
            else { tagsummary[dbname][key]++; }
        }

        console.log("HERE ARE TAGGED FILES", taggedfiles);
        if (!bSummary) {
            return taggedfiles;
        }

        for (const tag in taggedfiles) {
            if (taggedfiles[tag].length > 1) {
                for (const file of taggedfiles[tag]) {
                    const finfo = await this.pojo.getMarkdownFileInfo(file, "yaml", false);
                    const fm = finfo?.frontmatter;
                    if (fm && fm.metainfo) {
                        //                        console.warn("GOTS metainfo for tag " + tag);
                        const ta = tag.slice(1).split("/");
                        const dbname = ta[0];
                        const dbinfo = this.pojo.getDatabaseInfo(dbname);
                        if (!dbinfo) {
                            console.error("MISSING database info for database " + dbname);
                            continue;
                        }
                        const typename = dbinfo.type;

                        const entries = fm.metainfo[dbname];
                        for (const tentry of entries) {
                            //                            console.log(tentry)
                            if (tentry[typename] == ta[1]) {
                                //                                console.log("TYPE NAME " + tentry[typename], tentry);
                                const typeval = tentry[typename];

                                // Check to see if multi is DASH first.
                                let typevala = [typeval];
                                if (tentry["field-info"] && tentry["field-info"][typename] && tentry["field-info"][typename].multi == "DASH") {
                                    typevala = typeval.split("-");
                                }
                                for (const tval of typevala) {
                                    _addKeyEntry(dbname, tval);
                                }

                                for (const ekey in tentry) {
                                    // Exclude any meta metadata
                                    if (!this.settings.metameta[ekey] && ekey !== typename) {
                                        const val = tentry[ekey];
                                        //                                        console.log(` ekey=${ekey} val=${val}`);

                                        if (Array.isArray(val)) {
                                            for (const vale of val) {
                                                _addKeyEntry(dbname, typeval + "_" + vale);
                                                _addKeyEntry(dbname, vale);
                                            }
                                        } else {
                                            _addKeyEntry(dbname, typeval + "_" + val);
                                            _addKeyEntry(dbname, val);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        console.log("GOTS THE SUMMARY", tagsummary);
        return tagsummary;
    }


    getInputFiles (folder): TFile[] {

        const inputfiles = [];
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            if (file.path.startsWith(folder)) {
                inputfiles.push(file);
            }
        }
        return inputfiles;
    }

    async createDailyNote (notename: string, includeTasks: boolean): Promise<object> {

        const retobj = {
            success: true,
            message: "Finished successfully"
        };

        // Load the templates.
        const templates = await this.pojo.getTemplates();
        if (!templates) {
            this.logError("ERROR on getting templates!");
            retobj.success.message = "Error reading Templates";
            retobj.success = false;
            return retobj;
        }

        let note = "";

        if (templates["DAILY-start"]) {
            note += templates["DAILY-start"].content;
        }

        if (includeTasks && templates["DAILY-tasks"]) {
            note += templates["DAILY-tasks"].content;
        }

        if (templates["DAILY-end"]) {
            note += templates["DAILY-end"].content;
        }

        console.log("HERE the note");
        console.log(note);

        await this.pojo.createVaultFile(note, this.settings.folder_daily_notes, notename + ".md", false);

        return retobj;
    }

    private async markdownImportFilesDEPRECATED (mdfiles: TFile[]) {

        const exported = {
            diary: {},
            notes: []
        };
        for (const file of mdfiles) {
            this.markdownImportFile(exported, file);
        }
        return exported;
    }

    private parseMarkdownNew (fileinfo: object, databases: string[], suggestedtags: object[], bLessStrict: boolean): object {
        const self = this;
        console.log("parseMarkdownNew", fileinfo, suggestedtags);
        const filecache = fileinfo.filecache;

        const sections = {};
        const _addSection = function (sec: string, sline: number) {
            if (sec) {
                sec = self.pojo.normalizeReference(sec);
            }
            sections[sline + ""] = sec;
        }

        const info = {};

        let startline = 0;
        if (filecache?.frontmatterPosition?.end.line) {
            startline = filecache.frontmatterPosition.end.line + 1;
        }
        _addSection(this.defsec, startline);


        const _checkMatch = function (tval: string): string | null {

            // Check if daily entry
            if (tval.startsWith(self.defsec)) {
                return self.defsec;
            } else {
                let found = false;
                if (bLessStrict) {
                    const db = tval.split("/")[0];
                    found = databases.includes(db.toLowerCase());
                } else {
                    found = suggestedtags.find(el => {
                        if (el.name.toLowerCase() == tval.toLowerCase()) {
                            return true;
                        }
                    })
                }

                if (found) {
                    //                    console.log("MATCH on >>" + tval + "<<");
                    return tval;
                }
            }

            //            console.log("NO MATCH on >>" + tval + "<<");
            return null;
        }

        // Figure out the SECTIONS start and end lines. 
        // SECTION is defined by EITHER a tag OR an H3 (that matches a suggestedtag) 
        const skiplines = {};
        if (filecache.headings) {
            for (const head of filecache.headings) {
                if (head.level == 3) {
                    const sect = _checkMatch(head.heading.trim());
                    if (sect) {
                        _addSection(sect, head.position.start.line)
                        if (head.heading == self.defsec) {
                            skiplines[head.position.start.line + ""] = head.heading;
                        }
                    }
                } else if (head.level == 1 || head.level == 2) {
                    const htext = head.heading.trim();
                    if (!info.title) {
                        // Title is the FIRST H1 or H2 in the file.
                        info.title = htext;
                        skiplines[head.position.start.line + ""] = htext;
                    }
                    if (!info.Date && head.level == 1) {
                        const date = new Date(htext);
                        //            console.log("CONVERT " + line + " to date:", date)
                        if (!date || (date instanceof Date && isNaN(date.valueOf()))) {
                            // See if it is an ISO Date
                            info.ISODave = htext;
                            info.Date = this.convertISODave(htext);
                        } else {
                            info.Date = htext;
                        }
                        skiplines[head.position.start.line + ""] = htext;
                    }
                }
            }
        }

        if (!info.Date) {
            info.Date = this.getDateFromFile(fileinfo.inputfile);
            console.log("GOT date from file!");
        }
        console.log("HERE is the info", info);
        console.log("HERE is the SKIP LINES", skiplines);

        if (filecache.tags) {
            for (const tago of filecache.tags) {
                const sect = _checkMatch(tago.tag.trim().slice(1));
                if (sect) { _addSection(sect, tago.position.start.line) }
            }

        }

        console.log("HERE are the sections", sections);
        const fcontent = fileinfo.origcontent.split("\n");
        console.log("File Content is ", fcontent);

        const _removeHash = function (input: string): string {
            let line = input.trimStart();
            while (line.charAt(0) == "#") {
                line = line.slice(1).trimStart();
            }
            return line;
        }

        // NOW go through file adding to appropriate sections!
        const doc = {};
        let currsect = this.defsec;
        for (let lnum = startline; lnum < fcontent.length; lnum++) {
            const sect = sections[lnum + ""];
            const line = fcontent[lnum];
            //            console.log("Parse Line and sect " + sect, line);
            if (sect) {
                const db = sect.split("/")[0];
                if (!doc[db]) { doc[db] = []; }
                currsect = db;
                // Parse this line! Remove leading # and whitespace
                const pline = _removeHash(line);
                //                console.log("INPUT:" + line + ": OUTPUT:" + pline + ":");

                let bDebug = false;
                if (db == "Tasks") {
                    bDebug = true;

                }

                let pobj = null;
                if (pline) {
                    if (bDebug) {
                        console.log("Parsing Pojo L" + lnum + " on >>" + pline + "<< SKIPLINE: " + skiplines[lnum + ""]);
                    }
                    if (!skiplines[lnum + ""]) {
                        const bQuiet = lnum == startline ? true : false;
                        pobj = self.pojo.parsePojoLine(pline, bQuiet);
                        if (bDebug) {
                            console.log("HERE IS parse pojo", pobj);
                        }
                    }
                }
                if (!pline || !pobj) {
                    if (doc[db].length == 0) {
                        const newsect = {
                            _database: db,
                            Description: []
                        }
                        if (db == this.defsec) {
                            newsect._Title = info.title;
                            newsect.Date = info.Date;
                        }
                        doc[db].push(newsect);
                        //                        console.log("HERE be2 for " + db + " line>>" + line + "<<", doc[db]);
                        if (line && !skiplines[lnum + ""]) {
                            doc[db][0].Description.push(line);
                        }
                    } else {
                        //                        console.log("HERE be for " + db + " line>>" + line + "<<", doc[db]);
                        if (!skiplines[lnum + ""] && line) {
                            doc[db][0].Description.push(line);
                        } else {
                            console.log("SKIP THIS LINE " + sect + " -> " + lnum, line);
                        }
                    }
                } else {
                    //                    console.log(`LINE ${lnum} and db ${db}`, doc[db]);
                    doc[db].push(pobj);
                }
            } else {
                //                console.log("HERE is doc and currsect " + currsect, doc);
                const snum = doc[currsect].length;
                const cobj = doc[currsect][snum - 1];
                //                console.log("HERE is the current obj " + currsect + " num " + snum);
                //                console.log("HERE is doc", doc);
                if (!skiplines[lnum + ""] && line) {
                    if (!cobj.Description) { cobj.Description = []; }
                    cobj.Description.push(line);
                }
            }
        }

        return doc;
    }


    // Parse markdown into Abstract Symbolic Tree (AST)
    private parseMarkdownDEPRECATED (mdcontent) {
        const ast = parse(mdcontent);
        console.log("ast 1", ast);

        const ast2 = fromMarkdown(mdcontent);
        console.log("ast 2", ast2);

        this.logDebug("astTree", "AST Tree", ast);

        // Parse tree. First element is the document!
        if (!ast || ast.type !== "Document") {
            this.logError("ERROR getting ast tree", ast);
            return;
        }

        const parsed = {};

        this.logDebug("debug", ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        for (const child of ast.children) {
            const rval = this.parseASTDEPRECATED(child);
            if (!rval) {
                // ERROR
                this.pojo.logError("parseAST error encountered. Continuing to Process...");
                continue;
            }
            this.logDebug("debug", rval.key, rval.values);
            if (!this.parseItemDEPRECATED(parsed, rval.key, rval.values)) {
                // ERROR
                this.pojo.logError("parseItem error encoutered. Continuing to Process...");
                continue;
            }
        }

        return parsed;
    }

    private parseASTDEPRECATED (el: object): object {

        let key, values;
        switch (el.type) {
            //            case 'Yaml': 
            //                break;
            case 'Header':
                key = "H" + el.depth;
                //                if (el.children && el.children.length == 1 && el.children[0].type == "Str") {
                if (el.children && el.children.length == 1) {
                    const v = el.children[0].value ? el.children[0].value : el.children[0].raw;
                    values = v.split("\n");
                } else {
                    this.logError("Unexpected Header type", el);
                    return null;
                }
                break;
            case 'HorizontalRule':
                key = "P";
                values = ["___"];
                break;
            case 'BlockQuote':
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
                            iobj.imagename = pimage.base;
                            iobj.imagesource = pimage.base;
                            iobj.imageext = pimage.ext;
                            iobj.imagedir = pimage.dir;
                            if (pimage.ext == ".HEIC") {
                                // Need to convert to jpg.
                                iobj.imagename = pimage.name + ".jpg";
                            }
                            //                            console.log("HERE IS IMAGE OBJ", iobj, pimage);
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
                            this.logError("Unexpected List Child type", c);
                            return null;
                        }
                    }
                } else {
                    this.logError("Unexpected List type", el);
                    return null;
                }
                break;
            default:
                this.logError("Unrecognized ast element type " + el.type, el);
                return null;
        }

        return { key, values }
    }

    private checkMultiValued (db: string, key: string, context: string): boolean {

        //        this.pojo.logDebug("HERE IS check multi values called from " + context, db, key);
        if (db == this.defsec) {
            return false;
        }

        const dbinfo = this.pojo.getDatabaseInfo(db);
        if (dbinfo && dbinfo["field-info"] && dbinfo["field-info"][key]) {
            const finfo = dbinfo["field-info"][key];
            if (finfo.multi && finfo.multi !== "NA") {
                return true;
            }
        }
        return false;
    }

    private parseLineDEPRECATED (parsed: object, key: string, line: string): boolean {

        const self = this;

        const _addParsed = function (info) {

            // Check parsed info for any tags and process according to the metameta settings!
            //            self.pojo.extractMetaMeta(info);

            //            this.pojo.logDebug("_addParsed", info);
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

        }

        if (!parsed[this.defsec]) { parsed[this.defsec] = []; }
        if (!parsed[this.defsec][0]) { parsed[this.defsec].push({}); }

        if (key == "H1") {
            // Check if this is a date!
            const date = new Date(line);
            this.pojo.logDebug("CONVERT " + line + " to date:", date)
            //            console.log("CONVERT " + line + " to date:", date)
            if (!date || (date instanceof Date && isNaN(date.valueOf()))) {
                // See if it is an ISO Date
                parsed[this.defsec][0].ISODave = line;
                parsed[this.defsec][0].Date = this.convertISODave(line);
            } else {
                parsed[this.defsec][0].Date = line;
            }
            if (!parsed[this.defsec][0].Date) {
                // Error
                this.pojo.logDebug("POSSIBLY NOT A DATE " + line)
                return false;
            } else {
                this.pojo.logDebug("HERE BE THE DATE " + parsed[this.defsec][0].Date);
            }
        } else if (key == "H2" && !parsed[this.defsec][0]._Title) {
            // The FIRST H2 in the file becomes the title of the Daily Entry
            parsed[this.defsec][0]._Title = line;
            if (!parsed[this.defsec][0].Date) {
                parsed[this.defsec][0].Date = this.getDateFromFile();
            }
            this.pojo.logDebug("HERE IS TITLE " + parsed[this.defsec][0]._Title, parsed[this.defsec][0].Date);
        } else if (key == "Image") {
            // Image, possibly with caption. Use the Obsidian plugin for image captions.
            if (line && line.imageurl) {
                let decurl;
                let urlinfo;
                try {
                    decurl = decodeURI(line.imageurl);
                    urlinfo = url.parse(decurl);
                } catch (err) {
                    this.exitNow(["ERROR decoding image uri " + err.message]);
                }
                console.log("HERE IS urlinfo", urlinfo);
                if (urlinfo.protocol == "https:" || urilinfo.protocol == "http:") {
                    if (!parsed[this.currentdb]) { parsed[this.currentdb] = []; }
                    if (!parsed[this.currentdb][this.currentidx]) { parsed[this.currentdb][this.currentidx] = {}; }

                    if (!parsed[this.currentdb][this.currentidx].Description) { parsed[this.currentdb][this.currentidx].Description = []; }
                    parsed[this.currentdb][this.currentidx].Description.push(decurl);
                } else {
                    line.imageurl = decurl;
                    this.logDebug("images", line.imageurl);

                    if (!parsed[this.defsec][0]._images) { parsed[this.defsec][0]._images = []; }
                    parsed[this.defsec][0]._images.push(line);
                }
            } else {
                this.logError("Unexpected Image type", line);
                return false;
            }
        } else if (key == "UL") {
            // Unordered List.
            if (!parsed[this.currentdb]) { parsed[this.currentdb] = []; }
            if (!parsed[this.currentdb][this.currentidx]) { parsed[this.currentdb][this.currentidx] = {}; }
            if (!parsed[this.currentdb][this.currentidx].Description) { parsed[this.currentdb][this.currentidx].Description = []; }
            parsed[this.currentdb][this.currentidx].Description.push("* " + line);
        } else if (key == "H3" || line.charAt(0) == '#') {

            //            this.pojo.logDebug("HERE IS PARSED " + this.defsec, parsed);
            if (!parsed[this.defsec][0].Date) {
                parsed[this.defsec][0].Date = this.getDateFromFile();
            }

            let pline = line;
            if (line.charAt(0) == '#') {
                pline = line.slice(1);
            }
            //            console.log("ORIG Parsing Pojo on>>" + pline + "<<");
            const pinfo = this.pojo.parsePojoLine(pline);
            //            console.log("ORIG HERE is parse pojo", pinfo);
            if (!pinfo) {
                // ERROR
                return false;
            }
            this.pojo.logDebug("Parsed Line Object", pinfo);
            const db = pinfo._database;
            _addParsed(pinfo);
            //            this.pojo.logDebug("HERE is parsed and db " + db, parsed);
            this.logDebug("parse1", "TAG PARSE with length " + parsed[db].length, pinfo);
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
            this.logDebug("parse1", "HERE is line for key " + key, line);
            //            console.log("key " + key, line);
            // See above parsing for H2 to find title of Daily Entry
            if (key == "H2") { line = "## " + line; }
            if (!parsed[this.currentdb]) { parsed[this.currentdb] = []; }
            if (!parsed[this.currentdb][this.currentidx]) { parsed[this.currentdb][this.currentidx] = {}; }

            const ainfo = this.pojo.parseForAnnotations(line);
            if (ainfo) {
                this.logDebug("parse1", "MUST add this annotation ", ainfo);
                this.trackingInfo(parsed, this.currentdb, ainfo);

                for (const k in ainfo) {
                    parsed[this.currentdb][this.currentidx][k] = ainfo[k];
                }

            } else {
                //            this.pojo.logDebug("HERE IS key " + key, lastdb, currentfile);
                //            this.pojo.logDebug(parsed[lastdb]);
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

    private parseItemDEPRECATED (parsed: object, key: string, values: string[]): boolean {

        for (const line of values) {
            if (!this.parseLineDEPRECATED(parsed, key, line)) {
                return false;
            }
        }
        return true;
    }

    private createMOCFilesDEPRECATED (bOverwrite: boolean) {

        const self = this;
        const _getMOCcontent = function (moctype: string): object {
            const moctemplate = generatePath(process.env.POJO_FOLDER, "this.settings", self.settings.subfolder_templates, moctype + ".md");
            let mdcontent;
            try {
                mdcontent = fs.readFileSync(moctemplate, 'utf8');
            } catch (err) {
                this.exitNow(["ERROR getting MOC template file for " + moctype, err.message]);
            }
            return mdcontent;
        }

        const MOCtemplate = {
            database: _getMOCcontent("database"),
            param: _getMOCcontent("param"),
            value: _getMOCcontent("value")
        }

        const _getMOCfrontmatter = function (moctype: string, dbname: string, param: string, value: string): object {

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
                this.exitNow(["Unknown MOC Type " + moctype]);
            }

            fm.push("---");
            return parseYaml(fm);
        }


        const _createMOC = async function (fname: string, moctype: string, dbname: string, param: string, value: string) {

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
            const moc = generatePath(this.settings.folder_moc, mocname + ".md");

            if (bOverwrite || !fs.existsSync(moc)) {
                // Only create if an existing file does not exist!
                const mfm = _getMOCfrontmatter(moctype, dbname, param, value);
                const md = mfm.join("\n") + "\n" + MOCtemplate[moctype];
                await this.pojo.createVaultFile(md, this.settings.folder_moc, mocname + ".md");
                fs.outputFileSync(moc, md);
            }
        };


        for (const dbname in logs.tracking) {
            const dbe = logs.tracking[dbname];
            // Create a database MOC
            _createMOC(dbname, "database", dbname);

            //        this.pojo.logDebug("DBE for " + dbname, dbe);
            for (const param in dbe) {
                const pvs = dbe[param];
                _createMOC(param, "param", dbname, param)
                for (const pv of pvs) {
                    _createMOC(pv, "value", dbname, param, pv)
                }
            }
        }
    }

    private addFrontMatterForDatabase (frontmatter: object, db: string, dbentry: object[], dbinfo: object) {

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
                        this.pojo.logDebug("Check multi value for database " + db, p, item[p]);
                        if (this.checkMultiValued(db, p, "addFrontMatterforDatabase")) {
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
                frontmatter[db] = [];
                for (const v of vals) {
                    frontmatter[db].push(`[[${v}]]`);
                }
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
                    //                this.pojo.logDebug(`Key: ${p} Value: ${value} ` + bKeyItems);
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

    private addCalloutSection (md: string[], database: string, section: object) {

        this.pojo.logDebug("ZZZZ HERE is THE SECTION for " + database, section);
        //        console.log("ZZZZ HERE is THE SECTION for " + database, section);

        // Sections (using callouts!)
        try {
            const callout = section.callout;
            database = section.database;
            const content = section.content;
            const dbinfo = this.pojo.getDatabaseInfo(database);

            md.push(`## ${database}`)
            md.push(`> [!${callout}]+ [[${database}]]`);
            this.pojo.logDebug("HERE IS DA contnetet for " + database, content);
            for (const type in content) {
                if (database == 'Tasks') {
                    if (this.settings.daily_note_tasks_include) {
                        if (!this.settings.daily_note_tasks_include.includes(type)) {
                            // Only include tasks sections listed!
                            continue;
                        }
                    }
                }
                const item = content[type];
                let hline;
                hline = `> `;
                hline += `**[[${type}]]**`;

                if (item.values && item.values.length > 0) {
                    for (const oentry of item.values) {
                        // Make any mocparams links
                        if (oentry.mocparams) {
                            for (const mp of oentry.mocparams) {
                                hline += ` **[[${mp}]]**`;
                            }
                        }
                        if (oentry.params) {
                            for (const p of oentry.params) {
                                hline += `  ${p}`;
                            }
                        }
                        md.push(hline);
                        hline = `> `;
                        if (oentry.description) {
                            for (const line of oentry.description) {
                                md.push(`> ${line}`);
                                md.push("> ");
                            }
                        }

                    }
                } else {
                    md.push(hline);
                }
            }
            md.push("");
        } catch (err) {
            this.logError("ERROR output of section ", err);
            return false;
        }
        return true;
    }

    private createNewDailyNoteMarkdown (dailynotefile: string, frontmatter: object, dailyentry: object, sections: object, footlinks: string[], imageactions: object) {

        // Create the markdown for the note
        const md = [];

        // Output the frontmatter.
        md.push("---");
        for (const fkey in frontmatter) {
            md.push(fkey + ": " + frontmatter[fkey]);
        }
        md.push("---");
        md.push(" ");

        // Output any top content for Daily Note
        if (this.settings.daily_note_add_top) {
            for (const aline of this.settings.daily_note_add_top) {
                md.push(aline);
            }
        }

        // Output the Daily Entry
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
            const refnote = dailynotefile.split(".")[0];
            for (const image of dailyentry._images) {
                if (image.caption) {
                    md.push(`![[${image.imagename}|${image.caption}]]`);
                } else {
                    md.push(`![[${image.imagename}]]`);
                }
                if (!imageactions[refnote]) { imageactions[refnote] = []; }
                imageactions[refnote].push(image);
            }
            md.push("");
        }

        if (bAddRule) {
            md.push("-----------------------------------");
        }

        // Add all the callout sections.
        //        console.log("HERE are sections", sections);
        // Add Photo Section first.
        if (sections.Photo) {
            this.addCalloutSection(md, "Photo", sections.Photo);
        }
        for (const dbname in sections) {
            if (dbname !== "Photo") {
                this.addCalloutSection(md, dbname, sections[dbname]);
            }
        }
        md.push("");

        // Add Foot Links (using Callout)
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

        // Output any bottom content for Daily Note
        if (this.settings.daily_note_add_bottom) {
            for (const aline of this.settings.daily_note_add_bottom) {
                md.push(aline);
            }
        }

        return md;
    }

    private addMarkdownCalloutSection (sections: object, date: string, db: string, dbentry: object[], dbinfo: object) {

        //        console.warn("addMarkdownCalloutSection " + db, dbentry)

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
                    content: {},
                    callout: "Info"
                };
            }
            section = sections[defcatch];
        } else {
            if (!sections[db]) {
                sections[db] = {
                    database: db,
                    content: {},
                    callout: db.toLowerCase()
                };
            }
            section = sections[db];
        }

        const _addValue = function (val, a) {
            // val can be an array or a string
            if (Array.isArray(val)) {
                a = [...a, ...val];
            } else {
                a = [...a, val];
            }
            // Remove duplicates
            return [...new Set(a)];
        }

        for (const content of dbentry) {
            const type = content[content["_typeparam"]];
            if (!section.content[type]) {
                section.content[type] = {};
            }
            if (!section.content[type].values) {
                section.content[type].values = [];
            }
            const values = section.content[type].values;
            let newval = null;
            for (const param of content["_params"]) {
                const paramval = content[param];
                this.pojo.logDebug("addMarkdownCallout with " + param, paramval);
                if (paramval) {
                    if (!newval) { newval = {}; }
                    if (param !== "Description") {
                        const mocname = this.pojo.getFieldMOCName(dbinfo, type, param, paramval);
                        if (mocname) {
                            this.pojo.logDebug("MOC for " + type + " " + param + "-> " + mocname);
                            if (!newval.mocparams) { newval.mocparams = []; }
                            newval.mocparams = _addValue(mocname, newval.mocparams);
                        } else {
                            if (!newval.params) { newval.params = []; }

                            const addval = this.pojo.displayMetaMeta(param, paramval);
                            newval.params = _addValue(addval, newval.params);
                        }
                    } else {
                        if (!newval) { newval = {}; }
                        newval.description = content[param];
                    }
                }
            }
            if (newval) { values.push(newval); }
        }

        this.pojo.logDebug("DA SECTION " + db, section);
    }

    private createNewRecords (newrecords: object[], date: string, db: string, dbentry: object[], dbinfo: object): number {

        const typeparam = dbinfo.type;

        // Note that these records will be files in the folder defined by the this.settings parameter 'subfolder_metadata'
        let nentry = 1;
        for (const item of dbentry) {
            const newrecord = {
                Database: db,
                Date: date,
                Nentry: nentry
            }
            if (db !== this.defsec && !item[typeparam]) {
                this.logError("ERROR - no type defined for dbEntry ( " + typeparam + " )", dbentry);
                break;
            }
            if (this.settings.databases_no_metadata && this.settings.databases_no_metadata.includes(db)) {
                console.log("SKIP creation of metadata record for this database " + db);
                continue;
            }
            Object.assign(newrecord, item);
            nentry++;
            newrecords.push(newrecord);
        }

        return nentry;
    }

    private addFrontMatterForEntry (dbentry: object[], tags: string[], frontmatter: object) {


        // Add Daily Note YAML entry 
        const source = dbentry[this.defsec][0].Date;

        const _getLocalDate = function (inputDate) {
            const zdate = inputDate ? new Date(inputDate) : new Date();
            const offset = zdate.getTimezoneOffset() * 60 * 1000;
            const zdatenum = zdate.getTime() + 6 * 60 * 60 * 1000 + offset;
            return new Date(zdatenum);
        }

        const newDate = _getLocalDate(source);

        //        console.log("DA DATE from " + source, newDate);
        const dow = newDate.toLocaleDateString("en-US", {
            weekday: "short"
        })
        frontmatter["Daily Note"] = newDate.toISOString().split('T')[0] + " " + dow;

        // Add always add to frontmatter from this.settings
        if (this.settings.frontmatter_always_add) {
            for (const fma in this.settings.frontmatter_always_add) {
                frontmatter[fma] = this.settings.frontmatter_always_add[fma];
            }
        }

        // Add items from this.settings for add_to_frontmatter
        if (this.settings.frontmatter_add) {
            for (const fma of this.settings.frontmatter_add) {
                const af = fma.split(":");
                // Three parameters -> Source Database/param;Field Type;Target Field
                const sr = af[0].split("/");
                if (af[0] == "Date/Now") {
                    // Just add current date and time.
                    const nowDate = new Date();
                    frontmatter[af[2]] = nowDate.toDateString() + " " + nowDate.toLocaleTimeString();
                } else if (dbentry[sr[0]]) {
                    // NOTE we only do this for ONE entry of this database type.
                    const dbe = dbentry[sr[0]][0];
                    //                    this.pojo.logDebug("DATABASE ENTRY", dbe);
                    const source = dbe[sr[1]];
                    const action = af[1];
                    if (action == 'Date') {
                        if (sr[1] == "Now") {
                            frontmatter[af[2]] = newDate.toDateString() + " " + newDate.toLocaleTimeString();
                        } else {
                            frontmatter[af[2]] = newDate.toISOString().split('T')[0];
                        }
                    } else if (action == 'String') {
                        frontmatter[af[2]] = source;
                    } else if (action == 'DatePlus') {
                        // Going to create a whole set of Frontmatter fields based on dateplus_to_frontmatter
                        // source will be date in format YYYY-MM-DD
                        const adates = source.split("-");
                        const year = adates[0];
                        const shortyear = adates[0] - 2000;
                        const month = adates[1];
                        const day = adates[2];

                        frontmatter[af[2]] = source;
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
                                        frontmatter[dp] = season;
                                        break;
                                    case 'Quarter':
                                        const q = Math.floor((newDate.getMonth() / 3) + 1);
                                        frontmatter[dp] = "Q" + q;
                                        break;
                                    case 'Month':
                                        const ms = newDate.toLocaleDateString("en-US", {
                                            month: "short"
                                        })
                                        frontmatter[dp] = ms;
                                        break;
                                    case 'YY-MM':
                                        const yr = newDate.toLocaleDateString("en-US", {
                                            year: "2-digit"
                                        })
                                        const mn = newDate.toLocaleDateString("en-US", {
                                            month: "2-digit"
                                        })
                                        frontmatter[dp] = yr + "-" + mn;
                                        break;
                                    case 'YY-WK':
                                        const yr2 = newDate.toLocaleDateString("en-US", {
                                            year: "2-digit"
                                        })
                                        const onejan = new Date(newDate.getFullYear(), 0, 1);
                                        const week = Math.ceil((((newDate.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
                                        let wk = "" + week;
                                        if (week < 10) { wk = "0" + wk; }
                                        frontmatter[dp] = yr2 + "-" + wk;
                                        break;
                                    case 'Day of Week':
                                        const wd = newDate.toLocaleDateString("en-US", {
                                            weekday: "short"
                                        })
                                        frontmatter[dp] = wd;
                                        break;
                                    case 'ISODave':
                                        frontmatter[dp] = this.getISODave(newDate);
                                        //                                        console.log("ISODave found " + dp, frontmatter[dp]);
                                        break;
                                    default:
                                        this.logError("ERROR in dateplus_to_frontmatter. Not recognized option", dp);
                                }
                            }
                        }
                    } else {
                        this.logError("Unsupported add_to_frontmatter action: " + action, fma);
                        process.exit(-1);
                    }
                }
            }
        }

        // Add reference to all used databases and collect what metadata is used in note
        const dbs = [];
        const dbesummary = {};
        for (const db in dbentry) {
            if (db !== this.defsec) {
                if (this.settings.databases_no_callouts && this.settings.databases_no_callouts.includes(db)) {
                    console.log("EXCLUDE db summary from metainfo property for " + db);
                } else {

                    dbs.push(db);

                    const dba = dbentry[db];
                    if (!dbesummary[db]) { dbesummary[db] = []; }
                    for (const me of dba) {
                        const sume = {};
                        for (const mekey in me) {
                            // Save all keys not starting with _ and exclude Description
                            if (mekey.charAt(0) !== "_" && mekey !== "Description") {
                                sume[mekey] = me[mekey];
                            }
                        }
                        dbesummary[db].push(sume);
                    }
                }
            }
        }

        if (dbs.length > 0) {
            frontmatter["Databases"] = "[" + dbs.join(", ") + "]";
        }

        if (tags && tags.length > 0) {
            const tagsn = tags.filter(el => {
                if (this.settings.databases_no_callouts) {
                    const dbt = el.split("/")[0];
                    if (this.settings.databases_no_callouts.includes(dbt)) {
                        return false;
                    } else {
                        return true;
                    }
                } else {
                    return true;
                }
            })
            frontmatter["tags"] = "[" + tagsn.join(", ") + "]";
        }

        frontmatter["metainfo"] = `${JSON.stringify(dbesummary)}`;
    }

    private getISODave (dt: Date): string {
        const mnabbs = ["ja", "fe", "mr", "ap", "my", "jn",
            "jl", "au", "se", "oc", "nv", "de"];
        const mnth = mnabbs[dt.getMonth()];

        const daysofweek = ["U", "M", "T", "W", "R", "F", "S"];
        const dw = daysofweek[dt.getDay()];

        const isodave = (dt.getFullYear() - 2000) + mnth + dt.getDate() + dw;
        return isodave;
    }

    private convertISODave (dddate: string): string {

        const self = this;

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
                    self.pojo.logError("ERROR on month!!! ISODave1 " + mn + " ->" + ddate);
                    self.logError("ERROR on H1 as date " + mn, dddate);
                    return null;
            }
            const rem = ddate.substring(1, len - 3);
            const dom = parseInt(rem);
            if (isNaN(dom) || isNaN(yr)) {
                self.logError("ERROR6 getting date from " + dddate, dddate);
                return null;
            }

            let dayom = dom;
            if (dom <= 9) {
                dayom = "0" + dom;
            }

            //		this.pojo.logDebug("Dave Date 1.0: " + ddate);
            //		this.pojo.logDebug(yr + "/" + month + "/" + dayom);

            const isodave1 = yr + "-" + month + "-" + dayom;
            //            console.log("ISODAVE1", ddate, isodave1);
            return isodave1;
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
                    self.pojo.logError("ERROR on month!!! ISODave2 " + mn + " ->" + ddate);
                    self.logError("ERROR on H1 as date " + mn, dddate);
                    return null;
            }
            const rem = ddate.slice(4);
            const dom = parseInt(rem);
            if (isNaN(dom) || isNaN(yr)) {
                self.logError("ERROR4 getting date from " + dddate, dddate);
                return null;
            }

            let dayom = dom;
            if (dom <= 9) {
                dayom = "0" + dom;
            }

            const dow = ddate.charAt(ddate.length - 1);

            //		this.pojo.logDebug("Dave Date 2.0: " + ddate);
            //		this.pojo.logDebug(yr + "/" + month + "/" + dayom);

            const isodave2 = yr + "-" + month + "-" + dayom;
            //            console.log("ISODAVE2", ddate, isodave2);
            return isodave2;
        }

        if (isNaN(parseInt(dddate[0], 10))) {
            return _ISODave1(dddate);
        } else {
            return _ISODave2(dddate);
        }
    }

    private async writeOutMetadataRecords (dailynotefile: string, newrecords: object[]) {

        const self = this;
        const dailynoteref = dailynotefile.split(".")[0];
        console.log("writeOutMetadataRecords " + dailynoteref, newrecords);
        this.pojo.logDebug("writeOutMetadataRecords here... " + dailynotefile, newrecords);


        const _createNewMetadataRecord = async function (record: object, typename: string, rparams: string[]): void {

            const md = [];
            md.push("---");
            md.push("Daily Note: " + dailynoteref);
            md.push("Database: " + record.Database);
            md.push("Date: " + record.Date);
            md.push(`Type: ${record[typename]}`);
            if (typename !== "Type") {
                md.push(`${typename}: ${record[typename]}`);
            }
            if (rparams && rparams.length > 0) {
                for (const pname of rparams) {
                    if (pname !== typename) {
                        const pvalue = record[pname];
                        if (Array.isArray(pvalue)) {
                            md.push(`${pname}: [${pvalue}]`);
                        } else {
                            md.push(`${pname}: ${pvalue}`);
                        }
                    }
                }
            }
            let contentStatus = "NO";
            if (record.Description) {
                contentStatus = "YES";
            }
            md.push("Description: " + contentStatus);
            md.push("---");
            md.push("");
            md.push(record.Database + " " + record[typename] + " on " + record.Date);
            if (record.Description) {
                md.push("");
                for (const line of record.Description) {
                    md.push(line);
                    md.push("");
                }
                md.push("");
            }

            const filename = record.Database + "-" + record.Date + "-" + record.Nentry + ".md";
            const foldername = generatePath(self.settings.folder_pojo, self.settings.subfolder_metadata);
            await self.pojo.createVaultFile(md.join("\n"), foldername, filename, true);
        };

        try {
            for (const record of newrecords) {
                if (record.Database !== this.defsec) {

                    const dbinfo = this.pojo.getDatabaseInfo(record.Database);

                    const rparams = [];

                    for (const p in record) {
                        if (record._params.includes(p)) {
                            if (this.checkParamOutputMetadata(p)) {
                                rparams.push(p);
                            }
                        }
                    }

                    await _createNewMetadataRecord(record, dbinfo.type, rparams);
                }
            }
        } catch (err) {
            this.exitNow(["ERROR writing out record " + err.message]);
        }
    }

    private getDateFromFile (inputfile: TFile): string {
        // Date returned should be in the format YYYY-MM-DD
        //        this.pojo.logDebug("HERE IS THE currentfile", this.currentfile);

        let datename = inputfile ? inputfile.basename : this.currentfile.basename;

        const lastchar = datename.charAt(datename.length - 1);
        if (lastchar == "⚡") {
            datename = datename.slice(0, datename.length - 2);
        }

        let ddate = new Date(datename);
        let bValid = false;

        if (ddate == "Invalid Date") {
            // Perhaps trailing day of week string? Remove and try again.
            const a = datename.split(" ");
            a.pop();
            ddate = new Date(a.join(" "));
            if (ddate != "Invalid Date") {
                bValid = true;
                datename = a.join(" ");
            }
        } else {
            bValid = true;
        }

        let retval = "ERR777";
        if (bValid) {
            retval = datename;
        } else {
            this.pojo.logError("ERROR - filename NOT a date! " + datename);
        }

        //        console.log("DATE FOIUND FILE " + retval, this.currentfile.basename);
        return retval;
    }

    private checkParamOutputMetadata (key: string): boolean {
        if (this.settings.params_not_metadata) {
            if (this.settings.params_not_metadata.includes(key)) { return false; }
        }
        return true;
    }

    private trackingInfo (parsed, db, robj): object {

        this.pojo.logDebug("Called trackingInfo!", parsed, db, robj);
        this.pojo.logDebug("NOT IMPLEMENTED FOR NOW");
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
        //    this.pojo.logDebug("ADDING TRACKING FOR " + parsed[this.defsec][0].Date, this.memoizeTracking);

        const _checkIfExistsAlready = function (valsNow, valsNew, key) {
            //        this.pojo.logDebug('KEY is ' + key, valsNow, valsNew);
            //        this.pojo.logDebug("INPUT OBJ ", robj);
            // Check if we encountered this before in this import
            // Check if we encountered this before in previous imports
            let pos = 0;
            for (const k of valsNow) {
                const ka = k.split("=");
                let count = parseInt(ka[1], 10);
                if (isNaN(count)) {
                    this.pojo.logError("ERROR ERROR on number", valsNow);
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
                    this.pojo.logDebug("BAD NEWS on newStuff!", valsNew);
                }
                const ka = k.split("=");
                let count = parseInt(ka[1], 10);
                if (isNaN(count)) {
                    this.pojo.logError("ERROR ERROR on number", valsNew);
                }
                if (ka[0] == key) {
                    count++;
                    const newval = key + "=" + count;
                    return { exists: 2, index: pos, newval: newval };
                }
                pos++;
            }


            //        this.pojo.logDebug("HERE NEW ITEM for key " + key + " -> " );

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
                    this.logError("ERROR with tracked content. Too many words to be included! Perhaps a mistake in the entry for " + p, robj[p]);
                    this.logError("ABOVE was while parsing the file " + currentfile);
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
                    this.logError("ERROR encountered checking if tracking item exists. Returned " + exists);
                }
            }
        }
    }
}





