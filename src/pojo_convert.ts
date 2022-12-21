import { triggerAsyncId } from "async_hooks";
import { App } from "obsidian";

const defcatch = "Daily Entry";
const POJO_TAG_PREFIX_REGEX = /^#(?!#)/;
const POJO_H3_PREFIX_REGEX = /^### /;


export class PojoConvert {

    private settings: object;
    private app: App;
    private loadedPojoDB: Record<string, never>;

    constructor(app: App, pojosettings: object) {
        this.app = app;
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


    parseTagLine (tagline: string): object {

        // Tags do not have spaces in the reference except for Daily Entry
        if (tagline == defcatch) {
            return {
                canonical: defcatch,
                database: defcatch
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

        // Check if the type is limited to a set of allowed values
        if (dbinfo["type-values"]) {
            const allowed = dbinfo["type-values"].find(el => el.toLowerCase() == rtag.type.toLowerCase());
            if (!allowed) {
                const emsg = "INVALID type value for database " + rtag.database + " ref " + rtag.nref;
                this.logError(emsg, rtag.type);
                console.error(emsg, rtag.type);
                exitNow();
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
                    this.logError("ERROR in tag params. More than expected for tag ", aparams, dbinfo.params);
                    return null;
                } else {
                    for (let p of aparams) {
                        if (p) {
                            p = p.trim();
                            const allowedv = `param${n + 1}-values`;
                            if (dbinfo[allowedv] && (dbinfo[allowedv]["_ALL"] || dbinfo[allowedv][robj[dbinfo.type]])) {
                                const alla = dbinfo[allowedv]["_ALL"] ? dbinfo[allowedv]["_ALL"] : dbinfo[allowedv][robj[dbinfo.type]];
                                const allowedp = alla.find(el => {
                                    if (el.toLowerCase() == p.toLowerCase()) {
                                        return true;
                                    }
                                    return false;
                                });
                                if (!allowedp) {
                                    const emsg = "INVALID parameter value for database " + rtag.database + " ref " + rtag.nref + " pvalue : " + p;
                                    this.logError(emsg, alla);
                                    console.error(emsg, alla);
                                    exitNow();
                                } else {
                                    p = allowedp;
                                }
                            }
                            if (dbinfo.params[n] == "Description") {
                                if (!robj.Description) { robj.Description = []; }
                                robj.Description.push(p.trim());
                            } else {
                                // Deal with if multi-valued
                                if (this.checkMultiValued(rtag.data, dbinfo.params[n])) {
                                    const va = p.split(",");
                                    for (let i = 0; i < va.length; i++) {
                                        va[i] = normalizeValue(va[i]);
                                    }
                                    robj[dbinfo.params[n]] = va.join(",");
                                } else {
                                    robj[dbinfo.params[n]] = this.normalizeValue(p);
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

        return robj;
    }

    private logError (name: string, dobj: object) {
        //        logs.errors.push(name);
        //        if (dobj) {
        //            logs.errors.push(JSON.stringify(dobj, null, 3));
        //        }
        console.error(name, dobj);
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

    private normalizeReference (ref) {
        // Tags and Header3 sections are case insensitive but normalized to a canonical form.
        const a = ref.split("/");
        if (a.length == 1) {
            // NOT actually a database name, just the normalized value
            return this.normalizeValue(ref);
        } else {
            const norm = [];
            for (const w of a) {
                norm.push(this.normalizeValue(w));
            }
            const nref = norm.join("/");
            const database = norm[0];
            const type = norm[1];
            return { database, type, nref };
        }
    }

    private checkMultiValued (key) {
        if (this.settings.params_not_multi) {
            if (this.settings.params_not_multi.includes(key)) { return false; }
        }
    }
}