import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import Script from "next/script";
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
  /**
   * Absolute base for the relative share image below, so the OG/Twitter tags
   * resolve to `https://fiage.ir/...` when a link leaves the site.
   */
  metadataBase: new URL("https://fiage.ir"),
  title: "عطرتان را پیدا کنید | FIAGE",
  description:
    "تست بدهید، آرکتایپ عطری‌تان را بشناسید؛ FIAGE عطری را پیدا می‌کند که واقعاً شماست.",
  /**
   * Social cards. Title and description repeat the two strings above verbatim:
   * a card shared on WhatsApp or Telegram must say exactly what the page says.
   * The image is the approved 1200×630 lockup, declared with its real size so
   * the preview is laid out before it loads.
   */
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: "https://fiage.ir",
    siteName: "FIAGE",
    title: "عطرتان را پیدا کنید | FIAGE",
    description:
      "تست بدهید، آرکتایپ عطری‌تان را بشناسید؛ FIAGE عطری را پیدا می‌کند که واقعاً شماست.",
    images: [
      {
        url: "/brand/og-card.png",
        width: 1200,
        height: 630,
        alt: "FIAGE — FIND YOUR SCENT",
      },
    ],
  },
  /**
   * X/Twitter reads its own tags; without them the card falls back to a small
   * summary. Same strings, same image.
   */
  twitter: {
    card: "summary_large_image",
    title: "عطرتان را پیدا کنید | FIAGE",
    description:
      "تست بدهید، آرکتایپ عطری‌تان را بشناسید؛ FIAGE عطری را پیدا می‌کند که واقعاً شماست.",
    images: ["/brand/og-card.png"],
  },
  /**
   * Three icons, three jobs:
   *  - the FIAGE mark is the tab icon, at its native size;
   *  - the iOS home-screen icon is a dedicated 180×180 rendition served from
   *    the conventional root path, `/apple-touch-icon.png`. Apple touch icons
   *    are 180×180, and clients that probe that path instead of parsing this
   *    tag (older Safari, some crawlers and readers) only find it there.
   *  - `app/favicon.ico` is tracked brand art (multi-size ICO), emitted by
   *    Next alongside the mark PNG for browsers that request the conventional
   *    path.
   */
  icons: {
    icon: [{ url: "/brand/fiage-mark.png", type: "image/png", sizes: "560x560" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning className={`${persianFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Script id="fiage-js-flag" strategy="beforeInteractive">
          {`document.documentElement.classList.add("js")`}
        </Script>
        {children}
      </body>
    </html>
  );
}
