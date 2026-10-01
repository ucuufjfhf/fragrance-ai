#!/usr/bin/env node
/**
 * Fiage pilot sheet validator (research utility, repository-external).
 *
 * Checks: required 19 IDs present exactly once; no missing rows; allowed band /
 * confidence / M3-status values; scores are integers 0-100 or blank; and that no
 * protected production file was modified (checksum compare).
 *
 * It does NOT compute recommendation/matching scores and does NOT write anything.
 * Usage: node validate.cjs [path-to-sheet.csv ...]   (default: template + A + B)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REQUIRED_IDS = [
  "demo-01","demo-05","demo-11","demo-14","demo-15","demo-16","demo-17","demo-18",
  "demo-26","demo-28","demo-42","demo-43","demo-44","demo-48","demo-50","demo-51",
  "demo-54","demo-55","demo-59",
];

const BANDS = new Set(["0-20","21-40","41-60","61-80","81-100"]);
const CONF = new Set(["HIGH","MEDIUM","LOW"]);
const M3 = new Set(["OBSERVABLE","NOT_OBSERVABLE"]);
const VALUELESS = new Set(["", undefined, null]);

// SHA-256 of protected files as of baseline HEAD 955b49c (must not change).
const PROTECTED = {
  "package.json": "a9249029e39b95f60f051c7bbe210522038dc68dfa103a1e9dc70a5bc1666d89",
  "data/curated-demo-catalog.json": "28d29b8745a29957621846d0e1ceefbb875dbbf2c804daa4038c01b482ed2212",
  "data/fragrantica/reference.json": "9d1eb011977345d9812b045de88d339ac7a47ac48c6653204410b1861f87b707",
  "lib/fragrance/axis-derivation.ts": "e9bd45dd2163257ddfac4526d4a42928f860c9d8b9a28aa8685aef4ee849fa8a",
  "lib/matching/engine.ts": "42c4374e42542e10f3453b01f82ea4b8fc21074f96253c79762cc9d3a8093364",
  "lib/matching/score.ts": "8c37c260700101da0867ff641c0688ca452c922c443066fa6d722765e2c5b71b",
  "lib/fragrance/profile.ts": "2c0c9f8a99d140e3c429f0e0516f210346e47ddfa7b7412a5c769edf4e74a454",
};
const REPO = "/home/daytona/codebase";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function checkSheet(file) {
  const errors = [];
  if (!fs.existsSync(file)) return [`${file}: file not found`];
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (rows.length < 2) return [`${file}: no data rows`];
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  for (const need of ["id","brand","name","mysterious_score","mysterious_band",
    "mysterious_confidence","mysterious_m3_status","elegant_score","elegant_band",
    "elegant_confidence","notes"]) {
    if (col(need) === -1) errors.push(`${file}: missing column "${need}"`);
  }
  if (errors.length) return errors;

  const data = rows.slice(1).filter((r) => (r[col("id")] || "").trim() !== "");
  const seen = new Map();
  for (const r of data) {
    const id = r[col("id")].trim();
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const id of REQUIRED_IDS) {
    const n = seen.get(id) || 0;
    if (n === 0) errors.push(`${file}: missing required id ${id}`);
    if (n > 1) errors.push(`${file}: duplicate id ${id} (${n}x)`);
  }
  for (const [id, n] of seen) if (!REQUIRED_IDS.includes(id)) errors.push(`${file}: unexpected id ${id}`);
  if (data.length !== REQUIRED_IDS.length) errors.push(`${file}: expected ${REQUIRED_IDS.length} data rows, found ${data.length}`);

  for (const r of data) {
    const id = r[col("id")];
    for (const [bandCol, dim] of [["mysterious_band","mysterious"],["elegant_band","elegant"]]) {
      const v = (r[col(bandCol)] || "").trim();
      if (!VALUELESS.has(v) && !BANDS.has(v)) errors.push(`${file}: ${id} ${dim}_band invalid "${v}"`);
    }
    for (const [cCol, dim] of [["mysterious_confidence","mysterious"],["elegant_confidence","elegant"]]) {
      const v = (r[col(cCol)] || "").trim();
      if (!VALUELESS.has(v) && !CONF.has(v)) errors.push(`${file}: ${id} ${dim}_confidence invalid "${v}"`);
    }
    const m3 = (r[col("mysterious_m3_status")] || "").trim();
    if (!M3.has(m3)) errors.push(`${file}: ${id} mysterious_m3_status invalid "${m3}"`);
    for (const [sCol, dim] of [["mysterious_score","mysterious"],["elegant_score","elegant"]]) {
      const v = (r[col(sCol)] || "").trim();
      if (VALUELESS.has(v)) continue;
      if (!/^\d+$/.test(v)) errors.push(`${file}: ${id} ${dim}_score not an integer "${v}"`);
      else { const n = Number(v); if (n < 0 || n > 100) errors.push(`${file}: ${id} ${dim}_score out of 0-100 (${n})`); }
    }
  }
  if (!errors.length) console.log(`  OK  ${path.basename(file)} — 19/19 ids, valid domains`);
  return errors;
}

function checkProtected() {
  const errors = [];
  for (const [rel, expected] of Object.entries(PROTECTED)) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) { errors.push(`protected file missing: ${rel}`); continue; }
    const got = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    if (got !== expected) errors.push(`protected file MODIFIED: ${rel} (${got})`);
  }
  if (!errors.length) console.log("  OK  protected production files unchanged (checksums match baseline)");
  return errors;
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["annotation-template.csv","annotator-A.csv","annotator-B.csv"].map((f) => path.join("/tmp/fiage-pilot", f));

let all = [];
console.log("Fiage pilot validation");
for (const t of targets) all = all.concat(checkSheet(t));
all = all.concat(checkProtected());

const distinct = [...new Set(all)];
if (distinct.length) { console.log("\nFAIL:"); for (const e of distinct) console.log("  - " + e); process.exit(1); }
console.log("\nPASS: all checks passed.");
