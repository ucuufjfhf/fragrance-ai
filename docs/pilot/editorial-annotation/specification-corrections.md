# Fiage Editorial Specification — rev2 corrections (research material only)

Applies to the "Fiage — Editorial Fragrance Character Specification" (rev1). No production code,
data, or the matching engine is affected. These are terminology/grounding corrections only; the
underlying definitions are unchanged.

---

## Correction 1 — Rename concept "Validated cues" → "Operational cues"

**Reason:** the cues are not yet validated. The pilot tests whether they are valid and reproducible.

Every occurrence of **"Validated cues"** in rev1 (§1 and §2) is replaced by **"Operational cues"**.
The cue tables themselves are otherwise unchanged; the words "Constitutive" / "Contributing" /
"Modulator only" remain as *roles*, not as claims of validation.

Corrected heading text:

- §1 heading: **"Operational cues (each independently observable)."**
- §2 heading: **"Operational cues."**

The following sentence is added immediately under both headings:

> These are **operational cues** intended to guide annotation. They are **not yet validated**;
> the pilot is what will test whether they are valid and reproducible. If the pilot fails the
> §14 quality checks, the cues are revised before any production data is created.

---

## Correction 2 — Mysterious M3 limitation

**M3 (Temporal lability)** asks whether the apparent *category* changes across the top → heart →
base arc. The current reference dataset does not provide sufficiently reliable fragrance-stage
information for every perfume.

### Corrected M3 text

> **M3. Temporal lability (conditional).** M3 may be used **only when reliable stage-specific
> information is actually available** for the perfume being annotated. If stage-specific
> information is unavailable, the annotator **MUST NOT** infer a temporal shift from the unordered
> note/accord list; M3 must be marked **NOT OBSERVABLE** for that perfume, and the annotator must
> rely on the remaining applicable cues (M1, M2, M4, M5).
>
> **Do not fabricate top/heart/base ordering.** The source note field is a *flattened* note pyramid
> without stage boundaries; where one stage ends and the next begins cannot be recovered reliably,
> so no temporal shift may be invented from it.

### Consequences for the pilot material

- The annotation sheet carries an explicit `mysterious_m3_status` column with allowed values
  `OBSERVABLE` / `NOT_OBSERVABLE`.
- Because the pilot's source data provides no reliable stage boundaries, `NOT_OBSERVABLE` is
  pre-filled for all 19 rows. It stays `NOT_OBSERVABLE` unless reliable stage-specific information
  is explicitly supplied.
- M3 does not participate in scoring while `NOT_OBSERVABLE`; the mysterious band is decided from
  M1, M2, M4 and M5 alone.

No other part of the mysterious definition is redesigned.

---

## Unchanged

- The mysterious and elegant working definitions.
- The 0–100 five-band scale and its band descriptors.
- The anchors, borderline pairs, anti-examples, confounders, procedure, confidence criteria, and
  inter-annotator agreement criteria.
- The 19-perfume pilot set.
