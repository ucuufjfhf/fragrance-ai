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

    expect(html).toContain("عطر مناسب خودت رو پیدا کن");
    expect(html).toContain("شروع آزمون");
    expect(withoutJoiners(html)).toContain(
      withoutJoiners("نه یک تست روانشناسی"),
    );
  });

  it("renders a question screen with every option as a radio card", () => {
    const question = QUIZ_QUESTIONS[2];
    const html = render(<Question question={question} onSelect={noopSelect} />);

    expect(html).toContain(question.prompt);

    for (const option of question.options) {
      expect(html).toContain(option.label);
      expect(html).toContain(`value="${option.id}"`);
    }

    expect(html).toContain('type="radio"');
    expect(html).toContain(`name="${question.id}"`);
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

    expect(html).toContain("پروفایل عطری تو");
    expect(html).toContain(result.archetype.label);
    expect(html).toContain(result.archetype.fragranceHint);
    expect(html).toContain("پروفایل شخصیتی تو");
    expect(html).toContain("شروع دوباره");
  });
});

/**
 * The result phase opens with the full-screen reveal STAGE — a flow step, not a
 * modal: no dialog role, no backdrop, no focus trap and no scroll lock are
 * emitted, and the stage is what a render of the phase begins with.
 */
describe("archetype reveal stage", () => {
  it("is what the result phase opens with, ahead of the profile card", () => {
    const result = computedResult();
    const html = render(<QuizResultCard result={result} onRestart={noopRestart} />);

    // The stage: the emblem and its CTA.
    expect(html).toContain(`/archetypes/${result.archetype.id}.jpg`);
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

  it("emits its motion contract once, reduced-motion bypass last", () => {
    const html = render(
      <ArchetypeRevealStage
        archetypeId="bold-one"
        label="جسور"
        selectionBasis={SELECTION_BASIS}
        onContinue={noopContinue}
      />,
    );

    // One style block, one cascade: glow → emblem → line.
    expect((html.match(/<style>/g) ?? []).length).toBe(1);
    const glow = html.indexOf("archetype-stage-glow");
    const emblem = html.indexOf("archetype-stage-emblem");
    const line = html.indexOf("archetype-stage-line");
    expect(glow).toBeGreaterThan(-1);
    expect(emblem).toBeGreaterThan(glow);
    expect(line).toBeGreaterThan(emblem);

    // The three lines are staggered after the emblem, and the whole cascade
    // finishes inside 900ms (longest inline delay 460ms + 420ms).
    expect(html).toContain("animation-delay:240ms");
    expect(html).toContain("animation-delay:360ms");
    expect(html).toContain("animation-delay:460ms");

    // Reduced-motion bypass present and written last (after every base rule).
    const media = html.indexOf("@media (prefers-reduced-motion: reduce)");
    const baseLine = html.indexOf(".archetype-stage-line {");
    const disabled = html.indexOf("animation: none;");
    expect(media).toBeGreaterThan(baseLine);
    expect(disabled).toBeGreaterThan(media);
  });
});

describe("audience step rendering", () => {
  it("renders the approved question and both options as radio cards", () => {
    const html = render(<AudienceStep onSelect={noopSelect} />);

    expect(html).toContain(AUDIENCE_QUESTION);

    for (const option of AUDIENCE_OPTIONS) {
      expect(html).toContain(option.label);
      expect(html).toContain(`value="${option.id}"`);
    }

    expect(html).toContain('type="radio"');
    expect(html).toContain('name="audience"');
    // The audience screen is not a question: no «سؤال …» progress label.
    expect(html).not.toContain("سؤال");
  });

  it("keeps the audience selection visible when the shopper returns from Q1", () => {
    const selected = render(<AudienceStep selected="WOMEN" onSelect={noopSelect} />);
    const unselected = render(<AudienceStep selected={null} onSelect={noopSelect} />);

    expect(selected).toContain('value="WOMEN"');
    expect(selected).toContain('checked=""');
    expect(selected).not.toBe(unselected);
  });

  it("keeps the intro promising exactly 10 questions", () => {
    const html = render(<Quiz />);

    expect(withoutJoiners(html)).toContain(withoutJoiners("۱۰ سؤال"));
  });
});
