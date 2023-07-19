---
Type: MOC-Template
POJO: 0.5
databases: POJO/databases
Category: MOC-database
database: TBD
viewparams: [TBD]
---
```dataviewjs
const fm = dv.current().file.frontmatter;
let viewparams = fm.viewparams;

const pages=dv.pages(`"${fm.databases}"`).where( b => {
	if (b["_database"] && b["_database"]["Database"] == fm.database) {
		return true;
	} else {
		return false;
	}
});
//console.log("HERE pages eh", pages);

let viewprefix = [
	"Date", "Daily Note"
];
let viewsuffix = [
	"Notes"
];
let viewp = [...viewprefix, ...viewparams, ...viewsuffix];
//console.log("HERE is the viewp", viewp);

dv.table(viewp, pages
	.sort(b => b["_database"]["Database"])
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
		const len = viewparams.length;
		for (let i=0; i<len; i++) {
			const vpval = b[viewparams[i]];
			console.log("HERE is the " + b[viewparams[i]], vpval);
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

```
