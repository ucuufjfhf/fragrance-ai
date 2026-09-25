"""One-off generator: converts the Kaggle Fragrantica CSV into the compact
reference JSON used by the AI enrichment grounding (lib/ai/reference-lookup.ts).

Run from the project root:
    python scripts/generate-reference-data.py

Reads  data/fragrantica/fra_cleaned.csv  →  writes data/fragrantica/reference.json
"""

import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "..", "data", "fragrantica", "fra_cleaned.csv")
OUT_PATH = os.path.join(HERE, "..", "data", "fragrantica", "reference.json")

ACCORD_COLUMNS = [
    "mainaccord1",
    "mainaccord2",
    "mainaccord3",
    "mainaccord4",
    "mainaccord5",
]
NOTE_SECTIONS = ["Top", "Middle", "Base"]
GENDER_MAP = {"men": "MEN", "women": "WOMEN", "unisex": "UNISEX"}


def slug(value: str) -> str:
    s = value.strip().lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def parse_rating(value: str):
    try:
        return float(value.strip().replace(",", "."))
    except ValueError:
        return None


def main() -> None:
    with open(CSV_PATH, encoding="cp1252", newline="") as handle:
        reader = csv.reader(handle, delimiter=";")
        header = next(reader)
        rows = list(reader)

    index = {name: position for position, name in enumerate(header)}

    entries = {}
    for row in rows:
        brand = row[index["Brand"]].strip()
        name = row[index["Perfume"]].strip()
        if not brand or not name:
            continue

        accords = []
        for column in ACCORD_COLUMNS:
            value = row[index[column]].strip()
            if value and value.lower() != "unknown" and value not in accords:
                accords.append(value)
        if not accords:
            continue  # nothing to ground on

        notes = []
        for column in NOTE_SECTIONS:
            value = row[index[column]].strip()
            if not value or value.lower() == "unknown":
                continue
            for note in value.split(","):
                note = note.strip()
                if note and note.lower() != "unknown" and note not in notes:
                    notes.append(note)

        rating = parse_rating(row[index["Rating Value"]])
        rating_count_raw = row[index["Rating Count"]].strip()
        rating_count = int(rating_count_raw) if rating_count_raw.isdigit() else None

        entry = {
            "b": brand,
            "n": name,
            "g": GENDER_MAP.get(row[index["Gender"]].strip(), "UNISEX"),
            "t": notes,
            "a": accords,
            "y": row[index["Year"]].strip() or None,
            "r": rating,
            "rc": rating_count,
        }

        key = (slug(brand), slug(name))
        existing = entries.get(key)
        if existing is None:
            entries[key] = entry
            continue

        # Duplicate slugs: keep the row with the stronger community signal.
        old_score = (existing["r"] if existing["r"] is not None else -1.0, existing["rc"] or 0)
        new_score = (rating if rating is not None else -1.0, rating_count or 0)
        if new_score > old_score:
            entries[key] = entry

    data = {
        "_meta": {
            "source": "Kaggle Fragrantica.com Fragrance Dataset (fra_cleaned.csv, 2024-09)",
            "generated": "2026-09-25",
            "purpose": "Internal AI enrichment grounding ONLY - never shown to customers, never store inventory",
            "license": "Verify Kaggle dataset license before any production/commercial use",
            "rows": len(entries),
        },
        "accords": sorted({accord for entry in entries.values() for accord in entry["a"]}),
        "entries": [
            {
                "b": entry["b"],
                "n": entry["n"],
                "g": entry["g"],
                "t": entry["t"],
                "a": entry["a"],
                "y": entry["y"],
                "r": entry["r"],
                "rc": entry["rc"],
            }
            for entry in entries.values()
        ],
    }

    with open(OUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(OUT_PATH)
    print(f"entries: {len(entries)}")
    print(f"accord vocabulary: {len(data['accords'])} labels")
    print(f"reference.json: {size} bytes ({size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
