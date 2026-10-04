import type { ProfileProvenance } from "@/lib/fragrance/profile-enrichment";

/**
 * Read-only provenance badge for a perfume's fragrance profile.
 *
 * The merchant can see WHERE the profile values came from — a curated
 * reference catalogue hit (`REFERENCE`), the AI fallback (`AI`), the merchant's
 * own edits (`MANUAL`), or no profile at all. The distinction matters because
 * only `MANUAL` means a human is accountable for the values, and because a
 * `REFERENCE`/`AI` profile stays labelled as such even after a merchant edits
 * it (the write path deliberately preserves provenance — see
 * `updatePerfumeForStore`).
 *
 * Strictly presentational: it renders a `<span>`, never an input, and no code
 * path writes `profileSource` from this component. The raw enum value is kept
 * on `data-profile-source` so tests (and future styling) can key off the real
 * provenance rather than the translated label.
 */

const PROFILE_SOURCE_LABELS: Record<ProfileProvenance, string> = {
  REFERENCE: "مرجع",
  AI: "هوش مصنوعی",
  MANUAL: "دستی",
};

const PROFILE_SOURCE_DESCRIPTIONS: Record<ProfileProvenance, string> = {
  REFERENCE: "پروفایل از کاتالوگ مرجع",
  AI: "پروفایل با هوش مصنوعی ساخته شده",
  MANUAL: "پروفایل دستی",
};

/** What an admin sees when a perfume has no fragrance profile at all. */
export const NO_PROFILE_LABEL = "بدون پروفایل";

/** Compact visual variant for dense list rows. */
const TONE_CLASSES: Record<ProfileProvenance, string> = {
  REFERENCE: "border-forest/40 bg-forest-soft text-forest",
  AI: "border-accent/40 bg-accent-soft text-accent",
  MANUAL: "border-border-soft bg-surface-2 text-foreground",
};

/**
 * Resolves the displayed provenance for a possibly-absent profile. Exported so
 * the label mapping is testable without rendering, and so both the list row and
 * the edit page stay in lockstep.
 */
export function describeProfileSource(
  profile: { profileSource: ProfileProvenance | null } | null | undefined,
): { source: ProfileProvenance | null; label: string; description: string } {
  const source = profile?.profileSource ?? null;

  if (source === null) {
    return { source, label: NO_PROFILE_LABEL, description: "پروفایلی ثبت نشده است" };
  }

  return {
    source,
    label: PROFILE_SOURCE_LABELS[source],
    description: PROFILE_SOURCE_DESCRIPTIONS[source],
  };
}

export default function ProfileSourceBadge({
  profile,
  size = "sm",
}: {
  profile: { profileSource: ProfileProvenance | null } | null | undefined;
  size?: "sm" | "md";
}) {
  const { source, label, description } = describeProfileSource(profile);

  return (
    <span
      data-profile-source={source ?? "NONE"}
      title={description}
      className={`inline-flex w-fit items-center rounded-full border font-medium ${
        size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"
      } ${
        source === null
          ? "border-dashed border-border-soft text-muted"
          : TONE_CLASSES[source]
      }`}
    >
      {label}
    </span>
  );
}
