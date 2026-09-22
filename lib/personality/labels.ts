import type { PersonalityDimension } from "@/types/personality";

/**
 * Persian user-facing labels for the 9 personality dimensions.
 *
 * Look the labels up by iterating `PERSONALITY_DIMENSIONS`, so the display
 * order stays identical to the canonical dimension order.
 */
export const PERSONALITY_LABELS: Record<PersonalityDimension, string> = {
  social: "اجتماعی",
  adventurous: "ماجراجو",
  expressive: "پرشور",
  mysterious: "مرموز",
  fresh: "تازه و سرحال",
  warm: "گرم و صمیمی",
  experimental: "تجربه‌گرا",
  elegant: "شیک و مرتب",
  bold: "جسور",
};
