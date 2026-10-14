"use client";

import AmbientParticles from "@/components/AmbientParticles";
import ArchetypeRevealStage from "@/components/quiz/ArchetypeRevealStage";
import FragranceProfileCard, {
  SELECTION_BASIS,
  type FragranceProfileCardProps,
} from "@/components/quiz/FragranceProfileCard";

import { useState, type CSSProperties } from "react";

/** The props of the result phase — the profile card's own contract, forwarded. */
export type QuizResultCardProps = FragranceProfileCardProps;

/**
 * The result phase, as two steps of the quiz flow:
 *
 *   1. the archetype reveal stage (`ArchetypeRevealStage`) — the arrival: the
 *      archetype's emblem large on a full-screen stage, with the name, the
 *      selection-basis line and the CTA;
 *   2. the Fragrance Profile card (`FragranceProfileCard`) — the profile, the
 *      fragrance hint and the trait bars, exactly as before, whose own CTA opens
 *      the optional refinement step and then `/result`.
 *
 * Steps, not a modal: the stage is rendered IN PLACE of the card (no overlay, no
 * backdrop, no rival `role="dialog"`), the page keeps scrolling normally and no
 * focus is trapped. The CTA advances to the card and nothing else — the flow
 * onwards (refinement → `/result`) is untouched.
 */
export default function QuizResultCard(props: QuizResultCardProps) {
  const { archetype } = props.result;

  // Which step of the result phase is on screen. Local to this screen and
  // reset when the phase is re-entered — the same lifetime the reveal had
  // before, so returning from the refinement step replays it exactly once.
  const [revealed, setRevealed] = useState(false);

  return (
    <section
      className="relative flex flex-col gap-5 transition-colors duration-300"
      style={
        {
          "--accent": archetype.accentColor,
          "--accent-soft": `color-mix(in srgb, ${archetype.accentColor} 14%, white)`,
          "--accent-contrast":
            archetype.id === "clean-minimalist" || archetype.id === "elegant-classic"
              ? "#2A2420"
              : "#FFFFFF",
        } as CSSProperties
      }
    >
      {/* Shared ambient background — identical implementation to the
          Recommendations screen (components/results/ResultsView.tsx). Rendered
          once for the whole phase, so it survives the step change. */}
      <AmbientParticles />

      {revealed ? (
        <FragranceProfileCard {...props} />
      ) : (
        <ArchetypeRevealStage
          archetypeId={archetype.id}
          label={archetype.label}
          selectionBasis={SELECTION_BASIS}
          onContinue={() => setRevealed(true)}
        />
      )}
    </section>
  );
}
