import { htmlToText } from "@/lib/utils";

/** Lines that introduce quoted reply history in common mail clients / locales. */
const ATTRIBUTION = [
  /^On\b[\s\S]{0,300}\bwrote:$/i,
  /^Le\b[\s\S]{0,300}\ba écrit\s?:$/i,
  /^Am\b[\s\S]{0,300}\bschrieb\b.*:$/i,
  /^El\b[\s\S]{0,300}\bescribió:$/i,
  /^-{2,}\s*(Original|Forwarded) Message\s*-{2,}$/i,
  /^_{10,}$/,
  /^Sent from my (iPhone|iPad|Android|mobile)/i,
];

/** Best-effort plain text for a message: prefer the text part, fall back to the HTML. */
export function messageText(m: { bodyText: string; bodyHtml: string | null }) {
  if (m.bodyText.trim()) return m.bodyText.replace(/\r\n/g, "\n");
  if (m.bodyHtml) {
    const cleaned = m.bodyHtml
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      // keep quoted history detectable once tags are stripped
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner: string) =>
        "\n" + htmlToText(inner).split("\n").map((l) => "> " + l).join("\n") + "\n",
      );
    return htmlToText(cleaned);
  }
  return "";
}

/**
 * Split an inbound email into the new content and the quoted history
 * ("On … wrote:", Outlook separators, and "> " lines).
 */
export function splitQuoted(text: string): { main: string; hasQuoted: boolean } {
  const lines = text.split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    const joined = `${l} ${(lines[i + 1] ?? "").trim()}`.trim();
    if (ATTRIBUTION.some((re) => re.test(l))) {
      cut = i;
      break;
    }
    // Attribution line wrapped onto two lines ("On Mon, Jan 1 … <x@y.com>\nwrote:")
    if (/^On\b/i.test(l) && /\bwrote:$/i.test(joined) && joined.length < 300) {
      cut = i;
      break;
    }
    // Outlook-style header block
    if (/^From:\s.+/i.test(l) && lines.slice(i + 1, i + 5).some((x) => /^(Sent|Date|To|Subject):/i.test(x.trim()))) {
      cut = i;
      break;
    }
  }
  const kept = lines.slice(0, cut).filter((l) => !/^\s*>/.test(l));
  const main = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const hasQuoted = main !== text.trim();
  // If everything was "quoted" (e.g. a forward), show the whole thing.
  return main ? { main, hasQuoted } : { main: text.trim(), hasQuoted: false };
}

/** Short relative time for the list: "now", "5m", "3h", "Mon", "Sep 3", "Sep 3, 2024". */
export function shortTime(d: Date, now = new Date()) {
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000 && d.getDate() === now.getDate()) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 6 * 86_400_000) return d.toLocaleDateString("en-US", { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function dayLabel(d: Date, now = new Date()) {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function clockTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
