import Link from "next/link";

/**
 * Unknown or inactive report token: a plain page with no data and no way
 * to enumerate stores or tokens.
 */
export default function StoreReportNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">این گزارش پیدا نشد.</h1>
      <p className="mt-3 text-sm leading-8 text-muted">
        پیوند گزارش معتبر نیست یا باطل شده است. برای دریافت پیوند تازه با
        پشتیبانی در ارتباط باشید.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg btn-primary bg-accent px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 bg-accent text-white"
      >
        بازگشت به صفحه اصلی
      </Link>
    </main>
  );
}
