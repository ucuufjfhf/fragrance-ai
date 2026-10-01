# Fiage — Blind Editorial Annotation Pilot: Annotator Instructions

**Artifact type:** repository-external research material. Do NOT add to Git or production.
**Version:** rev2 (terminology correction: "Operational cues"; M3 safeguard added).

---

## 0. What you are doing

For each of the 19 perfumes in your sheet, you assign an **editorial character label** on two
dimensions — `mysterious` and `elegant` — using only the perfume's **factual notes and accords**
and the operational cues below.

You are NOT measuring the wearer's personality, and you are NOT claiming an objective truth.
You are producing a **consistent editorial label** for Fiage's deterministic recommendation engine.
There is no universal numerical truth for "mysterious" or "elegant"; consistency is the goal.

**You work alone.** Do not discuss with the other annotator until both sheets are complete.
Both sheets are identical in IDs, names, factual data, and these instructions. Neither contains scores.

---

## 1. Blinding — do NOT look at, or recall, any of these

- the current `axesFromAccords()` values
- the current `FragranceProfile` axis values
- any recommendation score, ranking, or matching result
- the other annotator's scores
- any previous annotation results

Annotate **only** from the factual columns in your sheet (`accords`, `fragrance_notes`) plus these
instructions. Do not consult the repository's derived axis values, and do not web-search the perfumes.

---

## 2. Confounders you MUST ignore

Ignore, and never let influence a score:

brand prestige · price · popularity · rating · review count · gender marketing · bottle design ·
celebrity associations · launch year · personal taste · wearer identity · occasion preference.

Also ignore note **count** as such: a 27-note composition can be simple in effect and a 3-note one
can be complex.

---

## 3. Operational cues — MYSTERIOUS

> A fragrance is **mysterious** to the degree that it **resists immediate, complete decoding**: its
> whole cannot be reduced at first encounter to a single familiar category, and it retains an
> **unresolved, difficult-to-name remainder** that persists or shifts as it wears. Mystery is a
> tension between something legible and something that will not be named.

| Cue | Question | Role |
|---|---|---|
| **M1. Categorical unplaceability** | Can I name the whole thing as ONE familiar family in a word? (yes = low) | Core |
| **M2. Legible anchor + unresolved remainder** | Is there at least one clearly identifiable element AND at least one that resists naming? | Core |
| **M3. Temporal lability** | Does the apparent CATEGORY (not intensity) change across the top→heart→base arc? | Conditional — see §5 |
| **M4. Withheld presentation** | Does it refrain from announcing its entire hand at first sniff (surface vs depth)? | Contributing |
| **M5. Atmospheric opacity / texture** | Density, resin, smoke, animalic blur increase decoding difficulty ONLY if M1/M2 already hold; alone they add nothing | Modulator only |

**Rejected as definitions (correlates, not mystery):** darkness, strength, oud presence, smoke,
sweetness, expensiveness, masculine coding, "nighttime" imagery, and complexity/note count.
A dark, strong, smoky, oud-heavy, expensive or complex perfume can be perfectly legible.

## 4. Operational cues — ELEGANT

> A fragrance is **elegant** to the degree that it reads as **compositional control**: every element
> is proportionate to the whole, transitions are seamless, nothing obtrudes as harsh / sharp /
> mismatched / clumsily placed, and the result feels finished and self-consistent rather than
> effortful or excessive. Elegance is the perceived quality of composition and execution — not the
> cost of the materials.

| Cue | Question | Role |
|---|---|---|
| **E1. Balance / proportion** | Does any single element inappropriately dominate or stick out? | Core |
| **E2. Seamlessness of transition** | Are there abrupt seams between top / heart / base, or does the arc flow? | Core |
| **E3. Absence of harshness** | Are there shrill, scratchy, or clashing edges? | Core |
| **E4. Restraint** | Does it say enough and stop, or overspray an idea into excess? | Contributing |
| **E5. Coherence of intent** | Does everything belong, reading as deliberate rather than assembled? | Core |

**Rejected as definitions (correlates, not elegance):** expensiveness, luxury codes, formality,
femininity, cleanliness, minimalism, popularity, high-end brand. Expensive, clean, minimal, floral
and popular perfumes can all be inelegant; costly materials can be arranged without refinement.

---

## 5. M3 safeguard (important)

`M3` requires **reliable stage-specific information** (a genuine top / heart / base structure).

- If reliable stage-specific information **is available**, you may use M3.
- If it is **NOT available**, mark `mysterious_m3_status = NOT_OBSERVABLE` and **do not use M3**.
- **Never infer a top/heart/base progression from an unordered or boundary-less note list.**
  The source note field is a *flattened* pyramid; where one stage ends and the next begins cannot be
  recovered reliably, so a temporal shift must **not** be invented from it.
- When M3 is NOT_OBSERVABLE, rely on the remaining applicable cues (M1, M2, M4, M5).

For this pilot the source data provides no reliable stage boundaries, so the sheet pre-fills
`NOT_OBSERVABLE`. Keep it unless reliable stage-specific information is explicitly supplied to you.

---

## 6. The 0–100 scale (five bands)

Choose the **band first**, then a **score** inside it. Do not skip the band.

### Mysterious bands
| Band | Meaning |
|---|---|
| 0-20 | Fully legible at first sniff; reduces to one familiar category; no unresolved remainder; stable identity. |
| 21-40 | Predominantly legible; category immediate and stable; at most one small unplaceable facet. |
| 41-60 | A genuine split: recognizable anchors plus one element that resists naming; category arguable between two families. |
| 61-80 | Cannot be reduced to one category on first encounter; a distinct unresolved remainder persists and re-shapes across the arc. |
| 81-100 | Its identity IS irresolution: consistently defies categorisation, legible surface over an unnameable depth; cannot be summarised in a word. |

### Elegant bands
| Band | Meaning |
|---|---|
| 0-20 | Reads as effortful/assembled: elements clash or obtrude, abrupt transitions, blunt or heavy-handed. |
| 21-40 | Mostly rough: some pleasing facets but proportion is off; at least one element sticks out. |
| 41-60 | Competent and broadly balanced but with detectable rough edges or one over-weighted element; "good, not refined." |
| 61-80 | Clearly controlled and finished: even proportion, smooth transitions, no obtrusive element; only minor unevenness. |
| 81-100 | Near-total compositional control: seamless arc, every element proportionate, restraint and coherence read as inevitable. |

---

## 7. Procedure (repeat per perfume, per dimension)

1. Read the factual `accords` and `fragrance_notes` only.
2. Suppress every §2 confounder.
3. **Mysterious:** apply M1 → M2 → (M3 if observable) → M4/M5 as modulators.
4. **Elegant:** apply E1 → E2 → E3 → E5 → E4.
5. **Choose the band first.**
6. **Then assign a score** (integer 0–100) inside that band.
7. **Record confidence** (see §8) and `mysterious_m3_status`.
8. **Record one short reason** in the `notes` column — the deciding cue (e.g. "M1: reduces to one word").
9. Move on; do not revise a completed row after seeing later rows to "make a pattern."

---

## 8. Confidence criteria

| Level | Criteria (all must hold) |
|---|---|
| **HIGH** | Clearly matches the chosen band; moving one band either way would violate a core cue; not near a boundary; no anti-example fires; deciding cue is M1/M2/M3 or E1/E2/E3/E5. |
| **MEDIUM** | Band fits but is near one adjacent band; or deciding cue is a contributing cue (M4/M5, E4); or one facet mildly contradicts. |
| **LOW** | Genuinely straddles two adjacent bands; or factual information is too thin; or a conflict you cannot resolve alone. **Low confidence at a boundary is expected, not a failure.** |

If you cannot choose between two bands, record LOW and state both candidate bands in `notes`.

---

## 9. Allowed cell values (no intermediates)

- `mysterious_band`, `elegant_band`: `0-20` | `21-40` | `41-60` | `61-80` | `81-100`
- `mysterious_confidence`, `elegant_confidence`: `HIGH` | `MEDIUM` | `LOW`
- `mysterious_m3_status`: `OBSERVABLE` | `NOT_OBSERVABLE`
- `mysterious_score`, `elegant_score`: integer 0–100 only
- Leave a cell blank until you decide it. Do not invent other values.

---

## 10. When finished

Complete both dimensions for all 19 rows, fill confidence + M3 status + one reason each.
Do not compute any recommendation/matching score. Hand your sheet back; the two sheets are then
compared by the researcher (band agreement, |score difference|, confidence, and per §14 of the
specification which subclassifies disagreements).
