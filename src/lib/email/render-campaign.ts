/**
 * Pure campaign → email HTML renderer.
 *
 * IMPORTANT: this module is imported by client components (the live builder
 * preview), so it must stay free of server-only imports (db, settings, env).
 *
 * Output is bulletproof, table-based, inline-styled HTML that renders in
 * Gmail, Outlook (desktop + web), Apple Mail and mobile clients.
 */
import { nanoid } from "nanoid";
import type { EmailBlock, EmailTheme } from "@/db/schema";
import { escapeHtml, mergeTags } from "@/lib/utils";

export type BlockType = EmailBlock["type"];
type Align = "left" | "center" | "right";

/** The subset of app settings the renderer needs (safe to pass to the client). */
export type CampaignRenderSettings = {
  businessName: string;
  logoUrl: string;
  brandColor: string;
  address: string;
};

export type MergeVars = {
  first_name?: string | null;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  [key: string]: string | null | undefined;
};

export type RenderCampaignInput = {
  blocks: EmailBlock[];
  theme?: Partial<EmailTheme>;
  subject: string;
  previewText?: string;
  vars?: MergeVars;
  /** Visible unsubscribe link in the footer (the /u/<token> page). */
  unsubscribeUrl?: string;
  settings: CampaignRenderSettings;
  /**
   * Builder preview mode: adds `data-block-id` hooks + hover styles, shows
   * placeholders for empty images and hints for missing settings.
   */
  preview?: boolean;
};

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "System (recommended)", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: "Helvetica / Arial", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Courier (mono)", value: "'Courier New', Courier, monospace" },
];

export const DEFAULT_THEME: EmailTheme = {
  brandColor: "#f26b4e",
  backgroundColor: "#f4f4f5",
  contentBackground: "#ffffff",
  textColor: "#1f2328",
  fontFamily: FONT_OPTIONS[0]!.value,
  width: 600,
};

export const SOCIAL_NETWORKS: { value: string; label: string; color: string }[] = [
  { value: "website", label: "Website", color: "#1f2328" },
  { value: "linkedin", label: "LinkedIn", color: "#0a66c2" },
  { value: "x", label: "X", color: "#000000" },
  { value: "instagram", label: "Instagram", color: "#d62976" },
  { value: "facebook", label: "Facebook", color: "#1877f2" },
  { value: "youtube", label: "YouTube", color: "#ff0000" },
  { value: "tiktok", label: "TikTok", color: "#000000" },
  { value: "github", label: "GitHub", color: "#24292f" },
  { value: "dribbble", label: "Dribbble", color: "#ea4c89" },
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  logo: "Logo",
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
  columns: "Two columns",
  social: "Social links",
  html: "Custom HTML",
};

/** Create a new block with sensible defaults. */
export function newBlock(type: BlockType): EmailBlock {
  const id = nanoid(10);
  switch (type) {
    case "logo":
      return { id, type, src: "", width: 140, align: "center" };
    case "heading":
      return { id, type, text: "Your headline here", level: 1, align: "left" };
    case "text":
      return {
        id,
        type,
        text: "Hi {{first_name|there}},\n\nWrite your message here. You can use **bold**, *italic* and [links](https://example.com).",
        align: "left",
      };
    case "image":
      return { id, type, src: "", alt: "", width: 600, align: "center", rounded: true };
    case "button":
      return { id, type, label: "Learn more", href: "https://", align: "center" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, height: 24 };
    case "columns":
      return { id, type, left: "**Left column**\nA short description.", right: "**Right column**\nA short description." };
    case "social":
      return {
        id,
        type,
        align: "center",
        links: [
          { network: "linkedin", url: "https://linkedin.com/in/" },
          { network: "x", url: "https://x.com/" },
        ],
      };
    case "html":
      return { id, type, html: '<p style="margin:0">Custom HTML</p>' };
  }
}

/** Deep-copy a block with a fresh id. */
export function cloneBlock(block: EmailBlock): EmailBlock {
  return { ...(JSON.parse(JSON.stringify(block)) as EmailBlock), id: nanoid(10) };
}

export function resolveTheme(theme: Partial<EmailTheme> | undefined, settings?: Pick<CampaignRenderSettings, "brandColor">): EmailTheme {
  const t = { ...DEFAULT_THEME, ...(settings?.brandColor ? { brandColor: settings.brandColor } : {}), ...(theme ?? {}) };
  return {
    brandColor: safeColor(t.brandColor, DEFAULT_THEME.brandColor),
    backgroundColor: safeColor(t.backgroundColor, DEFAULT_THEME.backgroundColor),
    contentBackground: safeColor(t.contentBackground, DEFAULT_THEME.contentBackground),
    textColor: safeColor(t.textColor, DEFAULT_THEME.textColor),
    fontFamily: safeFont(t.fontFamily),
    width: clamp(Math.round(Number(t.width) || DEFAULT_THEME.width), 400, 800),
  };
}

/* ------------------------------------------------------------------ */
/* Sanitizers                                                          */
/* ------------------------------------------------------------------ */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*[\d.\s,%]+\)|hsla?\(\s*[\d.\s,%deg]+\))$/i;
function safeColor(value: string | undefined | null, fallback: string) {
  const v = (value ?? "").trim();
  return v && COLOR_RE.test(v) ? v : fallback;
}

function safeFont(value: string | undefined) {
  const v = (value ?? "").trim();
  return v && /^[\w\s,'"-]+$/.test(v) ? v.replace(/"/g, "'") : DEFAULT_THEME.fontFamily;
}

/**
 * Allow only http(s), mailto, tel and merge-tag URLs. Input may already be
 * HTML-escaped; the return value is always attribute-safe.
 */
function safeUrl(raw: string | undefined | null, alreadyEscaped = false): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const plain = alreadyEscaped ? v.replace(/&amp;/g, "&") : v;
  if (/^(https?:|mailto:|tel:)/i.test(plain) || /^\{\{/.test(plain) || plain.startsWith("#")) {
    return escapeHtml(plain);
  }
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(plain)) return escapeHtml(`https://${plain}`);
  return "";
}

/** Contrast-aware text color for a filled background. */
function readableOn(bg: string) {
  const m = bg.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return "#ffffff";
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#1f2328" : "#ffffff";
}

/* ------------------------------------------------------------------ */
/* Light markdown                                                      */
/* ------------------------------------------------------------------ */

function escapedVars(vars: MergeVars | undefined) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars ?? {})) if (v) out[k] = escapeHtml(v);
  return out;
}

/** Inline markdown on already-escaped text. */
function inlineMarkdown(escaped: string, linkColor: string) {
  // Links first so their URLs aren't mangled by emphasis rules.
  const links: string[] = [];
  let s = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeUrl(url, true);
    const html = href
      ? `<a href="${href}" target="_blank" style="color:${linkColor};text-decoration:underline">${label}</a>`
      : label;
    links.push(html);
    return `\u0000${links.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)] ?? "");
}

/** Paragraphs, line breaks and "- " bullet lists → email-safe HTML. */
export function markdownToEmailHtml(
  text: string,
  opts: { color: string; linkColor: string; size: number; align: Align; vars?: MergeVars; lineHeight?: number },
) {
  const escaped = escapeHtml(text.replace(/\r\n/g, "\n"));
  const vars = escapedVars(opts.vars);
  const lh = opts.lineHeight ?? 1.6;
  const pStyle = `margin:0 0 14px;font-size:${opts.size}px;line-height:${lh};color:${opts.color};text-align:${opts.align}`;
  const blocks = escaped.split(/\n{2,}/).filter((b) => b.trim().length);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n");
      const out: string[] = [];
      let para: string[] = [];
      let list: string[] = [];
      const flushPara = () => {
        if (para.length) out.push(`<p style="${pStyle}">${para.map((l) => inlineMarkdown(l, opts.linkColor)).join("<br>")}</p>`);
        para = [];
      };
      const flushList = () => {
        if (list.length)
          out.push(
            `<ul style="margin:0 0 14px;padding:0 0 0 22px;font-size:${opts.size}px;line-height:${lh};color:${opts.color};text-align:left">${list
              .map((l) => `<li style="margin:0 0 6px">${inlineMarkdown(l, opts.linkColor)}</li>`)
              .join("")}</ul>`,
          );
        list = [];
      };
      for (const line of lines) {
        const m = line.match(/^\s*[-•]\s+(.*)$/);
        if (m) {
          flushPara();
          list.push(m[1]!);
        } else {
          flushList();
          para.push(line);
        }
      }
      flushPara();
      flushList();
      return out.join("");
    })
    .join("");
  // Remove the bottom margin of the last paragraph/list so block padding stays even.
  const last = html.lastIndexOf("margin:0 0 14px");
  const trimmed = last === -1 ? html : `${html.slice(0, last)}margin:0${html.slice(last + "margin:0 0 14px".length)}`;
  return mergeTags(trimmed, vars);
}

function markdownToText(text: string, vars?: MergeVars) {
  return mergeTags(
    text
      .replace(/\r\n/g, "\n")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+?)\*\*/g, "$1")
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1$2")
      .replace(/^\s*•\s+/gm, "- "),
    vars ?? {},
  );
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

type Ctx = {
  theme: EmailTheme;
  settings: CampaignRenderSettings;
  vars: MergeVars;
  escVars: Record<string, string>;
  preview: boolean;
  innerWidth: number;
};

const PAD_X = 32;

function row(block: EmailBlock, ctx: Ctx, inner: string, opts: { align?: Align; padding?: string } = {}) {
  const hook = ctx.preview ? ` data-block-id="${escapeHtml(block.id)}"` : "";
  const align = opts.align ?? "left";
  return `<tr><td${hook} align="${align}" style="padding:${opts.padding ?? `8px ${PAD_X}px`};text-align:${align}">${inner}</td></tr>`;
}

function placeholder(ctx: Ctx, label: string, height = 160) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" height="${height}" style="height:${height}px;background:#f1f1f3;border:2px dashed #d6d6db;border-radius:10px;font-family:${ctx.theme.fontFamily};font-size:13px;color:#8a8d93">${escapeHtml(label)}</td></tr></table>`;
}

function imageTag(src: string, alt: string, width: number, extraStyle = "") {
  return `<img src="${src}" alt="${escapeHtml(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;${extraStyle}">`;
}

function alignedTable(align: Align, inner: string) {
  const margin = align === "center" ? "margin:0 auto" : align === "right" ? "margin:0 0 0 auto" : "margin:0";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="${margin}"><tr>${inner}</tr></table>`;
}

function renderBlock(block: EmailBlock, ctx: Ctx): string {
  const { theme, settings } = ctx;
  const font = theme.fontFamily;
  switch (block.type) {
    case "logo": {
      const src = safeUrl(mergeTags(block.src || settings.logoUrl, ctx.vars));
      const w = clamp(block.width || 140, 24, ctx.innerWidth);
      let inner: string;
      if (src) {
        inner = `<img src="${src}" alt="${escapeHtml(settings.businessName)}" width="${w}" style="display:inline-block;width:${w}px;max-width:100%;height:auto;border:0;outline:none">`;
      } else {
        inner = `<span style="font-family:${font};font-size:20px;font-weight:700;color:${theme.textColor};letter-spacing:-0.2px">${escapeHtml(settings.businessName)}</span>`;
      }
      const href = safeUrl(block.href);
      if (href) inner = `<a href="${href}" target="_blank" style="text-decoration:none">${inner}</a>`;
      return row(block, ctx, inner, { align: block.align, padding: `24px ${PAD_X}px 12px` });
    }
    case "heading": {
      const sizes = { 1: 28, 2: 22, 3: 18 } as const;
      const size = sizes[block.level] ?? 28;
      const color = safeColor(block.color, theme.textColor);
      const text = mergeTags(escapeHtml(block.text).replace(/\n/g, "<br>"), ctx.escVars);
      const tag = `h${block.level}`;
      return row(
        block,
        ctx,
        `<${tag} style="margin:0;font-family:${font};font-size:${size}px;line-height:1.25;font-weight:700;color:${color};letter-spacing:-0.3px;text-align:${block.align}">${text}</${tag}>`,
        { align: block.align, padding: `14px ${PAD_X}px 6px` },
      );
    }
    case "text": {
      const color = safeColor(block.color, theme.textColor);
      const html = markdownToEmailHtml(block.text, {
        color,
        linkColor: theme.brandColor,
        size: clamp(block.size || 16, 12, 24),
        align: block.align,
        vars: ctx.vars,
      });
      return row(block, ctx, `<div style="font-family:${font}">${html || "&nbsp;"}</div>`, { align: block.align });
    }
    case "image": {
      const src = safeUrl(mergeTags(block.src, ctx.vars));
      const w = clamp(block.width || ctx.innerWidth, 40, ctx.innerWidth);
      if (!src) return ctx.preview ? row(block, ctx, placeholder(ctx, "Image — upload or paste a URL"), { align: "center" }) : "";
      let img = imageTag(src, block.alt || "", w, block.rounded ? "border-radius:10px;" : "");
      const href = safeUrl(block.href);
      if (href) img = `<a href="${href}" target="_blank" style="text-decoration:none">${img}</a>`;
      return row(block, ctx, alignedTable(block.align, `<td width="${w}" style="width:${w}px;max-width:100%">${img}</td>`), {
        align: block.align,
        padding: `10px ${PAD_X}px`,
      });
    }
    case "button": {
      const bg = safeColor(block.color, theme.brandColor);
      const fg = safeColor(block.textColor, readableOn(bg));
      const href = safeUrl(mergeTags(block.href, ctx.vars)) || "#";
      const label = mergeTags(escapeHtml(block.label), ctx.escVars);
      const btn = `<td align="center" bgcolor="${bg}" style="border-radius:8px;background:${bg}"><a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;border:1px solid ${bg};border-radius:8px;font-family:${font};font-size:15px;font-weight:600;line-height:1.2;color:${fg};text-decoration:none;mso-padding-alt:0">${label}</a></td>`;
      return row(block, ctx, alignedTable(block.align, btn), { align: block.align, padding: `14px ${PAD_X}px` });
    }
    case "divider": {
      const color = safeColor(block.color, "#e6e6ea");
      return row(
        block,
        ctx,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;border-top:1px solid ${color};font-size:0;line-height:0">&nbsp;</td></tr></table>`,
        { padding: `14px ${PAD_X}px` },
      );
    }
    case "spacer": {
      const h = clamp(block.height || 24, 4, 160);
      return row(block, ctx, `<div style="height:${h}px;line-height:${h}px;font-size:1px">&nbsp;</div>`, { padding: "0" });
    }
    case "columns": {
      const colW = Math.floor((ctx.innerWidth - 24) / 2);
      const col = (text: string, image: string | undefined, side: "l" | "r") => {
        const src = safeUrl(mergeTags(image ?? "", ctx.vars));
        const img = src ? `<div style="margin:0 0 12px">${imageTag(src, "", colW, "border-radius:8px;")}</div>` : "";
        const body = markdownToEmailHtml(text, {
          color: theme.textColor,
          linkColor: theme.brandColor,
          size: 15,
          align: "left",
          vars: ctx.vars,
          lineHeight: 1.55,
        });
        return `<td class="dc-col" width="${colW}" valign="top" style="width:${colW}px;vertical-align:top;${side === "l" ? "padding-right:12px" : "padding-left:12px"};font-family:${font}">${img}${body}</td>`;
      };
      return row(
        block,
        ctx,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${col(block.left, block.leftImage, "l")}${col(block.right, block.rightImage, "r")}</tr></table>`,
        { padding: `12px ${PAD_X}px` },
      );
    }
    case "social": {
      const items = block.links
        .map((l) => {
          const href = safeUrl(l.url);
          if (!href) return "";
          const net = SOCIAL_NETWORKS.find((n) => n.value === l.network);
          const label = net?.label ?? (l.network || "Link");
          const color = net?.color ?? theme.textColor;
          return `<td style="padding:0 4px"><a href="${href}" target="_blank" style="display:inline-block;padding:7px 12px;border-radius:999px;border:1px solid #e3e3e8;font-family:${font};font-size:13px;font-weight:600;color:${color};text-decoration:none">${escapeHtml(label)}</a></td>`;
        })
        .filter(Boolean)
        .join("");
      if (!items) return ctx.preview ? row(block, ctx, placeholder(ctx, "Add social links", 48), { align: "center" }) : "";
      return row(block, ctx, alignedTable(block.align, items), { align: block.align, padding: `12px ${PAD_X}px` });
    }
    case "html": {
      // Admin-authored raw HTML. Merge tags are escaped values.
      return row(block, ctx, `<div style="font-family:${font};color:${theme.textColor}">${mergeTags(block.html, ctx.escVars)}</div>`);
    }
  }
}

function blockToText(block: EmailBlock, vars: MergeVars): string {
  switch (block.type) {
    case "heading":
      return mergeTags(block.text, vars);
    case "text":
      return markdownToText(block.text, vars);
    case "button":
      return `${mergeTags(block.label, vars)}: ${mergeTags(block.href, vars)}`;
    case "image":
      return block.alt ? `[${block.alt}]${block.href ? ` (${block.href})` : ""}` : "";
    case "columns":
      return `${markdownToText(block.left, vars)}\n\n${markdownToText(block.right, vars)}`;
    case "divider":
      return "----------";
    case "social":
      return block.links
        .filter((l) => l.url)
        .map((l) => `${SOCIAL_NETWORKS.find((n) => n.value === l.network)?.label ?? l.network}: ${l.url}`)
        .join("\n");
    case "html":
      return mergeTags(block.html, vars)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim();
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

export function renderCampaign(input: RenderCampaignInput): { html: string; text: string } {
  const theme = resolveTheme(input.theme, input.settings);
  const vars: MergeVars = input.vars ?? {};
  const preview = !!input.preview;
  const ctx: Ctx = {
    theme,
    settings: input.settings,
    vars,
    escVars: escapedVars(vars),
    preview,
    innerWidth: theme.width - PAD_X * 2,
  };
  const subject = mergeTags(input.subject || "", vars);
  const previewText = mergeTags(input.previewText || "", vars);
  const { settings } = input;
  const unsub = input.unsubscribeUrl ? safeUrl(input.unsubscribeUrl) : "#";

  const body = input.blocks.map((b) => renderBlock(b, ctx)).join("\n");
  const empty =
    preview && input.blocks.length === 0
      ? `<tr><td style="padding:48px ${PAD_X}px;text-align:center;font-family:${theme.fontFamily};color:#8a8d93;font-size:14px">Add blocks from the left panel to start building your email.</td></tr>`
      : "";

  const address = settings.address?.trim()
    ? escapeHtml(settings.address.trim()).replace(/\n/g, "<br>")
    : preview
      ? `<span style="color:#d97706">⚠ Add your mailing address in Settings (required by law)</span>`
      : "";

  const footer = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${theme.width}px">
<tr><td align="center" style="padding:24px ${PAD_X}px 8px;font-family:${theme.fontFamily};font-size:12px;line-height:1.6;color:#8a8d93;text-align:center">
<strong style="color:#5f6268">${escapeHtml(settings.businessName)}</strong>${address ? `<br>${address}` : ""}
<br><br>You're receiving this because you've worked with or been in touch with ${escapeHtml(settings.businessName)}.
<br><a href="${unsub}" target="_blank" style="color:#8a8d93;text-decoration:underline">Unsubscribe</a>
</td></tr></table>`;

  // Hidden preheader + filler so body copy doesn't leak into the inbox preview.
  const preheader = previewText
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(previewText)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`
    : "";

  const previewCss = preview
    ? `[data-block-id]{cursor:pointer;transition:outline-color .12s}
[data-block-id]:hover{outline:2px dashed ${theme.brandColor}66;outline-offset:-2px}
a{pointer-events:auto}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root{color-scheme:light;supported-color-schemes:light}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse}
img{-ms-interpolation-mode:bicubic}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
u + #body a{color:inherit;text-decoration:none}
@media only screen and (max-width:${theme.width + 20}px){
  .dc-container{width:100%!important}
  .dc-col{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important}
  .dc-col + .dc-col{padding-top:16px!important}
}
${previewCss}
</style>
</head>
<body id="body" style="margin:0;padding:0;background:${theme.backgroundColor}" bgcolor="${theme.backgroundColor}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.backgroundColor}" style="background:${theme.backgroundColor}">
<tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="${theme.width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="dc-container" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.contentBackground}" style="max-width:${theme.width}px;width:100%;background:${theme.contentBackground};border-radius:12px;font-family:${theme.fontFamily};color:${theme.textColor}">
<tr><td style="height:12px;font-size:0;line-height:0">&nbsp;</td></tr>
${body}${empty}
<tr><td style="height:20px;font-size:0;line-height:0">&nbsp;</td></tr>
</table>
${footer}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;

  const textParts = input.blocks.map((b) => blockToText(b, vars)).filter((t) => t.trim());
  const text = `${textParts.join("\n\n")}

--
${settings.businessName}${settings.address?.trim() ? `\n${settings.address.trim()}` : ""}
Unsubscribe: ${input.unsubscribeUrl ?? ""}`.trim();

  return { html, text };
}
