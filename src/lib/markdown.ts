/**
 * Tiny, dependency-free, XSS-safe markdown renderer for proposal bodies.
 * Supports: # / ## / ### headings, **bold**, *italic*, `code`, [links](https://…),
 * - bullet lists, 1. numbered lists, > quotes, --- rules and paragraphs.
 * All input is HTML-escaped first; only whitelisted tags are emitted.
 * Isomorphic (safe to import from client components for live preview).
 */

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string) {
  const u = url.trim();
  if (/^(https?:|mailto:|tel:)/i.test(u) || u.startsWith("/") || u.startsWith("#")) return u;
  return null;
}

function inline(text: string) {
  let out = esc(text);
  // code first so we don't format inside it
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    // href was escaped already; unescape &amp; for validation then re-escape
    const raw = href.replace(/&amp;/g, "&");
    const safe = safeUrl(raw);
    return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, "$1<em>$2</em>");
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? "");
  return out;
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote>${quote.map(inline).join("<br>")}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flushAll();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      const level = m[1]!.length + 1; // # → h2 (page already has an h1)
      html.push(`<h${level}>${inline(m[2]!)}</h${level}>`);
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushAll();
      html.push("<hr>");
    } else if ((m = t.match(/^[-*+]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(m[1]!);
    } else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(m[1]!);
    } else if ((m = t.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]!);
    } else {
      flushList();
      flushQuote();
      para.push(t);
    }
  }
  flushAll();
  return html.join("\n");
}

/** Tailwind classes that style rendered markdown (no typography plugin needed). */
export const markdownClass =
  "text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-100 [&_blockquote]:pl-4 [&_blockquote]:italic [&_hr]:my-8 [&_hr]:border-border [&>*:first-child]:mt-0";
