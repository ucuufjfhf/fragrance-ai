const fs = require("fs");
const rows = require("/tmp/fiage-pilot/source-data.json");

const HEADER = [
  "id","brand","name","accords","fragrance_notes",
  "mysterious_score","mysterious_band","mysterious_confidence","mysterious_m3_status",
  "elegant_score","elegant_band","elegant_confidence","notes",
];

const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function line(r) {
  return [
    r.id, r.brand, r.name, r.accords.join("; "), r.notes.join("; "),
    "", "", "", "NOT_OBSERVABLE",
    "", "", "", "",
  ].map(esc).join(",");
}

const csv = [HEADER.join(","), ...rows.map(line)].join("\n") + "\n";
const ids = rows.map((r) => r.id).sort().join(",").replace(/,/g, "-");

fs.writeFileSync("/tmp/fiage-pilot/annotation-template.csv", csv);
fs.writeFileSync("/tmp/fiage-pilot/annotator-A.csv", csv);
fs.writeFileSync("/tmp/fiage-pilot/annotator-B.csv", csv);
console.log("wrote template + A + B; rows=" + rows.length);
