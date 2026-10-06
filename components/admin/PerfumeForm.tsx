"use client";

import { useActionState } from "react";

import ProfileEditor, {
  type ProfileEditorValues,
} from "@/components/admin/ProfileEditor";
import type { AdminActionState } from "@/app/admin/perfumes/actions";
import { CURRENCY_LABEL_FA } from "@/lib/pricing/currency";

/**
 * The admin perfume form (create and edit share it).
 *
 * Client component: it only renders inputs and submits FormData through the
 * server action; validation and mutation happen server-side and come back as
 * `{ ok, message, errors }` state, rendered next to the fields.
 */

const GENDER_OPTIONS = [
  { value: "UNISEX", label: "یونیسکس" },
  { value: "MEN", label: "مردانه" },
  { value: "WOMEN", label: "زنانه" },
];

const SEASON_OPTIONS = [
  { value: "", label: "— انتخاب فصل —" },
  { value: "SPRING", label: "بهار" },
  { value: "SUMMER", label: "تابستان" },
  { value: "AUTUMN", label: "پاییز" },
  { value: "WINTER", label: "زمستان" },
  { value: "ALL", label: "همهٔ فصل‌ها" },
];

const OCCASION_OPTIONS = [
  { value: "", label: "— انتخاب مناسبت —" },
  { value: "DAILY", label: "روزمره" },
  { value: "DATE", label: "قرار" },
  { value: "PARTY", label: "مهمانی" },
  { value: "OFFICE", label: "اداری" },
  { value: "FORMAL", label: "رسمی" },
];

interface PerfumeFormValues {
  name: string;
  brand: string;
  slug: string | null;
  description: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  gender: string;
  price: number | null;
  inStock: boolean;
  active: boolean;
  family: string | null;
  notes: string[];
  season: string | null;
  occasion: string | null;
  matching: Record<string, number>;
  descriptors: Record<string, number | null>;
}

// PerfumeFormValues matches the editor's loose view shape by design.

export interface PerfumeFormProps {
  storeId: string;
  /** Omitted on the create form. */
  perfumeId?: string;
  values?: PerfumeFormValues;
  errors?: Record<string, string>;
  /** Bound server action: (prev, formData) => state. */
  action: (prev: AdminActionState | null, formData: FormData) => Promise<AdminActionState>;
  submitLabel: string;
}

const inputClass =
  "h-11 w-full rounded-2xl border border-border-soft bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span role="alert" className="text-xs text-red-400">
      {message}
    </span>
  );
}

export default function PerfumeForm({
  values,
  errors,
  action,
  submitLabel,
  perfumeId,
  storeId,
}: PerfumeFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const fieldErrors = { ...errors, ...state?.errors };

  return (
    <form id="perfume-form" action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-5 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-accent">
          اطلاعات محصول
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm">
              نام عطر *
            </label>
            <input
              id="name"
              name="name"
              required
              maxLength={200}
              defaultValue={values?.name ?? ""}
              aria-invalid={fieldErrors?.name ? true : undefined}
              className={inputClass}
            />
            <FieldError message={fieldErrors?.name} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="brand" className="text-sm">
              برند *
            </label>
            <input
              id="brand"
              name="brand"
              required
              maxLength={200}
              defaultValue={values?.brand ?? ""}
              aria-invalid={fieldErrors?.brand ? true : undefined}
              className={inputClass}
            />
            <FieldError message={fieldErrors?.brand} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="slug" className="text-sm">
              نامک (اختیاری)
            </label>
            <input
              id="slug"
              name="slug"
              dir="ltr"
              maxLength={200}
              defaultValue={values?.slug ?? ""}
              className={inputClass}
            />
            <FieldError message={fieldErrors?.slug} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="gender" className="text-sm">
              جنسیت
            </label>
            <select id="gender" name="gender" defaultValue={values?.gender ?? "UNISEX"} className={inputClass}>
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="price" className="text-sm">
              قیمت ({CURRENCY_LABEL_FA}، اختیاری)
            </label>
            <input
              id="price"
              name="price"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={values?.price ?? ""}
              className={inputClass}
            />
            <FieldError message={fieldErrors?.price} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="productUrl" className="text-sm">
              آدرس صفحه محصول (اختیاری)
            </label>
            <input
              id="productUrl"
              name="productUrl"
              type="url"
              dir="ltr"
              defaultValue={values?.productUrl ?? ""}
              className={inputClass}
            />
            <FieldError message={fieldErrors?.productUrl} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="imageUrl" className="text-sm">
              آدرس تصویر (اختیاری)
            </label>
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              dir="ltr"
              defaultValue={values?.imageUrl ?? ""}
              className={inputClass}
            />
            <FieldError message={fieldErrors?.imageUrl} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm">
            توضیحات (اختیاری)
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={1000}
            defaultValue={values?.description ?? ""}
            className="w-full rounded-2xl border border-border-soft bg-surface-2 p-4 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="inStock" defaultChecked={values?.inStock ?? true} className="h-4 w-4 accent-[#d9a24a]" />
            موجود در انبار
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={values?.active ?? true} className="h-4 w-4 accent-[#d9a24a]" />
            فعال
          </label>
        </div>
      </fieldset>

      <ProfileEditor
        perfumeId={perfumeId}
        storeId={storeId}
        profile={
          values
            ? ({
                matching: values.matching,
                descriptors: values.descriptors,
                family: values.family ?? undefined,
                notes: values.notes,
                season: values.season ?? undefined,
                occasion: values.occasion ?? undefined,
              } satisfies ProfileEditorValues)
            : undefined
        }
        errors={fieldErrors}
      />

      <fieldset className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-5 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-accent">
          خانواده رایحه و نُت‌ها
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="family" className="text-sm">
              خانواده رایحه (اختیاری)
            </label>
            <input id="family" name="family" maxLength={200} defaultValue={values?.family ?? ""} className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="season" className="text-sm">
              فصل پیشنهادی
            </label>
            <select id="season" name="season" defaultValue={values?.season ?? ""} className={inputClass}>
              {SEASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors?.season} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="occasion" className="text-sm">
              مناسبت پیشنهادی
            </label>
            <select id="occasion" name="occasion" defaultValue={values?.occasion ?? ""} className={inputClass}>
              {OCCASION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors?.occasion} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm">
            نُت‌ها (هر نُت در یک خط)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={values?.notes.join("\n") ?? ""}
            className="w-full rounded-2xl border border-border-soft bg-surface-2 p-4 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      </fieldset>

      {state && !state.ok ? (
        <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {state.message}
        </p>
      ) : null}

      {state?.ok ? (
        <p role="status" className="rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm text-accent">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 items-center justify-center rounded-2xl bg-accent px-8 font-medium text-background transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
      >
        {pending ? "در حال ذخیره…" : submitLabel}
      </button>
    </form>
  );
}
