// Checks docs/offers.json using the same rules the public page applies.
// Run: node scripts/validate-offers.mjs   (exits 1 on any problem)
// Also warns (without failing) about live offers that look stale or
// still carry placeholder markers.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const RH = require("../docs/common.js");

const file = new URL("../docs/offers.json", import.meta.url);
let data;
try { data = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error("offers.json isn't valid JSON: " + e.message); process.exit(1); }

const { offers, problems } = RH.checkOffers(data);
const today = RH.todayISO();
const STALE_DAYS = 30;

for (const p of problems) console.error("ERROR  " + p);
for (const o of offers) {
  if (RH.isExpired(o, today)) { console.log(`info   ${o.id}: expired ${o.expires}, hidden automatically`); continue; }
  if (o.placeholder) console.log(`info   ${o.id}: placeholder (shown, but its link is disabled)`);
  else {
    if (!o.checked) console.warn(`warn   ${o.id}: no "checked" date, so visitors can't see when terms were last verified`);
    else if (RH.daysBetween(o.checked, today) > STALE_DAYS) console.warn(`warn   ${o.id}: terms last checked ${o.checked} (${RH.daysBetween(o.checked, today)} days ago)`);
    if (/example\.com/.test(o.link)) console.warn(`warn   ${o.id}: link still points at example.com`);
  }
}
console.log(`\n${offers.length} valid, ${problems.length} problem(s), ${offers.filter((o) => !RH.isExpired(o, today)).length} live today (${today})`);
process.exit(problems.length ? 1 : 0);
