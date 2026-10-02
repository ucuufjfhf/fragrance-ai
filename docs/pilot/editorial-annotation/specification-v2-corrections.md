# Fiage Editorial Character Specification — v2 corrections (clarification layer)

**Artifact type:** this document is methodology/research documentation. It is tracked for project
history. It is not production data and is not consumed directly by the recommendation engine.
**Applies to:** the "Fiage — Editorial Fragrance Character Specification" (rev1) as operationalised in
`annotation-instructions.md` (rev2) and `specification-corrections.md` (rev2).
**Status:** clarification only. No production code, database schema, Prisma files, matching engine,
fragrance profiles, production data, or tests are changed by this document.

---

## 0. What this document is, and what it is not

**This is a clarification layer, not a new definition.**

The pilot (19 perfumes, 2 blind annotators) showed that the *definitions* were applied
inconsistently, not that the definitions were wrong. The failure mode was **reliable
disagreement about what qualifies as evidence for a cue** — not disagreement about the cue itself.

| This document **DOES** | This document **DOES NOT** |
|---|---|
| Restate the mysterious and elegant definitions unchanged | Redefine, widen or narrow either dimension |
| Forbid specific inference shortcuts that produced the observed errors | Introduce new cues, new bands or new scores |
| Make the annotator answer the deciding question before scoring | Add any axis, weight, formula or engine input |
| Add mandatory self-check questions before a score is recorded | Change the 0–100 scale or its five bands |
| Define a repeatable re-run of the same pilot | Change any production data or matching behaviour |

If any sentence in this document appears to contradict the preserved definitions in §2, **the
definitions in §2 win**. This document is subordinate to them.

---

## 1. Why v2 exists — the four disagreement patterns observed in Pilot v1

Pilot v1 inter-annotator review surfaced four recurring error families. Each maps to a
clarification rule in §3 or §4.

| # | Observed pattern | Root cause | Rules added |
|---|---|---|---|
| P1 | **Complexity was scored as mysterious** | "Many notes / many accords ⇒ hard to place" was treated as evidence for M1/M2 | MC-1, MC-2 |
| P2 | **Smoothness / polish was scored as elegant** | Absence of visible seams (E2) was treated as sufficient for the whole dimension, with E1/E3/E5 skipped | EC-1, EC-5 |
| P3 | **Brand prestige and market perception leaked into elegant scores** | Commercially-positioned, well-regarded compositions were read as "well made" | EC-2, EC-3 |
| P4 | **M3 (category shift over time) was asserted from flattened note data** | The unordered note pyramid was read as if it encoded a top→heart→base arc | MC-5, MC-6 |

P3 is the most serious finding: it means the annotator was, in effect, scoring the market rather
than the composition. P4 is the most mechanically dangerous: it produced confident, fabricated
evidence.

---

## 2. Preserved definitions (UNCHANGED — reproduced for reference)

These are carried over verbatim from the pilot instructions (§3 and §4). **They are the
authority.** This document adds no new meaning to them.

### 2.1 MYSTERIOUS — preserved

> A fragrance is **mysterious** to the degree that it **resists immediate, complete decoding**:
> its whole cannot be reduced at first encounter to a single familiar category, and it retains
> an **unresolved, difficult-to-name remainder** that persists or shifts as it wears. Mystery is
> a tension between something legible and something that will not be named.

Core cues remain **M1. Categorical unplaceability** and **M2. Legible anchor + unresolved
remainder**. **M3. Temporal lability** remains conditional. **M4. Withheld presentation** and
**M5. Atmospheric opacity / texture** remain modulators only — M5 adds nothing unless M1/M2
already hold.

### 2.2 ELEGANT — preserved

> A fragrance is **elegant** to the degree that it reads as **compositional control**: every
> element is proportionate to the whole, transitions are seamless, nothing obtrudes as harsh /
> sharp / mismatched / clumsily placed, and the result feels finished and self-consistent rather
> than effortful or excessive. Elegance is the perceived quality of composition and execution —
> not the cost of the materials.

Core cues remain **E1. Balance / proportion**, **E2. Seamlessness of transition**, **E3. Absence
of harshness** and **E5. Coherence of intent**. **E4. Restraint** remains contributing.

### 2.3 Also unchanged

- The 0–100 five-band scale and all band descriptors.
- The confidence criteria, the allowed cell values, and the sheet columns.
- The existing M3 safeguard from `specification-corrections.md` (Correction 2).
- The exclusion list in annotation-instructions §2 (brand, price, popularity, rating, review
  count, gender marketing, bottle, celebrity, launch year, personal taste, occasion). §4 of this
  document **reinforces** that list; it does not replace it.

---

## 3. Clarification rules — MYSTERIOUS

Each rule is a constraint on *evidence*, not a change to the definition. "MUST NOT" means: if the
only supporting evidence is the forbidden kind, the score is not defensible.

### MC-1 — Complexity is not mystery

Complexity is a *property of the composition's construction*; mystery is a *property of the
decoding experience*. A dense, many-facet composition can be instantly legible the moment one
recognises its family ("a very rich fougère", "an opulent oriental chypre"). Note density, accord
count, and layering richness are **not** evidence for M1 or M2.

> **Test:** if your reason names *how much there is*, it is not a mysterious reason. Your reason
> must name *what resists being named*.

### MC-2 — Note count is not mystery

Already excluded in annotation-instructions §2; restated here because it was the single most
frequent shortcut in Pilot v1. A 27-note composition may be simple in effect; a 3-note
composition may be unplaceable. **MUST NOT** let the number of listed notes or accords raise the
mysterious score on its own.

### MC-3 — Darkness, oud, smokiness and strength are not mystery by themselves

These remain *rejected correlates*, exactly as in the preserved definition. They describe
mood, material and projection — not decoding resistance.

- **Darkness** may be a *surface* that is legible as "dark", which is the opposite of mystery.
- **Oud** is a highly recognisable, nameable family cue; its presence usually *reduces*
  categorical unplaceability.
- **Smoke / resinous density** is M5, a modulator: it raises decoding difficulty **only if M1 and
  M2 already hold independently**. It can never establish them.
- **Strength / projection** says nothing about legibility of category.

**MUST NOT** cite any of these as the deciding cue. If darkness, oud, smoke or strength is the
main reason for a high mysterious score, the score is **not defensible** and must be revised down
before submission.

### MC-4 — A perfume must resist broad categorization to score high

This is the operational reading of M1, added because annotators disagreed about how much
unplaceability is enough.

- Resistance must hold against the **family level** ("chypre", "fougère", "oriental", "woody
  amber", "floral"), not merely against a precise sub-category.
- A score in the **41–60** band requires a category that is genuinely **arguable between two
  families** — not "a floral with a twist".
- A score in **61–80** requires that the whole **cannot be reduced to one category on first
  encounter**.
- A score in **81–100** requires that the identity **is** irresolution: legible surface over an
  unnameable depth, unsummarisable in a word.
- M2 **MUST** hold as well: there must be at least one clearly identifiable element *and* at least
  one that resists naming. Mystery with nothing legible is not mysterious — it is simply
  unreadable or empty.

### MC-5 — M3 is allowed only when reliable top/heart/base information exists

M3 (category shift across the top→heart→base arc) **MAY** be used **only** where reliable
stage-specific information is actually available for that perfume.

- Stage information means a **genuine** structure: notes attributed to stages, a documented
  pyramid, or equivalent first-party stage data.
- Absent that, `mysterious_m3_status` **MUST** be `NOT_OBSERVABLE` and **MUST NOT** contribute to
  the score. This restates and does not weaken `specification-corrections.md` Correction 2.
- For the current 19-perfume pilot set, the source data carries a **flattened** note pyramid with
  no recoverable stage boundaries, so M3 is `NOT_OBSERVABLE` for **all** rows. Do not "recover" a
  progression from note order, note position in the field, or convention.

### MC-6 — Do not infer evolution from flattened note lists

**Prohibited inference:** treating the position, order or grouping of notes in a flattened note
field as evidence that the fragrance *changes category over time*.

Flattened note lists are **unordered sets of materials**, not a timeline. Where one stage ends
and the next begins cannot be recovered, so no temporal shift may be invented. This applies
equally to:

- reading the listed order as an opening → drydown sequence;
- reading accord groupings as a chronological arc;
- inferring a shift because materials from two families are both present (a *composition* across
  stages is not a *shift* between stages);
- inferring a shift from a note named "drydown", "after hours" or similar in free text alone.

A perfume whose mysterious score rests on an invented M3 **MUST** be re-annotated using
M1, M2, M4, M5 alone. Record the row's M3 status as `NOT_OBSERVABLE` and state in `notes` that
M3 was not used.

---

## 4. Clarification rules — ELEGANT

### EC-1 — Smoothness is not automatically elegance

Seamlessness (E2) is a **necessary** quality of elegance, not a **sufficient** one. A composition
can flow perfectly and still be over-scaled, over-sweet, over-weighted in one accord, or built
around a single dominant idea. Pilot v1 showed annotators stopping at E2 and awarding the high
bands on transition quality alone.

- Smoothness **alone cannot place a score above the 41–60 band.**
- To reach **61–80** or **81–100**, E1, E3 and E5 **MUST** each be satisfied independently and
  stated in the reason.
- If a composition is smooth *because it is thin, single-idea or monotonous*, that is E4
  (restraint, contributing) working against refinement, not elegance.

### EC-2 — Commercial polish is not elegance

"Made by a respected house", "reformulated", "well-received", "sounds smooth and expensive" is
market and production information, not compositional information. It **MUST NOT** enter an
elegant score. This rule targets the *specific* Pilot v1 error: a perfume's reputation was used
as a proxy for compositional control.

### EC-3 — Brand prestige, price and popularity must not influence scoring

The annotation-instructions §2 exclusion list is **absolute and unchanged** for elegance. For the
avoidance of doubt, the following are **MUST NOT** be used as positive evidence of elegance, nor
as negative evidence of inelegance:

- house reputation, heritage, or perceived exclusivity;
- price point, concentration, or ingredient cost;
- popularity, sales rank, review count, award wins, critic standing;
- marketing framing ("luxury", "haute couture", niche/designer positioning);
- gender marketing, bottle design, campaign, celebrity association.

**Blind-violation protocol:** if at any point you recognise the perfume and a recognition enters
your reasoning, stop scoring that row, note the intrusion in `notes`, and re-derive the score from
the factual columns only. Recognition is not itself disqualifying; **letting it into the reason
is**.

### EC-4 — A dominant signature can be high quality but still not elegant

A clearly recognisable signature accord or a strong single idea is **not evidence of elegance**,
in either direction.

- A dominant signature **MUST NOT** be scored as elegance by itself; it is a candidate **E1
  (balance / proportion)** finding, to be judged on whether the dominance is *appropriate* to the
  whole or merely *conspicuous*.
- Quality of execution ("it is well made, just very one-note") **MAY** justify a competent score
  in **41–60**, but that is the *ceiling* for an unresolved dominant signature — a signature that
  has not been assessed against E3/E5 **MUST NOT** exceed **60**.
- Conversely, a gentle, low-impact composition is not elegant by default; if it is merely
  uneventful, that is not E1–E5 satisfaction either.

### EC-5 — Elegance requires proportion, seamlessness, restraint and coherence

The four qualities below are the **conjunctive floor** for the upper bands. They are the
preserved definition's own criteria, stated as an explicit gate to stop partial-credit scoring.

| Band | Requires |
|---|---|
| **0–40** | At least one of E1 / E3 / E5 visibly fails (obtruding element, harsh or clashing edge, assembled-not-deliberate reading). |
| **41–60** | No hard failure, but at least one of the four qualities is unresolved: proportion off, a seam, an uneven edge, or intent that is only partly coherent. |
| **61–80** | **All four hold:** proportion, seamlessness, restraint, coherence — with only minor unevenness. |
| **81–100** | **All four hold and read as inevitable** — near-total control, nothing removable without loss. |

All four **MUST** be answerable in one sentence each before **61** is assigned. This does not
change the band descriptors; it prevents partial satisfaction from being scored as full
satisfaction.

---

## 5. Mandatory self-check before assigning a score

These questions are **mandatory**. They are answered from the factual `accords` and
`fragrance_notes` columns, after the confounder suppression of annotation-instructions §2, and
**before** a band or score is written. The deciding-cue answer **MUST** be captured in the
`notes` column for that row.

### 5.1 Self-check — MYSTERIOUS (all must be answered)

1. **Name it in one word.** Can I reduce the whole to a single familiar family? If yes, the score
   cannot be high — record the family name. *(MC-4)*
2. **Is the remainder real?** Is there a specific element I can point to that resists naming, and
   a second element I can identify clearly? If either is missing, M2 fails. *(MC-2, MC-4)*
3. **Am I scoring the amount or the opacity?** Is my evidence about *how much material there is*,
   or about *what will not decode*? If the former, the reasoning is invalid. *(MC-1, MC-2)*
4. **Am I using mood or material as a shortcut?** Is darkness, oud, smoke, resin, or strength
   doing any work in my reason? If yes, strike that evidence and re-derive. *(MC-3)*
5. **Is the M5 dependency honest?** If I am using density/smoke/resin, do M1 and M2 hold without
   it? If not, M5 contributes nothing. *(MC-3)*
6. **Where does the stage data come from?** Is there reliable top/heart/base information for this
   perfume? If not, M3 is `NOT_OBSERVABLE` and excluded. *(MC-5)*
7. **Am I reading a timeline into a list?** Did any part of my reason treat note order, position or
   grouping as a chronological arc? If yes, delete that reason entirely. *(MC-6)*
8. **Band fit.** Which band descriptor in §6 of the instructions does this row actually match —
   and would moving one band either way violate a core cue? *(confidence criteria)*

### 5.2 Self-check — ELEGANT (all must be answered)

1. **Four-part sentence.** Can I state, in one sentence each, how this composition achieves
   **proportion**, **seamlessness**, **restraint** and **coherence**? If any of the four cannot be
   stated, the score cannot exceed **60**. *(EC-5)*
2. **Am I rewarding smoothness for its own sake?** Did I stop at E2? If E1, E3 and E5 have not
   been assessed independently, the score cannot exceed **60**. *(EC-1)*
3. **Signature or flaw?** Is a dominant signature doing the work of my reason? Assess it under E1
   as proportionate or conspicuous. *(EC-4)*
4. **Whose opinion leaked?** Did brand, price, house reputation, popularity, reviews, or awards
   enter the reason in either direction? If yes, the row must be re-derived. *(EC-2, EC-3)*
5. **Recognition check.** Did I recognise this perfume, and did that recognition influence the
   score? If so, record the intrusion in `notes` and re-derive. *(EC-3)*
6. **Quality is not elegance.** Am I scoring "well made / well received" instead of "well
   composed"? If yes, the reasoning is invalid. *(EC-2, EC-4)*
7. **Band fit.** Which band descriptor does this row match, and does any item in §5.1/§5.2 cap it?
   *(EC-1, EC-5)*

### 5.3 Self-check outcome

| Self-check result | Required action |
|---|---|
| All questions pass | Record the deciding cue and score as normal. |
| Any cap applies | Apply the cap, then record in `notes` which rule capped the score and why. |
| A "MUST NOT" was violated while forming the reason | Discard the reason, re-derive from the factual columns, then score. |
| A core cue cannot be established from the factual data | Score LOW confidence and state the missing evidence in `notes`. Thin data is not permission to substitute a correlate. |

---

## 6. Score ceilings implied by the clarification rules

These ceilings are **not new bands**. Each is the direct consequence of an existing band
descriptor plus a rule above, stated so that a cap is applied consistently rather than by taste.

| Condition | Mysterious ceiling | Elegant ceiling |
|---|---|---|
| Core cue (M2 / E1+E3+E5) not established | 40 | 60 |
| Reason rests on a rejected correlate (darkness, oud, smoke, strength, complexity, note count, brand, price, popularity) | 40 | 60 |
| M3 not observable and the reason depended on it | 40 (rescore on M1/M2/M4/M5) | — |
| M5 used without M1/M2 holding independently | 40 | — |
| Dominant signature not assessed against E1/E3/E5 | — | 60 |
| Smoothness (E2) is the only satisfied core cue | — | 60 |
| Recognition intrusion recorded in `notes` | — | re-derive before scoring |

A capped row is still a valid annotation. Record the cap and its cause in `notes`; a capped score
with a stated cause is **more** useful to the research than an uncapped one without a reason.

---

## 7. Pilot v2 procedure

Pilot v2 is a **measurement of whether the clarification layer improved consistency**. It is not
a re-definition exercise and it changes nothing about the product.

### 7.1 Fixed variables — identical to Pilot v1

| Variable | Pilot v2 setting |
|---|---|
| **Perfume set** | The **same 19 perfumes**, same IDs, same factual data. No additions, removals or substitutions. |
| **Blinding** | The **same blind process**: no repository axis values, no `FragranceProfile` values, no scores, no rankings, no other annotator's sheet, no web search. Annotators work alone and do not discuss until both sheets are complete. |
| **Factual data** | The **same factual data**: `accords` and `fragrance_notes` exactly as supplied in Pilot v1. No new columns of derived or enriched data. |
| **Dimensions and scale** | `mysterious` and `elegant`, 0–100, five bands, unchanged. |
| **Sheet format** | Unchanged columns, unchanged allowed values, unchanged `mysterious_m3_status` semantics. |
| **Duration** | Annotate the 19 rows in one sitting, in sheet order, without revisiting completed rows. |

### 7.2 The only change

The **instructions** are `annotation-instructions.md` (rev2) **plus this document**. The added
material is:

- the clarification rules MC-1…MC-6 and EC-1…EC-5;
- the mandatory self-checks in §5, with the deciding-cue answer recorded in `notes`;
- the score ceilings in §6, with the capping rule named in `notes`.

Everything else is held constant so that any movement in agreement is attributable to the
clarifications.

### 7.3 No production changes

- **No** application code, database schema, Prisma file, matching engine, fragrance profile,
  production data, or test is modified, imported or regenerated for Pilot v2.
- The pilot output is **research material**. It is not consumed by Fiage.
- No axis, weight, formula or scoring constant is derived from Pilot v2 scores, in this round or
  any later round without a separate, separately-reviewed change.
- Pilot sheets, `source-data.json` and this document remain outside production data paths.

### 7.4 What is measured

Compare Pilot v1 and Pilot v2 on identical 19 rows:

| Metric | Reading |
|---|---|
| **Band agreement rate** per dimension | Primary signal. The metric the pilot exists to move. |
| **Mean and median \|score difference\|** per dimension | Directional; a fall is expected if band agreement rises. |
| **Disagreement subclasses** (per spec §14) | Which subclass dominates now, and which stopped occurring. |
| **P1 count** — mysterious scores resting on complexity / note count | Must fall to zero. |
| **P2 count** — elegant scores resting on smoothness alone | Must fall to zero. |
| **P3 count** — rows whose reason cites brand, price, prestige or popularity | Must fall to zero. |
| **P4 count** — rows using M3 from flattened note data | Must be zero; M3 is `NOT_OBSERVABLE` on all 19 rows. |
| **Confidence distribution** | A rise in LOW is acceptable and expected at genuine boundaries. |
| **Capped rows** | Count and stated cause; a high cap rate means the rules are binding and should be reported. |

**Success criterion for the clarification layer:** band agreement improves on both dimensions,
and P1–P4 fall to (or near) zero. A change in *average score level* is **not** a success signal —
it is not a measurement of consistency and must not be used to justify rescoring the 19 rows.

### 7.5 Decision after Pilot v2

| Outcome | Next step |
|---|---|
| Band agreement improves, P1–P4 ≈ 0 | Clarifications adopted as pilot guidance. Still no production change. |
| P1/P2/P3 persist for one or both annotators | The rule is too abstract: rewrite it as an explicit worked example or a per-cue yes/no question, then re-run. Do **not** adjust the definition. |
| P4 persists anywhere | Blinding or sheet tooling is leaking stage assumptions. Fix the material, not the rule. |
| Agreement does not improve | Treat the **definition** as the suspect, not the rules. Escalate to a full specification revision (rev3) with a separate decision record. |
| Agreement improves but one annotator is systematically capped | Check whether the ceilings are being applied to a different reading than intended before considering any band change. |

In every branch, production remains unchanged until a separate, reviewed change is approved.

---

## 8. Explicitly unchanged by this document

- The mysterious and elegant definitions (§2 above).
- The cue tables M1–M5 and E1–E5, their roles, and the rejected-correlate lists.
- The M3 conditional safeguard in `specification-corrections.md` Correction 2, including the
  `OBSERVABLE` / `NOT_OBSERVABLE` sheet column and the pre-filled `NOT_OBSERVABLE` values.
- The 0–100 five-band scale and every band descriptor.
- The confidence criteria and allowed cell values.
- The annotation sheet columns and the Pilot v1 19-perfume set.
- All application code, database schema, Prisma files, matching engine logic, fragrance profiles,
  production data and tests.

---

## 9. Document inventory

| File | Role in v2 |
|---|---|
| `annotation-instructions.md` | Base operational instructions (rev2). Unchanged by this document. |
| `specification-corrections.md` | rev2 spec corrections: "Operational cues" terminology and the M3 safeguard. Unchanged by this document. |
| `specification-v2-corrections.md` | **This document.** Clarification layer addressing the four Pilot v1 disagreement patterns, mandatory self-checks, and the Pilot v2 procedure. |
| `annotation-template.csv` | Sheet structure. Unchanged. |
| `annotator-A.csv`, `annotator-B.csv` | Pilot v1 completed sheets. Retained for comparison; not modified. |

---

*End of v2 clarification layer. Production unchanged.*
