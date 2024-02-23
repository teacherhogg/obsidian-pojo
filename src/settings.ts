import { Vault } from "obsidian";

export interface PojoSettings {
    version_settings: string,
    version_manifest: string,
    isDesktop: boolean,
    metameta: object,
    characterRegex: string,
    maxLookBackDistance: number,
    minWordLength: number,
    minWordTriggerLength: number,
    frontmatter_always_add: object,
    frontmatter_always_add_moc: string[],
    frontmatter_add: string[],
    frontmatter_dateplus: string[],
    frontmatter_params_include: string[],
    frontmatter_params_exclude: string[],
    sections_verbose: boolean,
    links_params_exclude: string[],
    daily_entry_h3: string[],
    params_not_metadata: string[],
    folder_attachments: string,
    folder_daily_notes: string,
    folder_moc: string,
    folder_pojo: string,
    subfolder_databases: string,
    subfolder_archived_daily_notes: string,
    subfolder_metadata: string,
    subfolder_templates: string,
    markdown_rename: string,
    split_param: string;
    delete_meta: string[],
    donotcreatefiles: false,
    donotcopyattachments: false,
    import_folder: string,
    timelines: object
}

export const DEFAULT_SETTINGS: PojoSettings = {
    "version_settings": "23ap23U 08:00",
    "isDesktop": true,
    "frontmatter_always_add": {
        "Type": "Diary",
    },
    "frontmatter_always_add_moc": ["Type: MOC"],
    "characterRegex": "a-zA-ZöäüÖÄÜß",
    "maxLookBackDistance": 50,
    "minWordLength": 2,
    "minWordTriggerLength": 3,
    "timelines": {
        "timeline_enabled": false,
        "timeline_svg": false,
        "timeline_png": false,
        "include_photos": true,
        "subfolder_timelines": "timelines",
        "daystart": "5:00",
        "timewidth": 75,
        "labelspace": 40,
        "event_order": true,
        "default_width": 600,
        "min_width": 150,
        "min_duration": 30,
        "event_colors": ""
    },
    "metameta": {
        "Start Time": {
            "type": "start-time",
            "display": "|⏰",
            "units": ["", "s"]
        },
        "Duration": {
            "type": "duration",
            "units": ["", "h", "hr", "min", "m"]
        },
        "End Time": {
            "type": "end-time",
            "display": "⏰|",
            "units": ["e", "end"]
        },
        "Happiness": {
            "type": "scale",
            "min": 1,
            "max": 10,
            "display": "⭐",
            "units": ["j", "joy"]
        },
        "Energy": {
            "type": "scale",
            "min": 1,
            "max": 10,
            "display": "⚡",
            "units": ["z"]
        }
    },
    "frontmatter_add": [
        "Daily Entry/Now:Date:Last Converted",
        "Daily Entry/Date:DatePlus:Diary Date"
    ],
    "frontmatter_dateplus": [
        "Season",
        "Quarter",
        "Month",
        "YY-MM",
        "YY-WK",
        "Day of Week",
        "ISODave"
    ],
    "frontmatter_params_include": [
        "Learning:Author",
        "Medical:Subtype",
        "Project:Subtype",
        "Entertainment:Companions",
        "Entertainment:Location",
        "Productivity:Category",
        "Exercise:Companions",
        "Exercise:Location",
        "Active:Companions",
        "Active:Location"
    ],
    "frontmatter_params_exclude": ["Tasks", "Metadata:Value"],
    "sections_verbose": true,
    "links_params_exclude": [
        "Description",
        "URL",
        "Value",
        "Daily Entry",
        "ISOdave",
        "Date"
    ],
    "daily_entry_h3": ["Daily Entry"],
    "params_not_metadata": ["Description"],
    "folder_attachments": "attachments",
    "folder_moc": "automoc",
    "folder_daily_notes": "Daily Notes",
    "folder_pojo": "POJO",
    "subfolder_databases": "databases",
    "subfolder_archived_daily_notes": "archived",
    "subfolder_metadata": "metadata",
    "subfolder_templates": "templates",
    "markdown_rename": "Diary Date",
    "split_param": ";",
    "delete_meta": ["Event Type"],
    "donotcreatefiles": false,
    "donotcopyattachments": false,
    "import_folder": "Daily Notes"
}

export function generatePath (...path: string[]): string {
    return path.join("/");
}

export function pluginPath (vault: Vault, ...path: string[]): string {
    return vault.configDir + "/plugins/obsidian-pojo/" + path.join("/");
}
