/**
 * Inline icon set. Every icon is a currentColor stroke SVG with no external
 * dependency, sized by the `className` the caller passes.
 *
 * `StarMark` is the Fiage brand mark (a four-point atelier star); the celestial
 * companions below are used sparingly — one per section at most.
 */

export function BrandMark({ className = "h-5 w-5" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M12 3c1.2 4.2 3.8 6.8 8 8-4.2 1.2-6.8 3.8-8 8-1.2-4.2-3.8-6.8-8-8 4.2-1.2 6.8-3.8 8-8Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** The brand mark, filled — for accents on dark surfaces. */
export function StarMark({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M12 2.2c1.35 4.6 3.85 7.1 8.45 8.45-4.6 1.35-7.1 3.85-8.45 8.45-1.35-4.6-3.85-7.1-8.45-8.45C8.15 9.3 10.65 6.8 12 2.2Z" /></svg>;
}

export function BottleMark({ className = "h-5 w-5" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}><path d="M9.5 2.5h5v3.2l2 1.9v11.9a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5V7.6l2-1.9V2.5Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M7.5 12.4h9" strokeLinecap="round" /><path d="M10.8 2.5h2.4" strokeLinecap="round" /></svg>;
}

export function ArrowMark({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** RTL-correct "forward" arrow (points left, the reading direction). */
export function ArrowLeftMark({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}><path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ArchiveMark({ className = "h-6 w-6" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function WarningMark({ className = "h-5 w-5" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="m12 3 9 17H3L12 3Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 9v4M12 16h.01" strokeLinecap="round" /></svg>;
}

/** A thin crescent — used for "night / atmosphere" labels. */
export function MoonMark({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Compass / discovery — the results-empty and nav mark. */
export function CompassMark({ className = "h-5 w-5" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 5-5 2.2 2.2-5 5-2.2Z" strokeLinejoin="round" /></svg>;
}

/** Ranking / medal outline for recommendation ranks. */
export function RankMark({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}><circle cx="12" cy="14" r="5" /><path d="M9 4h6l-1.5 5h-3L9 4Z" strokeLinejoin="round" /></svg>;
}

export function CheckMark({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" className={className}><path d="m5 13 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
