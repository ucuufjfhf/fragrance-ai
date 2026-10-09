import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

/**
 * Vazirmatn is loaded once here and exposed as `--font-persian`. It acts as the
 * Persian fallback for both the display face (SG Kara) and the body face
 * (Estedad), and guarantees that Persian text always renders with correct
 * glyph joining even if one of the two self-hosted faces is unavailable.
 */
const persianFont = Vazirmatn({
  variable: "--font-persian",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "فیاج | عطر خودتو پیدا کن",
  description:
    "سیستم پیشنهاد عطر شخصی‌سازی‌شده بر پایهٔ پروفایل عطری؛ همراه فروشگاه‌های عطر فارسی‌زبان.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#191725",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`${persianFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
