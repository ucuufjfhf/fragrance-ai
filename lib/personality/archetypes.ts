import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { Archetype, PersonalityVector } from "@/types/personality";

/**
 * The 8 fragrance-personality archetypes.
 *
 * An archetype is only a **label** for the user's profile: it is picked as the
 * nearest centroid to the full 0–100 personality vector. The vector itself stays
 * the source of truth for recommendations (Phase 3) — the archetype never
 * replaces or overrides it.
 */
export const ARCHETYPES: Archetype[] = [
  {
    id: "mysterious-explorer",
    accentColor: "#6D28C8",
    name: "The Moon",
    label: "ماه",
    emoji: "🖤",
    description:
      "کنجکاوی و رمزآلودگی رو با هم دارید؛ دنبال رایحه‌ای هستید که متفاوت باشه و یه ذره سؤال ایجاد کنه.",
    fragranceHint:
      "رایحه‌های گرم، چوبی و خاص بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 35,
      adventurous: 75,
      expressive: 45,
      mysterious: 90,
      fresh: 30,
      warm: 70,
      experimental: 75,
      elegant: 55,
      bold: 65,
    },
  },
  {
    id: "clean-minimalist",
    accentColor: "#0A7A52",
    name: "The Droplet",
    label: "قطره",
    emoji: "🤍",
    description:
      "سادگی، تمیزی و نظم براتون مهمه؛ رایحه‌ای می‌خواید که سبک و بی‌ادعا باشه ولی خوش‌حس و مرتب.",
    fragranceHint:
      "رایحه‌های تازه، تمیز و ملایم بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 40,
      adventurous: 30,
      expressive: 30,
      mysterious: 40,
      fresh: 90,
      warm: 45,
      experimental: 30,
      elegant: 75,
      bold: 25,
    },
  },
  {
    id: "charismatic",
    accentColor: "#B53A00",
    name: "The Sun",
    label: "خورشید",
    emoji: "✨",
    description:
      "راحت با آدم‌ها ارتباط می‌گیرید و حضورتون به چشم میاد؛ دوست دارید عطرتون هم همین حس رو منتقل کنه.",
    fragranceHint:
      "رایحه‌های تازه و پرحضور با پخش خوب بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 95,
      adventurous: 60,
      expressive: 85,
      mysterious: 45,
      fresh: 65,
      warm: 70,
      experimental: 55,
      elegant: 50,
      bold: 70,
    },
  },
  {
    id: "elegant-classic",
    accentColor: "#8A6400",
    name: "The Diamond",
    label: "الماس",
    emoji: "🕊️",
    description:
      "سلیقه‌تون ساده اما سنجیده‌ست؛ چیزهای باکیفیت و ماندگار رو به چیزهای پرزرق‌وبرق ترجیح می‌دید.",
    fragranceHint:
      "رایحه‌های چوبی، تمیز و پودری بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 55,
      adventurous: 35,
      expressive: 50,
      mysterious: 50,
      fresh: 55,
      warm: 60,
      experimental: 30,
      elegant: 95,
      bold: 40,
    },
  },
  {
    id: "free-spirit",
    accentColor: "#0069B4",
    name: "The Feather",
    label: "پر",
    emoji: "🌊",
    description:
      "تغییر و تجربه‌های تازه براتون جذابه و دوست ندارید توی یه قالب ثابت بمونید.",
    fragranceHint:
      "رایحه‌های تازه، آبی و متنوع بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 70,
      adventurous: 90,
      expressive: 80,
      mysterious: 35,
      fresh: 70,
      warm: 55,
      experimental: 85,
      elegant: 30,
      bold: 65,
    },
  },
  {
    id: "romantic",
    accentColor: "#C00A3D",
    name: "The Rose",
    label: "رز",
    emoji: "🌹",
    description:
      "حس و رابطه‌های گرم براتون مهمه؛ عطر براتون یه یادآوریه، نه فقط یه محصول.",
    fragranceHint:
      "رایحه‌های شیرین، گلی و گرم بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 60,
      adventurous: 45,
      expressive: 75,
      mysterious: 50,
      fresh: 50,
      warm: 90,
      experimental: 40,
      elegant: 70,
      bold: 35,
    },
  },
  {
    id: "bold-one",
    accentColor: "#C8102E",
    name: "The Flame",
    label: "شعله",
    emoji: "🔥",
    description:
      "ریسک‌پذیری و پرسروصدا بودن براتون غریبه نیست؛ عطرتون هم باید مثل شعله بدرخشه.",
    fragranceHint:
      "رایحه‌های ادویه‌ای، گرم و پرپخش بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 70,
      adventurous: 80,
      expressive: 70,
      mysterious: 55,
      fresh: 45,
      warm: 60,
      experimental: 70,
      elegant: 35,
      bold: 95,
    },
  },
  {
    id: "sophisticated",
    accentColor: "#1D4ED8",
    name: "The Crown",
    label: "تاج",
    emoji: "💎",
    description:
      "عمق و آرامش توی انتخاب‌هاتون دیده می‌شه؛ عجله ندارید و سلیقه‌تون خاص و سنجیده‌ست.",
    fragranceHint:
      "رایحه‌های عمیق، چوبی و دودی بیشتر با سلیقه عطری شما هماهنگ هستند.",
    centroid: {
      social: 45,
      adventurous: 45,
      expressive: 45,
      mysterious: 85,
      fresh: 40,
      warm: 65,
      experimental: 40,
      elegant: 90,
      bold: 55,
    },
  },
];

/** Squared Euclidean distance over the 9 personality dimensions. */
export function squaredDistance(
  a: PersonalityVector,
  b: PersonalityVector,
): number {
  let total = 0;
  for (const dimension of PERSONALITY_DIMENSIONS) {
    const difference = a[dimension] - b[dimension];
    total += difference * difference;
  }
  return total;
}

/**
 * Labels a 0–100 profile with the archetype whose centroid is closest.
 *
 * Ties are broken by `ARCHETYPES` order, so the result is fully deterministic.
 */
export function nearestArchetype(vector: PersonalityVector): Archetype {
  let best = ARCHETYPES[0];
  let bestDistance = squaredDistance(vector, best.centroid);

  for (const candidate of ARCHETYPES.slice(1)) {
    const distance = squaredDistance(vector, candidate.centroid);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

export function getArchetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find((archetype) => archetype.id === id);
}
