import { BrandMark } from "@/components/ui-icons";

import Link from "next/link";

type PhaseStatus = "done" | "next" | "planned";

const phases: { title: string; status: PhaseStatus; detail: string }[] = [
  {
    title: "فاز ۰ — راه‌اندازی پروژه",
    status: "done",
    detail: "Next.js + TypeScript + Tailwind + Prisma + ساختار پوشه‌ها",
  },
  {
    title: "فاز ۱ — موتور آزمون شخصیت عطری",
    status: "done",
    detail: "۱۰ سؤال، امتیازدهی قطعی، نرمال‌سازی ۰ تا ۱۰۰، ۸ کهن‌الگو",
  },
  {
    title: "فاز ۲ — پایگاه داده و داده عطر",
    status: "next",
    detail: "PostgreSQL، مهاجرت‌ها، داده‌های نمونه و پروفایل رایحه",
  },
  {
    title: "فاز ۳ — موتور تطبیق عطر",
    status: "planned",
    detail: "فیلتر موجودی، امتیازدهی وزنی و رتبه‌بندی قطعی",
  },
  {
    title: "فاز ۴ — لایه هوش مصنوعی",
    status: "planned",
    detail: "توضیح فارسی «چرا این عطر؟» با فالبک کامل",
  },
];

const statusLabel: Record<PhaseStatus, string> = {
  done: "انجام شده",
  next: "مرحله بعد",
  planned: "برنامه‌ریزی شده",
};

const statusClass: Record<PhaseStatus, string> = {
  done: "bg-accent-soft text-accent border-accent/40",
  next: "bg-surface-2 text-foreground border-border-soft",
  planned: "bg-transparent text-muted border-border-soft",
};

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-12 sm:px-8 sm:py-20">
      <header className="flex flex-col gap-4">
        <span className="w-fit rounded-full border border-border-soft bg-surface px-4 py-1 text-sm text-accent">
          Fragrance AI — نسخهٔ MVP
        </span>
        <h1 className="text-3xl font-bold sm:text-4xl"><BrandMark className="ml-2 inline h-8 w-8 text-accent" />عطر خودتو پیدا کن</h1>
        <p className="text-muted sm:text-lg">
          عطری که بهت میاد چیه؟ فقط به ۱۰ سؤال کوتاه جواب بده تا ببینیم چه رایحه‌ای بیشتر با
          سلیقه و شخصیت عطری تو هماهنگه.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">وضعیت پروژه</h2>
        <p className="text-muted text-sm">
          آزمون سلیقه عطری آماده است: ۱۰ سؤال، امتیازدهی قطعی، نرمال‌سازی ۰ تا ۱۰۰ و ۸
          کهن‌الگو. پایگاه داده، موتور تطبیق عطر و توضیح فارسی هوش مصنوعی در فازهای بعدی
          اضافه می‌شوند.
        </p>
        <Link
          href="/quiz"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl btn-primary bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90 sm:w-fit sm:px-8"
        >
          شروع آزمون
        </Link>
        <ul className="flex flex-col gap-3">
          {phases.map((phase) => (
            <li
              key={phase.title}
              className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{phase.title}</span>
                <span className="text-muted text-sm">{phase.detail}</span>
              </div>
              <span
                className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs ${statusClass[phase.status]}`}
              >
                {statusLabel[phase.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-border-soft bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">اصل معماری پروژه</h2>
        <p className="text-muted text-sm leading-loose">
          امتیازدهی، فیلتر موجودی، رتبه‌بندی و انتخاب بهترین عطرها کاملاً قطعی و در کد
          برنامه انجام می‌شود. هوش مصنوعی فقط پروفایل عطر را غنی می‌کند و متن فارسی
          «چرا این عطر؟» را می‌نویسد؛ اگر سرویس هوش مصنوعی در دسترس نباشد، پیشنهادها همچنان
          کار می‌کنند.
        </p>
      </section>

      <nav className="flex flex-col gap-3 text-sm text-muted">
        <span>مسیرهای در دست ساخت:</span>
        <ul className="flex flex-wrap gap-2">
          {["/result", "/admin", "/admin/perfumes", "/admin/analytics"].map((route) => (
            <li key={route} className="rounded-full border border-border-soft px-3 py-1">
              <span dir="ltr">{route}</span>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
