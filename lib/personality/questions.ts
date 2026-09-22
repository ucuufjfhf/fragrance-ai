import type { QuizOption, QuizQuestion } from "@/types/personality";

/**
 * The 10-question fragrance personality quiz.
 *
 * Every option carries a deterministic scoring vector: plain integer deltas per
 * personality dimension. There is no AI, randomness or hidden weighting — the
 * same answers always produce the same profile.
 *
 * These are product-personalisation questions, NOT a psychological test.
 */
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "choice-style",
    order: 1,
    prompt: "وقتی می‌خوای یه عطر جدید بخری، کدوم حالت بیشتر شبیه توئه؟",
    options: [
      {
        id: "trusted",
        label: "معمولاً انتخابی رو می‌کنم که مطمئنم دوستش دارم.",
        vector: { elegant: 5, fresh: 3, experimental: -4 },
      },
      {
        id: "ask-others",
        label: "بین چند گزینه مردد می‌مونم و از بقیه نظر می‌گیرم.",
        vector: { social: 5, expressive: 3, experimental: -1 },
      },
      {
        id: "explore",
        label: "دوست دارم چیز جدید و متفاوتی رو امتحان کنم.",
        vector: { experimental: 6, adventurous: 4, bold: 3 },
      },
    ],
  },
  {
    id: "social-energy",
    order: 2,
    prompt: "توی جمع‌های شلوغ بیشتر چه حالی داری؟",
    options: [
      {
        id: "center",
        label: "انرژی می‌گیرم؛ دوست دارم وسط جمع و توی گفت‌وگو باشم.",
        vector: { social: 7, expressive: 4, bold: 2 },
      },
      {
        id: "observer",
        label: "آروم گوشه‌ای می‌ایستم و آدم‌ها رو تماشا می‌کنم.",
        vector: { mysterious: 5, social: -3, elegant: 2 },
      },
      {
        id: "selective",
        label: "بستگی داره؛ با آدم‌های نزدیک راحتم، با بقیه نه.",
        vector: { social: 2, mysterious: 2, expressive: 2 },
      },
    ],
  },
  {
    id: "scent-role",
    order: 3,
    prompt: "از نظر تو عطر بیشتر چه کاری برات انجام می‌ده؟",
    options: [
      {
        id: "signature",
        label: "امضای شخصیمه؛ دوست دارم هر کی کنارم می‌ایسته یادش بمونه.",
        vector: { mysterious: 5, expressive: 5, bold: 3 },
      },
      {
        id: "freshness",
        label: "حس تمیزی و سرحالی بهم می‌ده.",
        vector: { fresh: 6, elegant: 3, warm: -2 },
      },
      {
        id: "mood",
        label: "بیشتر برای دل خودمه؛ مهم نیست کسی متوجه بشه.",
        vector: { warm: 4, mysterious: 2, expressive: 2 },
      },
    ],
  },
  {
    id: "day-trip",
    order: 4,
    prompt: "یه روز تعطیل داری؛ کدوم انتخاب بیشتر شبیه توئه؟",
    options: [
      {
        id: "unknown-road",
        label: "مسیر تازه و بی‌نقشه، حتی اگه کمی سخت باشه.",
        vector: { adventurous: 7, bold: 4, experimental: 3 },
      },
      {
        id: "cozy-known",
        label: "کافه‌ی دنج و آشنایی که می‌دونم حالش رو می‌برم.",
        vector: { warm: 5, elegant: 3, adventurous: -3 },
      },
      {
        id: "planned",
        label: "جای شیک و مرتب، با برنامه‌ریزی دقیق.",
        vector: { elegant: 5, fresh: 2, adventurous: -2 },
      },
    ],
  },
  {
    id: "change",
    order: 5,
    prompt: "رابطه‌ات با تغییر و تنوع چطوره؟",
    options: [
      {
        id: "embrace",
        label: "راحت با تغییر کنار میام؛ تنوع بهم انرژی می‌ده.",
        vector: { experimental: 6, adventurous: 4, fresh: 2 },
      },
      {
        id: "gradual",
        label: "کم‌کم و با احتیاط می‌پذیرم.",
        vector: { warm: 3, elegant: 3, experimental: -2 },
      },
      {
        id: "stable",
        label: "ترجیح می‌دم همه چیز ثابت و مشخص باشه.",
        vector: { elegant: 4, fresh: 2, experimental: -5, adventurous: -3 },
      },
    ],
  },
  {
    id: "colors",
    order: 6,
    prompt: "کدوم دسته رنگ بیشتر به سلیقه‌ات می‌خوره؟",
    options: [
      {
        id: "deep",
        label: "رنگ‌های تیره و پرمعنا؛ مشکی، شرابی، زیتونی.",
        vector: { mysterious: 6, elegant: 4, bold: 3 },
      },
      {
        id: "light",
        label: "رنگ‌های روشن و تمیز؛ سفید، بژ، خاکی روشن.",
        vector: { fresh: 5, elegant: 3, mysterious: -3 },
      },
      {
        id: "vivid",
        label: "رنگ‌های گرم و شاد، حتی پرسروصدا.",
        vector: { expressive: 6, bold: 5, warm: 2 },
      },
    ],
  },
  {
    id: "party",
    order: 7,
    prompt: "توی مهمونی کدوم جمله بیشتر بهت می‌خوره؟",
    options: [
      {
        id: "mingle",
        label: "زود با همه گرم می‌گیرم و شلوغش می‌کنم.",
        vector: { social: 7, expressive: 5, bold: 2 },
      },
      {
        id: "quiet",
        label: "ساکت می‌مونم تا یکی جالب پیدا شه.",
        vector: { mysterious: 6, social: -3, elegant: 2 },
      },
      {
        id: "prepared",
        label: "از قبل به لباس و جزئیاتم فکر کردم.",
        vector: { elegant: 5, expressive: 3, social: 2 },
      },
    ],
  },
  {
    id: "impression",
    order: 8,
    prompt: "دوست داری بعد از دیدنت بیشتر چه حسی بمونه؟",
    options: [
      {
        id: "classy",
        label: "«چه آدم مرتب و باکلاسی».",
        vector: { elegant: 7, fresh: 3, bold: -2 },
      },
      {
        id: "warm",
        label: "«چه آدم گرم و دلنشینی».",
        vector: { warm: 7, social: 4, expressive: 2 },
      },
      {
        id: "unforgettable",
        label: "«چه آدم خاص و مرموزی».",
        vector: { mysterious: 7, bold: 3, social: -2 },
      },
    ],
  },
  {
    id: "risk",
    order: 9,
    prompt: "توی تصمیم‌هات چقدر ریسک می‌کنی؟",
    options: [
      {
        id: "high",
        label: "زیاد؛ دوست دارم ریسک کنم و نتیجه رو ببینم.",
        vector: { bold: 7, adventurous: 5, experimental: 3 },
      },
      {
        id: "measured",
        label: "به اندازه؛ با فکر و حساب‌شده.",
        vector: { warm: 3, social: 2, elegant: 2 },
      },
      {
        id: "safe",
        label: "کم؛ ترجیح می‌دم مسیر مطمئن رو برم.",
        vector: { fresh: 4, elegant: 3, bold: -4, adventurous: -3 },
      },
    ],
  },
  {
    id: "usage",
    order: 10,
    prompt: "دوست داری عطرت بیشتر کِی به کارت بیاد؟",
    options: [
      {
        id: "everyday",
        label: "هر روز، راحت و بدون تکلف.",
        vector: { fresh: 6, warm: 4, elegant: 2 },
      },
      {
        id: "evening",
        label: "شب‌های خاص و موقعیت‌های مهم.",
        vector: { mysterious: 5, elegant: 5, bold: 4 },
      },
      {
        id: "energize",
        label: "وقتی می‌خوام سرحال و پرانرژی باشم.",
        vector: { fresh: 5, expressive: 4, social: 3 },
      },
    ],
  },
];

/** Total number of questions; the UI and the API both rely on this. */
export const QUIZ_QUESTION_COUNT = QUIZ_QUESTIONS.length;

export function getQuestionById(id: string): QuizQuestion | undefined {
  return QUIZ_QUESTIONS.find((question) => question.id === id);
}

export function getOptionById(
  question: QuizQuestion,
  optionId: string,
): QuizOption | undefined {
  return question.options.find((option) => option.id === optionId);
}
