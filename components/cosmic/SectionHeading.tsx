import { StarMark } from "@/components/ui-icons";

interface SectionHeadingProps {
  /** Short Persian label above the title (e.g. «چطور کار می‌کند»). */
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "start" | "center";
  /** Rendered inside a dark section: switches the accent/rule treatment. */
  tone?: "light" | "dark";
  as?: "h1" | "h2" | "h3";
}

/**
 * The single section-heading primitive used across the public pages, so every
 * section shares one eyebrow/rule/title/lead rhythm instead of inventing its
 * own spacing and accent treatment.
 */
export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "start",
  tone = "light",
  as: Tag = "h2",
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <header
      className={`flex flex-col gap-3 ${centered ? "items-center text-center" : "items-start"}`}
    >
      {eyebrow ? (
        <span
          className={`eyebrow flex items-center gap-2 ${
            tone === "dark" ? "text-champagne" : "text-champagne-deep"
          }`}
        >
          <StarMark className="h-3.5 w-3.5" />
          {eyebrow}
        </span>
      ) : null}
      <Tag className="display-lg text-balance">{title}</Tag>
      <span
        aria-hidden="true"
        className={`h-px w-16 ${
          tone === "dark"
            ? "bg-gradient-to-l from-champagne/70 to-transparent"
            : "bg-gradient-to-l from-champagne-deep/60 to-transparent"
        }`}
      />
      {description ? (
        <p className={`lead max-w-2xl ${centered ? "mx-auto" : ""}`}>{description}</p>
      ) : null}
    </header>
  );
}
