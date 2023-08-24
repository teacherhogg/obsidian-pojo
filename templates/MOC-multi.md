---
Type: MOC-Template
POJO: 0.5
metadata: POJO/metadata
Category: MOC-multi
mocname: TBD
tables: []
---

```dataviewjs
const fm = dv.current().file.frontmatter;

// POJO_VARS_HERE

const self = this;

let viewprefix = [
	"Date", "Daily Note"
];
let viewsuffix = [
	"Notes"
];

const outputCallout = function() {
	let cel = dv.el("div", "", { cls: "callout is-collapsible is-collapsed"});
	let title = cel.appendChild("div", "", {cls: "callout-title"});
	title.appendChild("div","KEY TITLE",{cls: "callout-title-inner"});
	title.appendChild("div","",{cls: "callout-fold"})
	let contnt = cel.appendChild("div", "", {cls: "callout-content"});
	contnt.appendChild("p","HERE IT IS!!!");
	return cel;
}

const getPages = function(folder, dbname, vparams, fkey, fkeyv, fskey, fskeyv) {

	const pages=dv.pages(`"${folder}"`).where( b => {
		if (b["Database"] == dbname ) {
			if (fkey) {
				let fvaluea = [b[fkey]];
				if (Array.isArray(b[fkey])) {
					fvaluea = b[fkey];
				}
				for (let fval of fvaluea) {
					if (fval == fkeyv) {
						if (fskey) {
							let fsubvaluea = [b[fskey]];
							if (Array.isArray(b[fskey])) {
								fsubvaluea = b[fskey];
							}
							for (let fsubval of fsubvaluea) {
								if (fsubval == fskeyv) {
									return true;
								}
							}
							return false;
						} else {
		   					// No subfilterkey
							return true;
						}
					}
				}
				return false;
			} else {
				return true;
			}
		} else {
			return false;
		}
	});

	return pages;
}

const drawHeatMap = async function(pages, yr, db, vp, fk, fv, fsk, fsv) {
	const calendarData = {
		year: yr,
		entries: []
	}

	dv.span(yr + ` ${db} ${fv}`);
	if (pages && pages.values && pages.values.length > 0) {
		for (let val of pages.values) {
			if (val.date.year == yr) {
				const datestr = val.date.toString().split("T")[0];

				calendarData.entries.push({
					date: datestr,
					content: await dv.span(`[${val.date.day}](${val.file.name})`),
					intensity: 50
				})
			}
		}
	}

	renderHeatmapCalendar(self.container, calendarData);
}

const drawTable = function(pages, vparams) {

	let viewp = [...viewprefix, ...vparams, ...viewsuffix];

	dv.table(viewp, pages
		.sort(b => b["Date"], "desc")
		.map(b => {
			let a = [];
			// First column is always Date
			a.push(b["Date"]);

			// Second column is Daily Note reference
			let dn = b["Daily Note"];
			if (!dn) {
				a.push("");
			} else {
				a.push(`[[${dn}]]`);
			}

			// Now the additional parameters
			const len = vparams.length;
			for (let i=0; i<len; i++) {
				const vpval = b[vparams[i]];
//				console.log("HERE is the " + b[vparams[i]], vpval);
				if (!vpval) {
					a.push("");
				} else if (Array.isArray(vpval)) {
					let valss = "";
					for (let vv of vpval) {
						valss += `[[${vv}]] `;
					}
					a.push(valss);
				} else {
					a.push(`[[${vpval}]]`);
				}
			}

			// last column is the link to the metadata file (if has content)
			if (b["Description"] == "YES") {
				a.push(`[[${b.file.name}]]`);
			} else {
				a.push("");
			}

			return a;
		})
	);
}

let tb = tabledata;
//for (const tb of fm.tables) {
	const pages = getPages(fm.metadata, tb.database, tb.viewparams, tb.filterkey, tb.filtervalue, tb.subfilterkey, tb.subfiltervalue);

	await drawHeatMap(pages, 2023, tb.database, tb.viewparams, tb.filterkey, tb.filtervalue, tb.subfilterkey, tb.subfiltervalue);

	drawTable(pages, tb.viewparams);
//}

```
