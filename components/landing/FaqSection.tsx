"use client";

import { useState } from "react";

/**
 * Honest FAQ for the landing page — accessible accordion.
 *
 * Real <button>s with aria-expanded/aria-controls (keyboard operable by
 * default, no custom key handling needed). One open at a time; all closed by
 * default. Every answer states only verifiable facts: no accuracy percentages,
 * no invented stats, no testimonials, no counters.
 */
/** Exported for tests: every claim below must stay verifiable. */
export const FAQS = [
  {
    id: "accuracy",
    question: "این آزمون چقدر دقیقه؟",
    answer:
      "از ۱۰ جواب شما یک پروفایل سلیقه با ۹ محور ساخته میشه و نزدیک‌ترین پروفایل از بین ۸ پروفایل به شما پیشنهاد میشه. این یک مدل سلیقه‌ست برای انتخاب عطر — نه یک تست آزمایشگاهی — پس نتیجه رو یک راهنمای خوب بدونید، نه یک حکم قطعی.",
  },
  {
    id: "signup",
    question: "برای دیدن نتیجه باید ثبت‌نام کنم؟",
    answer:
      "نه. بدون ثبت‌نام و بدون دادن هیچ اطلاعاتی آزمون رو انجام می‌دید و نتیجه‌تون رو همون لحظه می‌بینید.",
  },
  {
    id: "catalog",
    question: "عطرها از کجا انتخاب می‌شن؟",
    answer:
      "از یک کاتالوگ ۵۹ عطری، بر اساس اینکه پروفایل رایحه هر عطر چقدر به پروفایل شما نزدیکه. سه عطری که بیشترین هماهنگی رو دارن بهتون پیشنهاد میشه، همراه با توضیح اینکه چرا هر کدوم بهتون میاد.",
  },
  {
    id: "price",
    question: "قیمت و خرید عطرها رو از کجا ببینم؟",
    answer:
      "روی هر نتیجه یک دکمه «مشاهده در ترب» هست که جست‌وجوی همون عطر در ترب رو باز می‌کنه؛ اونجا می‌تونید قیمت‌ها رو مقایسه کنید و از فروشنده مورد نظرتون بخرید.",
  },
] as const;

export default function FaqSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="faq-heading"
      className="border-t border-border-soft bg-surface-2"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 lg:py-20">
        <h2
          id="faq-heading"
          className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
        >
          سوال‌های پرتکرار
        </h2>
        <div className="mt-8 flex flex-col gap-3">
          {FAQS.map((faq) => {
            const open = openId === faq.id;
            return (
              <div
                key={faq.id}
                className="rounded-2xl border border-border-soft bg-surface"
              >
                <h3>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`faq-panel-${faq.id}`}
                    id={`faq-button-${faq.id}`}
                    onClick={() => setOpenId(open ? null : faq.id)}
                    className="flex min-h-12 w-full items-center justify-between gap-4 px-5 py-3 text-right font-medium text-foreground"
                  >
                    <span>{faq.question}</span>
                    <span
                      aria-hidden="true"
                      className="tnum shrink-0 text-xl leading-none text-accent"
                    >
                      {open ? "−" : "+"}
                    </span>
                  </button>
                </h3>
                {open ? (
                  <p
                    id={`faq-panel-${faq.id}`}
                    role="region"
                    aria-labelledby={`faq-button-${faq.id}`}
                    className="px-5 pb-5 text-sm leading-8 text-muted"
                  >
                    {faq.answer}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
