# Famous-perfume demo dataset

`famous-perfumes-100.csv` — 100 globally known perfumes for the demo store
`store-demo-perfume-shop`, imported through the existing admin CSV import
(`lib/admin/csv/*`), not through ad-hoc SQL.

## Where the facts come from

- **name / brand / gender / notes / accords** — resolved from the bundled
  reference dataset (`data/fragrantica/reference.json`, Kaggle Fragrantica
  dump) through the hand-audited mapping in `data/curated-demo-catalog.json`.
  Nothing was invented: each row names a real perfume and carries that
  dataset's notes verbatim.
- **family** — the perfume's primary (first) published accord from the same
  dataset.
- **season / occasion** — intentionally left empty: only filled when clearly
  established, and it is not established for these rows.
- **productUrl / imageUrl** — intentionally empty. No merchant or brand URL
  was verifiable from the data available here, so the storefront falls back to
  the existing abstract artwork. Do not guess or scrape URLs into this file.
- **price** — illustrative demo pricing in Toman (prestige / designer /
  accessible tiers). This is demo merchandising data, not a real price list;
  `currency` is written by the import path from `STORE_CURRENCY`.

## The nine axes

`FragranceProfile` stores nine required 0–100 integers, but only five are read
by matching (`MATCHING_DIMENSIONS` in `lib/fragrance/profile.ts`):

| axis | how it was scored |
| --- | --- |
| `fresh` | brightness: citrus, aquatic/marine, green, ozonic, aldehydes, mint, tea, light florals |
| `warm` | amber, vanilla, tonka, resins/balsam, honey, spice, woods, leather, tobacco |
| `mysterious` | oud, incense, leather, animalic, smoke, dark resins, truffle, night-time weight |
| `elegant` | iris/orris, rose, jasmine, aldehydes, powdery, chypre structure, restraint |
| `bold` | projection and assertiveness: heavy spice, oud, leather, tobacco, animalic, loud sweetness |

`social`, `adventurous`, `expressive`, `experimental` are **fixed at 40** on
every row — the documented `UNMAPPED_AXIS_NEUTRAL` convention
(`lib/fragrance/axis-derivation.ts`). Matching never reads them; they must not
be varied by hand.

Values were proposed per perfume from the notes and accords above, using the
rubric in the table. They were **not** produced by `axesFromAccords()`: that
canonical map averages every accord and compresses all five axes into roughly
40–75, so no perfume could ever be a clear extreme and the demo pool would not
span the personality space.

## Provenance

`profileSource = AI`: the vectors are machine-proposed from public note and
family knowledge — not merchant-authored (`MANUAL`) and not read off a
reference profile (`REFERENCE`). The CSV import service defaults to `MANUAL`
for admin uploads; this dataset is imported by a trusted server-side caller
that passes the explicit `profileSource: "AI"` option. No form field or CSV
column can request that provenance.

## Import

Admin → CSV import, target store `store-demo-perfume-shop`, with `inStock=true`
and `active=true` in the file. The import is insert-only: it refuses to run if
any `(name, brand)` or slug in the file already exists in the store.
