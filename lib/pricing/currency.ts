/**
 * Canonical currency for Fiage perfume prices — the single source of truth.
 *
 * INVARIANT (do not weaken):
 *  - `Perfume.price` stores the plain amount a merchant typed, in Toman.
 *  - `Perfume.currency` identifies the unit of that amount and is written
 *    EXPLICITLY by every price-bearing write path, so correctness never
 *    depends on a database column default.
 *  - There is NO automatic Toman/Rial (×10) conversion anywhere: the number
 *    entered is the number stored, displayed and compared.
 *  - The current MVP is single-currency (Iranian Toman). Multi-currency is a
 *    deliberate future change, not an accidental one.
 *
 * Why the value is `"TOMAN"` and not the ISO code `"IRR"`: Toman is the unit
 * merchants actually enter and the unit the admin UI displays («تومان»).
 * Storing ISO Rial would require a ×10 conversion at every boundary and would
 * reintroduce exactly the 10× pricing error this constant exists to prevent.
 * `IRR` remains correct only if prices are ever genuinely Rial-denominated.
 */

/** The persisted unit of `Perfume.price`. Never store `"IRR"`/`"IRT"`/`"Toman"`. */
export const STORE_CURRENCY = "TOMAN" as const;

/** Persian unit label for the admin UI. Display only — never persisted. */
export const CURRENCY_LABEL_FA = "تومان";

export type StoreCurrency = typeof STORE_CURRENCY;
