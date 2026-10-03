"use client";

import { useState, useTransition } from "react";

import { generateProfileAction } from "@/app/admin/perfumes/actions";
import { PROFILE_MIN, PROFILE_MAX } from "@/lib/fragrance/profile";
import { PROFILE_AXES } from "@/lib/fragrance/profile";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { DESCRIPTOR_DIMENSIONS } from "@/lib/fragrance/profile";
import type { FragranceDimension } from "@/types/fragrance";

/**
 * The fragrance-profile editor for the admin form.
 *
 * Client component (form interaction only — it never touches the DB). The nine
 * canonical axes are rendered from `PROFILE_AXES` (the single source of
 * truth) with Persian labels from the shared label module; descriptors are
 * optional. Numeric inputs enforce integer 0–100 client-side; the server
 * re-validates everything.
 */
const DESCRIPTOR_LABELS: Partial<Record<FragranceDimension, string>> = {
  sweet: "شیرین",
  woody: "چوبی",
  spicy: "ادویه‌ای",
  floral: "گلی",
  citrus: "مرکباتی",
  aquatic: "آبی",
  smoky: "دودی",
  clean: "تمیز",
  longevity: "ماندگاری",
  projection: "پخش بوی",
};

/** Loose view shape for the form — the server validator owns the real types. */
export interface ProfileEditorValues {
  matching: Record<string, number>;
  descriptors: Record<string, number | null>;
  family?: string;
  notes: string[];
  season?: string;
  occasion?: string;
}

interface ProfileEditorProps {
  /** Existing profile for edit mode; omitted for create. */
  profile?: ProfileEditorValues;
  /** Field-level Persian error messages from the server validation. */
  errors?: Record<string, string>;
  /** perfumeId when editing (facts come from the stored row); undefined on create. */
  perfumeId?: string;
  storeId: string;
}

export default function ProfileEditor({ profile, errors, perfumeId, storeId }: ProfileEditorProps) {
  // Phase 11: AI-assisted generation. Generation and save are separate steps —
  // the button fills the descriptor inputs with the reviewed suggestion; the
  // admin saves through the normal form submit. Nothing is written on generate.
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const generate = () => {
    const form = document.getElementById("perfume-form");
    const formData = form instanceof HTMLFormElement ? new FormData(form) : new FormData();
    startTransition(async () => {
      const result = await generateProfileAction(perfumeId, storeId, formData);
      setFeedback({ ok: result.ok, message: result.message });
      if (result.ok) {
        for (const [dimension, value] of Object.entries(result.profile.descriptors)) {
          const input = document.getElementById(`profile-${dimension}`) as HTMLInputElement | null;
          if (input && typeof value === "number") {
            input.value = String(value);
          }
        }
      }
    });
  };

  return (
    <fieldset className="flex flex-col gap-5 rounded-3xl border border-border-soft bg-surface p-5 sm:p-6">
      <legend className="px-2 text-sm font-semibold text-accent">
        پروفایل عطری
      </legend>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-7 text-muted">
          این نُه محور، پایهٔ تطبیق عطر با پروفایل مشتری است؛ مقدار دقیق بین ۰ تا ۱۰۰
          (عدد صحیح) وارد کنید.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="flex min-h-11 items-center justify-center rounded-2xl border border-accent/50 px-4 text-sm text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "در حال تولید…" : "تولید پروفایل با هوش مصنوعی"}
        </button>
      </div>

      {feedback ? (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={`rounded-2xl border p-4 text-sm ${
            feedback.ok
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROFILE_AXES.map((dimension) => (
          <div key={dimension} className="flex flex-col gap-1">
            <label htmlFor={`profile-${dimension}`} className="text-sm">
              {PERSONALITY_LABELS[dimension]}
            </label>
            <input
              id={`profile-${dimension}`}
              name={dimension}
              type="number"
              inputMode="numeric"
              min={PROFILE_MIN}
              max={PROFILE_MAX}
              step={1}
              required
              defaultValue={profile?.matching[dimension] ?? 50}
              aria-invalid={errors?.[dimension] ? true : undefined}
              aria-describedby={errors?.[dimension] ? `error-${dimension}` : undefined}
              className="tnum h-11 rounded-2xl border border-border-soft bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none"
            />
            {errors?.[dimension] ? (
              <span id={`error-${dimension}`} role="alert" className="text-xs text-red-400">
                {errors[dimension]}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">ویژگی‌های اختیاری</h3>
        <p className="text-xs text-muted">
          این مقادیر اختیاری‌اند و روی امتیاز تطبیق اثر نمی‌گذارند.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DESCRIPTOR_DIMENSIONS.map((dimension) => (
          <div key={dimension} className="flex flex-col gap-1">
            <label htmlFor={`profile-${dimension}`} className="text-sm">
              {DESCRIPTOR_LABELS[dimension]}
            </label>
            <input
              id={`profile-${dimension}`}
              name={dimension}
              type="number"
              inputMode="numeric"
              min={PROFILE_MIN}
              max={PROFILE_MAX}
              step={1}
              defaultValue={profile?.descriptors[dimension] ?? ""}
              aria-invalid={errors?.[dimension] ? true : undefined}
              className="tnum h-11 rounded-2xl border border-border-soft bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
