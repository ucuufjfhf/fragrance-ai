# Store onboarding runbook (operator)

How a merchant store is taken from "signed" to "live widget + report link".
Everything below is what the code in this repo actually does today; where the
tooling is incomplete it says so instead of implying a script exists.

Read once, then follow the sections in order. Persian strings are quoted as the
merchant/operator sees them.

---

## 0. Prerequisites

- Node + the repo's dependencies installed (`npm ci`; the Prisma client is
  generated into `lib/generated/prisma`, which is git-ignored).
- A `DATABASE_URL` for the **target** environment, and nothing else: every
  script below reads `process.env.DATABASE_URL` through `lib/db`.
- The merchant's own facts: legal trading name, a URL-safe slug, their real site
  origin, a logo URL, and (optionally) a brand colour.

### Credentials handling (non-negotiable)

- A database URL or any other credential is pasted **only inside the operator's
  own shell session** for the duration of the work.
- It is never pasted into chat, a ticket, a document, a commit or the repo.
  `.env` stays local and untracked.
- Destroy it afterwards (close the session, clear the shell history) once the
  store is live.

---

## 1. Create the store

```bash
npx tsx scripts/create-store.ts \
  --name "عطر فروشگاه من" \
  --slug my-shop \
  [--website-url https://my-shop.ir] \
  [--logo-url https://my-shop.ir/logo.png] \
  [--accent-color "#1F6F5C"]
```

What the script guarantees:

- the id is Prisma's `cuid()` (never chosen by hand) — it is what the embed
  snippet and the admin panel use;
- `--slug` is validated (`3–64` lowercase letters/digits/hyphens, no edge
  hyphens) and unique; a duplicate is rejected via Prisma `P2002` with a clear
  Persian message, so **rerunning never creates a second store**;
- `--website-url` / `--logo-url` must start with `http://` or `https://`;
- `--accent-color` must be exactly `#RRGGBB` (any case, stored lowercase). It is
  the widget's brand colour and is scoped to the widget only. **Omitting it
  stores NULL**, which is the FIAGE default accent — identical to every store
  created before this option existed;
- nothing is ever updated or deleted by this script.

The script prints the store id, the admin URL (`/admin/perfumes?store=<id>`) and
the embed line. Copy the id — the rest of the runbook needs it.

**`websiteUrl` is not cosmetic.** It is the origin the widget's CORS policy
compares against, so it must be the merchant's real site origin (scheme + host,
e.g. `https://my-shop.ir`, not a path). Get it wrong and every cross-origin
embed is blocked in the browser.

---

## 2. The catalog CSV

The import contract lives in `lib/admin/csv/contract.ts`. Column names are the
contract; unknown columns are rejected.

**Required product columns:** `name`, `brand`, `slug`, `gender`, `price`.

**Optional product columns:** `description`, `productUrl`, `imageUrl`,
`inStock`, `active`.

**Required matching columns (nine axes):** `social`, `adventurous`,
`expressive`, `mysterious`, `fresh`, `warm`, `experimental`, `elegant`, `bold` —
integers `0–100`. A row without a complete, in-range profile is not importable;
the importer never invents values.

**Optional descriptor columns (ten):** `citrusy`, `floral`, `woody`, `spicy`,
`sweet`, `aquatic`, `green`, `powdery`, `smoky`, `fruity` (from
`DESCRIPTOR_DIMENSIONS`).

**Optional metadata columns:** `family`, `notes`, `season`, `occasion`.
`notes` uses `|` inside one cell (`bergamot|cardamom|cedar`).

**Booleans:** only the literal `true` / `false` for `inStock` and `active`
(defaults `true`). No `1`, no `yes`.

**Limits:** 5 MB / 5,000 data rows. There is deliberately **no `storeId`
column** — the target store comes from the admin context.

### Preview, then confirm

The admin upload screen runs two phases; the service behind it is
`lib/admin/csv/service.ts`:

1. `previewCsvImport(raw, storeId)` — parses, validates and checks slug
   duplicates. **Read-only**: it creates, updates and deletes nothing.
2. `confirmCsvImport(raw, storeId, { profileSource })` — receives the **raw CSV
   again** (never a browser-asserted "validated" flag), re-validates it
   server-side, re-checks duplicates against the live DB (closing the
   preview→confirm race), and writes every row inside one
   `prisma.$transaction`. All rows or none.

`profileSource` defaults to `MANUAL` (merchant-authored values). `AI` exists for
trusted server-side callers importing machine-proposed datasets and is **not**
reachable from the admin form.

### Known gap (state it plainly)

**No committed importer runner exists.** There is no `scripts/import-catalog.ts`
today. The admin upload form is the supported path; for an operator-driven
import without the browser, drive the same service functions from a
`tsx` script that you create in your own session (not committed):

```ts
import { config } from "dotenv";
config();
import { readFileSync } from "node:fs";
import { previewCsvImport, confirmCsvImport } from "@/lib/admin/csv/service";

const raw = readFileSync("catalog.csv", "utf8");
const preview = await previewCsvImport(raw, "<store-id>");
if (!preview.ok || preview.summary.errorRows > 0) {
  console.error(JSON.stringify(preview, null, 2));
  process.exit(1);
}
const result = await confirmCsvImport(raw, "<store-id>"); // or { profileSource: "AI" }
console.log(result);
```

Run it with `npx tsx <your-session-file>.ts` and delete the file afterwards.
Treat this as a stopgap until a committed runner exists.

---

## 3. Issue the report link

```bash
npx tsx scripts/issue-report-token.ts --store <store-id>
# or
npx tsx scripts/issue-report-token.ts --slug my-shop
```

- One-shot by design: if the store already has a token, **nothing is
  overwritten** — the script prints the existing path and exits.
- Rotation lives in the admin panel (ReportLinkPanel / «تازه‌سازی پیوند»); the
  old link dies the moment a new token is written.
- Output is `/store-report/<token>`. That path **is** the capability: whoever
  holds it sees the store's aggregate analytics, no login. Send it to the store
  owner privately (their own channel), never to a group chat and never in a
  commit or issue.

Before sending, open it yourself: an eventless store shows
«هنوز داده‌ای برای نمایش وجود ندارد.» — that is the expected pre-launch state.

---

## 4. Hand over the embed snippet

```html
<script src="https://YOUR-DOMAIN/widget.js" data-store-id="STORE_ID"></script>
```

- `public/widget.js` is a dependency-free loader: it validates the id, mounts an
  iframe at `/widget?store=<id>` and auto-sizes it from postMessage events.
- The iframe is the CSS isolation boundary — the widget cannot inherit or leak
  merchant styles.
- For reverse proxies, `data-base-url="https://your-proxy.example"` overrides the
  origin derived from the script's own `src`.

**CORS rule:** both widget APIs are consumed cross-origin, so the response's
`Access-Control-Allow-Origin` is derived from `Store.websiteUrl`. If that value
is not the merchant's exact origin, the browser blocks the call and the widget
shows «این فروشگاه در حال حاضر در دسترس نیست.» Fix the data, not the code.

---

## 5. Production database safety rules

Follow these for **every** step that writes to a production database. They exist
because a past run lost demo-store analytics by acting on an ambiguous target.

> **Safety rules (verbatim):**
>
> 1. **Name the target first.** Before running anything, state out loud the
>    target host, database and store id you are about to touch, and confirm it
>    matches the merchant in front of you.
> 2. **Count before and after — for every store, not just yours.** Record
>    per-store row counts (perfumes, profiles, analytics events) before the
>    write, and again after. Any store whose count moved that you did not
>    intend to touch means stop.
> 3. **Insert-only.** Create rows; never update or delete existing merchant or
>    analytics data as part of onboarding. Corrections are a separate,
>    explicitly authorised operation.
> 4. **Abort on any ambiguity.** If two stores could match, if a slug is close
>    to an existing one, if a count is unexpected, or if you are unsure which
>    environment you are connected to — stop and ask. Never "try it and see".

Also: never point an onboarding script at a database whose URL you cannot name
in one sentence, and never run a destructive statement to "clean up" after a
mistake.

---

## 6. Go-live checklist

- [ ] `/admin/analytics?store=<id>` loads and shows the store name (not the first
      store by accident).
- [ ] Widget embedded on the merchant's page (or a staging copy of it): the
      intro renders with the store's name/logo, and the merchant's accent colour
      appears **inside the widget only**.
- [ ] Full journey at 390 px width on the merchant's own inventory: 10 questions
      → analysis → 3 recommendations with Persian `matchPercent`.
- [ ] Every recommendation has a way out: the product CTA («مشاهده عطر →») when
      the perfume has a `productUrl`, otherwise «مشاهده در فروشگاه» pointing at
      the store site. A card with neither URL renders no CTA — if a whole
      catalog is in that state, tell the merchant before go-live.
- [ ] Prices: when a perfume has a stored Toman price it shows on the card
      (e.g. «۱,۲۵۰,۰۰۰ تومان»); missing or zero price shows nothing.
- [ ] Report link: empty before the first visitor, then populated after one real
      journey (widget view → quiz start → result → recommendation impressions).
- [ ] UTM attribution arrives on the merchant's site:
      `utm_source=fiage_widget&utm_medium=quiz&utm_campaign=<store-id>`.
- [ ] `/data-policy` opens from the widget footer.

---

## 7. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| «این فروشگاه در حال حاضر در دسترس نیست.» | Store `active = false`, wrong `data-store-id`, or the config call was blocked | Check `Store.active`, compare the id in the snippet with the printed id, then check CORS (`websiteUrl` must equal the page origin) |
| Report shows «هنوز داده‌ای برای نمایش وجود ندارد.» | No events in the range yet, or the range is `today` and traffic was yesterday | Widen the range to 7d/30d; confirm one real journey happened |
| «عطرهای پرتکرار در پیشنهادها» is empty | No `RECOMMENDATIONS_SHOWN` events, or the events are older than this feature (impressions are now counted per perfume) | Run one journey; historical rows without ids only contribute clicks |
| Recommendations show no CTA at all | Perfumes have no `productUrl` and the store has no `websiteUrl` | Import product URLs, or set the store's `websiteUrl` so the fallback CTA appears |
| No price on the cards | `Perfume.price` is NULL or `0` | Fill prices via the admin form or CSV; the widget never invents a number |
| Widget too tall / scrollbars inside the iframe | Loader couldn't read the resize messages (different origin/base URL) | Check `data-base-url`, confirm the loader is the same deployment as the iframe |
| Merchant's brand colour not applied | `accentColor` is NULL or not `#RRGGBB` | Re-provision with `--accent-color "#RRGGBB"`; invalid values are rejected rather than stored |
