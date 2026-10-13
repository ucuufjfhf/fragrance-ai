/**
 * One emblem per fragrance archetype (Phase E).
 *
 * Same visual language as `components/ui-icons.tsx`: a 24×24 grid, `fill="none"`,
 * `stroke="currentColor"`, 1.8 stroke width and round caps/joins, so an emblem
 * inherits the archetype's accent color from `text-accent` and matches the
 * weight of every other icon in the app. Each icon is `aria-hidden`: the emblem
 * is decorative, and the seal that wraps it carries the accessible name (see
 * `QuizResultCard` / `ResultsView`).
 *
 * Deliberately generic shapes — an emblem is chosen by archetype id only
 * (`components/archetype-icon-map.ts`) and never encodes a score, a rank or any
 * other engine value.
 */
export interface ArchetypeIconProps {
  /** Sizing/placement utilities; color always comes from `currentColor`. */
  className?: string;
}

/**
 * The seal's emblems pop into place as part of the archetype reveal cascade.
 *
 * Declared here — next to the icons it animates — rather than in `globals.css`,
 * so the archetype emblems' motion contract ships with the icons themselves.
 * The reduced-motion bypass inside this block is intentionally the LAST rule:
 * the style element renders after the stylesheet, so a utility variant
 * (`motion-reduce:animate-none`) could not win the cascade against it.
 */
export const ARCHETYPE_ICON_POP_CSS = `
@keyframes archetype-icon-pop {
  0% { opacity: 0; transform: scale(0.5); }
  62% { opacity: 1; transform: scale(1.09); }
  80% { transform: scale(0.97); }
  100% { opacity: 1; transform: scale(1); }
}
.archetype-icon-pop {
  animation: archetype-icon-pop 560ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
  transform-origin: center;
}
@media (prefers-reduced-motion: reduce) {
  .archetype-icon-pop { animation: none; }
}
`;

/** Mysterious Explorer — a compass rose turning toward the unknown. */
export function MysteriousExplorerIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="8.8" />
      <path
        d="M15.7 8.3 13.4 13.4 8.3 15.7 10.6 10.6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Clean Minimalist — a single water drop: nothing added, nothing spare. */
export function CleanMinimalistIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M12 3.5c3.3 3.8 5.5 6.7 5.5 9.3a5.5 5.5 0 0 1-11 0c0-2.6 2.2-5.5 5.5-9.3Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Charismatic — a radiant burst: presence that carries across the room. */
export function CharismaticIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="3.3" />
      <path
        d="M12 2.6v2.5M12 18.9v2.5M2.6 12h2.5M18.9 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Elegant Classic — a brilliant-cut gem: considered, timeless, restrained. */
export function ElegantClassicIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M12 3.6 20 9.2l-8 11.2-8-11.2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9.2h16M9.3 9.2 12 3.6M14.7 9.2 12 3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Free Spirit — moving air: open, changing, never boxed in. */
export function FreeSpiritIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M3.4 8.6h8.4a2.9 2.9 0 1 0-2.9-2.9M3.4 13.6h11.8a3 3 0 1 1-3 3M3.4 18.6H10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Romantic — a heart: warmth, attachment, a memory you keep. */
export function RomanticIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M12 20.3c-4.7-4.2-7.6-6.9-7.6-10.2a4.6 4.6 0 0 1 7.6-3 4.6 4.6 0 0 1 7.6 3c0 3.3-2.9 6-7.6 10.2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bold One — a flame: heat, risk and a loud trail. */
export function BoldOneIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M13.1 3c2.2 3.2 4.1 5.7 4.1 9a5.2 5.2 0 0 1-10.4 0c0-1.7.5-3.2 1.5-4.6-.6 2.2.2 3.6 1.5 4.3-1.3-2.9-.6-5.9 3.3-8.7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sophisticated — a minimal crown: quiet authority, deep and unhurried. */
export function SophisticatedIcon({ className = "h-5 w-5" }: ArchetypeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M3.6 18.4 2.6 7.6l5.1 3.5L12 5.2l4.3 5.9 5.1-3.5-1 10.8H3.6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.6 15.2h16.8" strokeLinecap="round" />
    </svg>
  );
}
