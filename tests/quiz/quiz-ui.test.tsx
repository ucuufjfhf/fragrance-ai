import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ArchetypeRevealStage from "@/components/quiz/ArchetypeRevealStage";
import AudienceStep from "@/components/quiz/AudienceStep";
import FragranceProfileCard, {
  SELECTION_BASIS,
} from "@/components/quiz/FragranceProfileCard";
import ProgressBar from "@/components/quiz/ProgressBar";
import Question from "@/components/quiz/Question";
import Quiz from "@/components/quiz/Quiz";
import QuizResultCard from "@/components/quiz/QuizResultCard";
import { AUDIENCE_OPTIONS, AUDIENCE_QUESTION } from "@/lib/audience";
import { ARCHETYPES } from "@/lib/personality/archetypes";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";

/**
 * Server-side render smoke tests.
 *
 * They need no browser and no jsdom: rendering to static markup proves the
 * components execute and emit the Persian copy, and the same shared engine
 * produces the result card content.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Persian copy mixes zero-width non-joiners; comparing without them keeps the
 * assertions readable and immune to invisible-character differences.
 */
function withoutJoiners(value: string): string {
  return value.replace(/\u200c/g, "");
}

const noopSelect = (): void => undefined;

/**
 * Visible text with the markup stripped: the marker-wipe highlight wraps part
 * of a prompt in a span, so the approved copy is contiguous in what the
 * shopper reads but not in the raw HTML.
 */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
const noopRestart = (): void => undefined;
const noopContinue = (): void => undefined;

/** A deterministic completed profile, through the REAL scorer. */
function computedResult() {
  return scoreQuiz(
    QUIZ_QUESTIONS.map((question) => ({
      questionId: question.id,
      optionId: question.options[0].id,
    })),
  );
}

describe("quiz UI rendering", () => {
  it("renders the intro screen with Persian copy and a start button", () => {
    const html = render(<Quiz />);

    expect(textOf(html)).toContain("عطر مناسب خودتون رو پیدا کنید");
    expect(html).toContain("شروع آزمون");
    expect(withoutJoiners(html)).toContain(
      withoutJoiners("نه یک تست روانشناسی"),
    );
  });

  it("renders a question screen with every option as a real button row", () => {
    const question = QUIZ_QUESTIONS[2];
    const html = render(<Question question={question} onSelect={noopSelect} />);

    expect(textOf(html)).toContain(question.prompt);

    for (const option of question.options) {
      expect(html).toContain(option.label);
      expect(html).toContain(`data-option-id="${option.id}"`);
    }

    // Real <button> rows (Phase 1 editorial), never radio inputs — one per
    // option, all pressed-false until the shopper chooses.
    expect(html).not.toContain('type="radio"');
    expect(html).toContain(`data-question-id="${question.id}"`);
    expect(
      (html.match(/<button[^>]*data-option-id=/g) ?? []).length,
    ).toBe(question.options.length);
    expect(
      (html.match(/aria-pressed="false"/g) ?? []).length,
    ).toBe(question.options.length);
  });

  it("renders the progress label with Persian digits and a progressbar role", () => {
    const html = render(<ProgressBar current={3} total={10} />);

    expect(html).toContain("سؤال ۳ از ۱۰");
    expect(html).toContain("۳۰٪");
    expect(html).toContain('role="progressbar"');
  });

  it("renders the profile card from a computed profile", () => {
    const result = computedResult();

    // Step 2 of the result phase, rendered directly: the step that follows the
    // reveal stage.
    const html = render(
      <FragranceProfileCard result={result} onRestart={noopRestart} />,
    );

    expect(html).toContain("پروفایل عطری شما");
    expect(html).toContain(result.archetype.label);
    expect(html).toContain(result.archetype.fragranceHint);
    expect(html).toContain("پروفایل شخصیتی شما");
    expect(html).toContain("شروع دوباره");
  });
});

/**
 * The result phase opens with the full-screen reveal STAGE — a flow step, not a
 * modal: no dialog role, no backdrop, no focus trap and no scroll lock are
 * emitted, and the stage is what a render of the phase begins with.
 *
 * The stage is a fogged-mirror focus pull: the emblem sits behind fog and is
 * wiped clear by a light sweep. There is no unlock badge and no claimed copy —
 * the visual carries the meaning.
 */
describe("archetype reveal stage", () => {
  it("is what the result phase opens with, ahead of the profile card", () => {
    const result = computedResult();
    const html = render(<QuizResultCard result={result} onRestart={noopRestart} />);

    // The stage: the emblem behind fog, and the CTA.
    expect(html).toContain(`/archetypes/${result.archetype.id}.jpg`);
    expect(html).toContain("archetype-focus-fog");
    expect(html).toContain("دیدن نتایج");
    expect(withoutJoiners(html)).toContain(withoutJoiners(SELECTION_BASIS));

    // …and not yet the profile step behind it.
    expect(html).not.toContain("پروفایل شخصیتی تو");
    expect(html).not.toContain("دیدن عطرهای پیشنهادی");
  });

  it("renders as a full-height stage, never as a modal", () => {
    const html = render(
      <ArchetypeRevealStage
        archetypeId="mysterious-explorer"
        label="کاشف مرموز"
        selectionBasis={SELECTION_BASIS}
        onContinue={noopContinue}
      />,
    );

    expect(html).toContain("min-h-screen");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("aria-modal");
    expect(html).not.toContain("fixed inset-0");
  });

  it("opens behind fog: nothing sharp first, and no unlock language left", () => {
    const html = render(
      <ArchetypeRevealStage
        archetypeId="charismatic"
        label="جذاب"
        selectionBasis={SELECTION_BASIS}
        onContinue={noopContinue}
      />,
    );

    // The whole previous language is gone: no badge, no claim, no leftovers.
    expect(html).not.toContain("آرکتایپ شما باز شد");
    expect(html).not.toContain("archetype-unlock");
    expect(html).not.toContain("data-reveal-autofocus");

    // Polite second person, never the singular «تو». The explainer line is the
    // only other copy on the stage.
    expect(html).not.toMatch(/(^|[\s،؛:!؟«»"'().<>#=-])تو([\s،؛:!؟«»"'().<>#=-]|$)/u);

    // Two stacked copies of the SAME art — the crisp emblem with the fog drawn
    // over it — and one deduped preload hint for the pair, so the focus pull
    // never asks the browser for the artwork twice.
    expect((html.match(/src="\/archetypes\/charismatic\.jpg"/g) ?? []).length).toBe(2);
    expect((html.match(/href="\/archetypes\/charismatic\.jpg"/g) ?? []).length).toBe(1);

    // Entry is fogged, never sharp: the fog layer's base state is the WIPED
    // one (so a static run shows a sharp emblem), while its first keyframe —
    // held through the 300ms delay by `both` — is the fully fogged mirror.
    expect(html).toContain("filter: blur(22px) saturate(0.68) brightness(1.08)");
    expect(html).toContain(".archetype-focus-fog {\n");
    expect(html).toContain("clip-path: inset(0 100% 0 0);");
    expect(html).toContain("from { clip-path: inset(0 0% 0 0); }");
    expect(html).toContain(
      "archetype-focus-wipe 1300ms cubic-bezier(0.22, 1, 0.36, 1) 300ms both",
    );

    // A soft mist over the blur, on an opaque milky bed so the blur's soft rim
    // reads as fog on glass rather than a hole.
    expect(html).toContain(".archetype-focus-fog::after {");
    expect(html).toContain("background: color-mix(in srgb, var(--accent) 12%, white);");

    // Exactly one decorative sweep strip, transparent at rest.
    expect((html.match(/archetype-focus-sweep pointer-events-none/g) ?? []).length).toBe(1);
    expect(html).toContain(".archetype-focus-sweep {\n  opacity: 0;");

    // The fog is decoration: the only heading is still the archetype name.
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("wipes the fog from the right inward, locked to the light sweep", () => {
    const html = render(
      <ArchetypeRevealStage
        archetypeId="elegant-classic"
        label="کلاسیک شیک"
        selectionBasis={SELECTION_BASIS}
        onContinue={noopContinue}
      />,
    );

    // The remaining fog's right inset grows 0% → 100%: clarity arrives from the
    // right edge inward, matching the RTL reading direction.
    expect(html).toContain("@keyframes archetype-focus-wipe");
    expect(html).toContain("to { clip-path: inset(0 100% 0 0); }");

    // The sweep band travels the same way over the same window — one duration,
    // one delay, one easing as the clip — so the wet edge stays locked to the
    // light instead of drifting ahead of it.
    expect(html).toContain(
      "archetype-focus-sweep 1300ms cubic-bezier(0.22, 1, 0.36, 1) 300ms both",
    );
    expect(html).toContain("translateX(117%) skewX(-8deg)");
    expect(html).toContain("translateX(-50%) skewX(-8deg)");
    // The band is wide and starts at the right edge, so its centre tracks the
    // fog's trailing edge rather than cutting a thin line across the mirror.
    expect(html).toContain("archetype-focus-sweep pointer-events-none absolute inset-y-0 left-0 w-3/5");
  });

  it("renders all 8 archetypes, each with its own emblem and Persian label", () => {
    expect(ARCHETYPES).toHaveLength(8);

    for (const archetype of ARCHETYPES) {
      const html = render(
        <ArchetypeRevealStage
          archetypeId={archetype.id}
          label={archetype.label}
          selectionBasis={SELECTION_BASIS}
          onContinue={noopContinue}
        />,
      );

      expect(html).toContain(`/archetypes/${archetype.id}.jpg`);
      expect(html).toContain(archetype.label);
      // The accessible name on the emblem is the archetype's own label.
      expect(html).toContain(`aria-label="${archetype.label}"`);
      // The medallion and the hero emblem never disagree: the same mapped file
      // is used by both — 2 `src`s — with one deduped preload hint.
      expect(
        (html.match(new RegExp(`src="/archetypes/${archetype.id}\\.jpg"`, "g")) ?? []).length,
      ).toBe(2);
      // The fog carries the wide sweep band and the mist overlay for every id.
      expect(html).toContain("archetype-focus-fog");
      expect(html).toContain("archetype-focus-sweep");
    }
  });

  it("keeps the heading semantics and no emoji", () => {
    const html = render(
      <ArchetypeRevealStage
        archetypeId="romantic"
        label="رمانتیک"
        selectionBasis={SELECTION_BASIS}
        onContinue={noopContinue}
      />,
    );

    expect(html).toContain("<h1");
    expect(html).toContain(">رمانتیک</h1>");
    expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("emits one fog choreography, ~2.5s, reduced-motion bypass last", () => {
    const html = render(
      <ArchetypeRevealStage
        archetypeId="bold-one"
        label="جسور"
        selectionBasis={SELECTION_BASIS}
        onContinue={noopContinue}
      />,
    );

    // One style block, one cascade, declared in order:
    // fog (and its mist) → sweep → glow → lines.
    expect((html.match(/<style>/g) ?? []).length).toBe(1);
    const order = [
      ".archetype-focus-fog {\n  background:",
      ".archetype-focus-fog::after {",
      ".archetype-focus-sweep {\n  opacity: 0;",
      ".archetype-focus-glow {\n  animation:",
      ".archetype-focus-line { animation:",
    ].map((anchor) => html.indexOf(anchor));
    for (const [index, position] of order.entries()) {
      expect(position).toBeGreaterThan(-1);
      if (index > 0) expect(position).toBeGreaterThan(order[index - 1]);
    }

    // Nothing bounces: the glow eases out, the three text lines ease out.
    expect(html).toContain(
      "archetype-focus-glow 900ms cubic-bezier(0.22, 1, 0.36, 1) 700ms both",
    );
    expect(html).toContain(".archetype-focus-line { animation: archetype-focus-line 600ms ease-out both; }");
    // The previous overshoot curve is gone: this reveal never bounces.
    expect(html).not.toContain("cubic-bezier(0.34, 1.3, 0.64, 1)");

    // The glow blooms as the mirror clears, then the calm stagger: the whole
    // focus pull finishes at 2500ms (CTA: 1900ms inline delay + 600ms).
    expect(html).toContain("animation-delay:1500ms");
    expect(html).toContain("animation-delay:1700ms");
    expect(html).toContain("animation-delay:1900ms");
    expect(1900 + 600).toBeGreaterThanOrEqual(2400);
    expect(1900 + 600).toBeLessThanOrEqual(2600);

    // Reduced-motion bypass present and written last (after every base rule),
    // covering every animated piece of the focus pull.
    const media = html.indexOf("@media (prefers-reduced-motion: reduce)");
    const baseLine = html.indexOf(".archetype-focus-line {");
    const disabled = html.indexOf("animation: none;");
    expect(media).toBeGreaterThan(baseLine);
    expect(disabled).toBeGreaterThan(media);
    for (const name of [
      "archetype-focus-fog",
      "archetype-focus-sweep",
      "archetype-focus-glow",
      "archetype-focus-line",
    ]) {
      expect(html.slice(media, disabled + 200)).toContain(`.${name}`);
    }

    // Static run: the fog and the sweep are the two pieces whose base state is
    // not the finished look — both are invisible without animation, so the
    // stage renders sharp immediately.
    expect(html).toContain("clip-path: inset(0 100% 0 0);");
    expect(html).toContain(".archetype-focus-sweep {\n  opacity: 0;");
  });
});

describe("audience step rendering", () => {
  it("renders the approved question and both options as real button rows", () => {
    const html = render(<AudienceStep onSelect={noopSelect} />);

    expect(textOf(html)).toContain(AUDIENCE_QUESTION);

    for (const option of AUDIENCE_OPTIONS) {
      expect(html).toContain(option.label);
      expect(html).toContain(`data-option-id="${option.id}"`);
    }

    expect(html).not.toContain('type="radio"');
    expect(html).toContain('data-question-id="audience"');
    // The audience screen is not a question: no «سؤال …» progress label.
    expect(html).not.toContain("سؤال");
  });

  it("renders vertical photo cards with the label above the photo", () => {
    const html = render(<AudienceStep onSelect={noopSelect} />);

    // One row, two cards side by side — desktop and mobile alike.
    expect(html).toContain("grid-cols-2");

    // Small, confident pair — never billboards: the grid is capped and
    // centred (240px mobile, 640px desktop), and the responsive sizes match.
    expect(html).toContain("mx-auto");
    expect(html).toContain("max-w-[240px]");
    expect(html).toContain("sm:max-w-[640px]");
    expect(html).toContain(
      'sizes="(max-width: 640px) 32vw, (max-width: 1023px) 40vw, 330px"',
    );

    // Each card is a whole-card button holding exactly one label and one
    // photo, with the label preceding the photo in DOM order.
    const cards = html.split("<button").slice(1);
    expect(cards).toHaveLength(AUDIENCE_OPTIONS.length);
    for (const option of AUDIENCE_OPTIONS) {
      const card = cards.find((entry) =>
        entry.includes(`data-option-id="${option.id}"`),
      );
      expect(card).toBeDefined();
      const labelIndex = card!.indexOf(option.label);
      const imgIndex = card!.indexOf("<img");
      expect(labelIndex).toBeGreaterThan(-1);
      expect(imgIndex).toBeGreaterThan(labelIndex);
    }

    // Photos are decorative: empty alt and hidden from assistive tech, while
    // the accessible name comes from the label.
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
  });

  it("maps each portrait to its option id, never by label text", () => {
    const html = render(<AudienceStep onSelect={noopSelect} />);
    const cards = html.split("<button").slice(1);

    const cardFor = (id: string) =>
      cards.find((card) => card.includes(`data-option-id="${id}"`));

    // next/image URL-encodes the src (%2F…), so match the encoded form.
    expect(cardFor("WOMEN")).toContain("%2Faudience%2Faudience-woman.webp");
    expect(cardFor("MEN")).toContain("%2Faudience%2Faudience-man.webp");
    // No card mixes the portraits up.
    expect(cardFor("WOMEN")).not.toContain("audience-man.webp");
    expect(cardFor("MEN")).not.toContain("audience-woman.webp");
  });

  it("keeps the audience selection visible when the shopper returns from Q1", () => {
    const selected = render(<AudienceStep selected="WOMEN" onSelect={noopSelect} />);
    const unselected = render(<AudienceStep selected={null} onSelect={noopSelect} />);

    expect(selected).toContain('data-option-id="WOMEN"');
    expect(selected).toContain('aria-pressed="true"');
    expect(selected).not.toBe(unselected);
  });

  it("keeps the intro promising exactly 10 questions", () => {
    const html = render(<Quiz />);

    expect(withoutJoiners(html)).toContain(withoutJoiners("۱۰ سؤال"));
  });
});
