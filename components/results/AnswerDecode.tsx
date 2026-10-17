import { toPersianDigits } from "@/lib/persian";
import type { DecodedAnswer } from "@/lib/personality/answer-decode";

/**
 * “How did I get here” decode (Phase 3, Pinrose lineage).
 *
 * The centroid explainer above says HOW the archetype was picked (systemic:
 * nearest match over all 9 axes). This section is personal: the shopper's own
 * recorded answers that pushed hardest on the profile's top traits, each
 * shown as their answer label mapped to its trait with the computed share.
 *
 * Presentational only: every item comes from `decodeAnswers`, whose links are
 * the options' own scoring vectors — never invented. An empty list renders
 * nothing (legacy links carry no answer sheet), so the section degrades to
 * absence instead of a dead end.
 */
export default function AnswerDecode({
  items,
}: {
  items: readonly DecodedAnswer[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-0.01em] text-foreground sm:text-3xl">
          چطور به اینجا رسیدید؟
        </h2>
        <p className="font-editorial text-sm leading-7 text-muted">
          این‌ها انتخاب‌های شما هستند که بیشترین سهم را در پروفایل شما داشتند:
        </p>
      </div>

      <ol className="flex list-none flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.questionId}
            className="flex flex-col gap-1.5 rounded-2xl border border-border-soft bg-surface p-4"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-accent-soft px-3 py-0.5 font-medium text-foreground">
                {item.traitLabel}
              </span>
              <span className="tnum mr-auto text-xs text-muted">
                {toPersianDigits(Math.round(item.share * 100))}٪
              </span>
            </div>
            <p className="leading-8 text-foreground">«{item.optionLabel}»</p>
            <p className="text-xs leading-7 text-muted">
              پاسخ شما به: {item.questionPrompt}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
