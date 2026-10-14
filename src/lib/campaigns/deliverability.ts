/** Client-safe deliverability heuristics shown in the campaign builder. */
import type { EmailBlock } from "@/db/schema";

/** `error` checks block sending; warnings and info are advisory. */
export type Check = {
  level: "error" | "warning" | "info";
  message: string;
  tab?: "content" | "settings" | "audience";
  href?: string;
};

const SPAM_PHRASES = [
  "free",
  "100% free",
  "act now",
  "limited time",
  "urgent",
  "guarantee",
  "guaranteed",
  "risk-free",
  "risk free",
  "no cost",
  "winner",
  "you've won",
  "cash",
  "earn money",
  "make money",
  "double your",
  "click here",
  "buy now",
  "order now",
  "cheap",
  "lowest price",
  "best price",
  "credit card",
  "no obligation",
  "once in a lifetime",
  "miracle",
  "congratulations",
  "dear friend",
  "increase sales",
  "opportunity",
];

/** Spam-trigger hints for a subject line. */
export function subjectSpamHints(subject: string): string[] {
  const hints: string[] = [];
  const s = subject.trim();
  if (!s) return hints;
  const lower = s.toLowerCase();
  const found = SPAM_PHRASES.filter((p) => new RegExp(`(^|[^a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower));
  if (found.length) hints.push(`Spam-trigger words: ${found.map((f) => `“${f}”`).join(", ")}`);
  if (/!{2,}/.test(s)) hints.push("Multiple exclamation marks (!!) look spammy");
  if (/\${2,}|\$\d+.*\$\d+/.test(s)) hints.push("Avoid dollar signs like $$$");
  if (/\?{2,}/.test(s)) hints.push("Multiple question marks look spammy");
  const letters = s.replace(/[^a-zA-Z]/g, "");
  const capsWords = s.match(/\b[A-Z]{4,}\b/g) ?? [];
  if ((letters.length >= 8 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6) || capsWords.length >= 2) {
    hints.push("Avoid ALL CAPS — it reads as shouting and trips spam filters");
  }
  if (s.length > 70) hints.push(`Long subject (${s.length} chars) — it'll be cut off on mobile; aim for under 50`);
  if (/^(re|fwd?):/i.test(s)) hints.push("Fake “Re:”/“Fwd:” prefixes erode trust and can get flagged");
  return hints;
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case "heading":
    case "text":
      return b.text;
    case "button":
      return b.label;
    case "columns":
      return `${b.left} ${b.right}`;
    case "html":
      return b.html.replace(/<[^>]+>/g, " ");
    default:
      return "";
  }
}

export function wordCount(blocks: EmailBlock[]) {
  return blocks
    .map(blockText)
    .join(" ")
    .replace(/\{\{[^}]*\}\}/g, "x")
    .split(/\s+/)
    .filter((w) => /\w/.test(w)).length;
}

function isPlaceholderUrl(url: string | undefined) {
  const u = (url ?? "").trim();
  return !u || u === "https://" || u === "http://" || u === "#" || /^https?:\/\/(www\.)?example\.com/i.test(u);
}

export function checkDeliverability(input: {
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
  address: string;
  fromEmail?: string;
  audienceCount?: number | null;
}): Check[] {
  const checks: Check[] = [];
  const { blocks } = input;

  if (!input.subject.trim()) checks.push({ level: "error", message: "Add a subject line.", tab: "settings" });
  else
    for (const h of subjectSpamHints(input.subject)) checks.push({ level: "warning", message: `Subject: ${h}`, tab: "settings" });

  if (!input.address.trim())
    checks.push({
      level: "warning",
      message: "No mailing address in Settings — a physical address is legally required (CAN-SPAM) in marketing email footers.",
      href: "/settings",
    });

  if (!blocks.length) checks.push({ level: "error", message: "The email is empty — add some content.", tab: "content" });

  const hasText = blocks.some((b) => (b.type === "text" || b.type === "columns" || b.type === "heading") && blockText(b).trim());
  const images = blocks.filter((b) => b.type === "image").length + blocks.filter((b) => b.type === "columns" && (b.leftImage || b.rightImage)).length;
  const words = wordCount(blocks);

  if (blocks.length && !hasText)
    checks.push({
      level: "warning",
      message: "No text in the email. Image-only emails are a classic spam signal and are unreadable with images off.",
      tab: "content",
    });
  else if (images > 3 && words < 120)
    checks.push({
      level: "warning",
      message: `${images} images but only ~${words} words. Keep a healthy text-to-image ratio (roughly 60/40) to stay out of spam.`,
      tab: "content",
    });

  const emptyImages = blocks.filter((b) => b.type === "image" && !b.src.trim()).length;
  if (emptyImages) checks.push({ level: "warning", message: `${emptyImages} image block${emptyImages > 1 ? "s have" : " has"} no image yet.`, tab: "content" });

  const noAlt = blocks.filter((b) => b.type === "image" && b.src.trim() && !b.alt.trim()).length;
  if (noAlt) checks.push({ level: "info", message: `${noAlt} image${noAlt > 1 ? "s are" : " is"} missing alt text (shown when images are blocked).`, tab: "content" });

  const badButtons = blocks.filter((b) => b.type === "button" && isPlaceholderUrl(b.href)).length;
  if (badButtons) checks.push({ level: "warning", message: `${badButtons} button${badButtons > 1 ? "s link" : " links"} nowhere yet.`, tab: "content" });

  const text = blocks.map(blockText).join(" ");
  if (/\]\((https?:\/\/)?\)/.test(text) || /\]\(https?:\/\/\)/.test(text))
    checks.push({ level: "warning", message: "A text link is missing its URL.", tab: "content" });
  if (/bit\.ly|tinyurl\.com|goo\.gl|t\.co\//i.test(text + blocks.map((b) => (b.type === "button" ? b.href : "")).join(" ")))
    checks.push({ level: "warning", message: "Link shorteners (bit.ly etc.) are heavily penalised by spam filters — use full URLs.", tab: "content" });

  if (!input.previewText.trim())
    checks.push({ level: "info", message: "Add preview text — it shows next to the subject in the inbox.", tab: "settings" });

  if (input.fromEmail && /@(example\.com|gmail\.com|yahoo\.com|outlook\.com|hotmail\.com)$/i.test(input.fromEmail))
    checks.push({
      level: "warning",
      message: `Sending from ${input.fromEmail} — use an address on your own verified domain (with SPF, DKIM and DMARC) for bulk email.`,
    });

  if (input.audienceCount === 0) checks.push({ level: "error", message: "Nobody matches this audience.", tab: "audience" });

  return checks;
}
