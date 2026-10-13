import { BottleMark } from "@/components/ui-icons";
import {
  BoldOneIcon,
  CharismaticIcon,
  CleanMinimalistIcon,
  ElegantClassicIcon,
  FreeSpiritIcon,
  MysteriousExplorerIcon,
  RomanticIcon,
  SophisticatedIcon,
  type ArchetypeIconProps,
} from "@/components/archetype-icons";
import type { ArchetypeId } from "@/types/personality";
import { createElement, type ComponentType } from "react";

/**
 * Maps an archetype id to its emblem (Phase E).
 *
 * A pure lookup, no React state and no engine data: the same id always resolves
 * to the same icon, so the reveal seal can never disagree with the archetype the
 * Phase 1 engine picked. `Record<ArchetypeId, …>` is deliberately exhaustive —
 * adding an archetype to `ArchetypeId` becomes a compile error here instead of a
 * silently generic emblem.
 *
 * Read-only with respect to `lib/personality/archetypes.ts`: nothing in the
 * archetype definitions, the scoring, the engine or the nearest-centroid logic
 * is touched or consulted.
 */
export type ArchetypeIcon = ComponentType<ArchetypeIconProps>;

export const ARCHETYPE_ICONS: Record<ArchetypeId, ArchetypeIcon> = {
  "mysterious-explorer": MysteriousExplorerIcon,
  "clean-minimalist": CleanMinimalistIcon,
  charismatic: CharismaticIcon,
  "elegant-classic": ElegantClassicIcon,
  "free-spirit": FreeSpiritIcon,
  romantic: RomanticIcon,
  "bold-one": BoldOneIcon,
  sophisticated: SophisticatedIcon,
};

/**
 * The emblem for an archetype id.
 *
 * Falls back to the generic bottle glyph for an unknown id (an unreachable state
 * today, since the results URL rejects unknown archetypes) — the seal is never
 * rendered empty, and no id is ever guessed to be a specific archetype.
 */
export function archetypeIconFor(archetypeId: ArchetypeId | string): ArchetypeIcon {
  return ARCHETYPE_ICONS[archetypeId as ArchetypeId] ?? BottleMark;
}

export interface ArchetypeEmblemProps {
  /** The archetype whose emblem should render. */
  archetypeId: ArchetypeId | string;
  /** Sizing/motion utilities; color comes from `currentColor`. */
  className?: string;
}

/**
 * Renders an archetype's emblem.
 *
 * A module-level component that resolves the icon itself, so callers pass an id
 * and never hold a component reference. `createElement` (rather than a local
 * `const Icon = …; <Icon />`) keeps the resolver lint-clean: the local-variable
 * form reads as "a component created during render" to the React compiler rules,
 * which would be wrong to silence here.
 */
export function ArchetypeEmblem({ archetypeId, className }: ArchetypeEmblemProps) {
  return createElement(archetypeIconFor(archetypeId), { className });
}
