import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

/**
 * Vazirmatn is loaded once here and exposed as `--font-persian`.
 * Every UI surface in this project is Persian and RTL, so the font is applied
 * globally on <html> rather than per component.
 */
const persianFont = Vazirmatn({
  variable: "--font-persian",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "عطر خودتو پیدا کن | Fragrance AI",
  description:
    "سیستم پیشنهاد عطر شخصی‌سازی‌شده بر پایهٔ پروفایل عطری؛ همراه فروشگاه‌های عطر فارسی‌زبان.",
  /**
   * The FIAGE mark is the tab icon and the iOS home-screen icon: one bundled
   * PNG serves both, so there is no .ico copy to keep in sync with the brand.
   * (`app/favicon.ico` — the untouched framework default — was removed for the
   * same reason: it would have advertised a second, unrelated icon.)
   */
  icons: {
    icon: [{ url: "/brand/fiage-mark.png", type: "image/png", sizes: "560x560" }],
    apple: [{ url: "/brand/fiage-mark.png", type: "image/png", sizes: "560x560" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`${persianFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
