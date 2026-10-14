import { getSettings } from "@/lib/settings";
import { escapeHtml, textToHtml } from "@/lib/utils";

/**
 * Minimal, personal-looking HTML wrapper for 1:1 emails (replies, follow-ups,
 * reminders). Deliberately plain — heavy templates look like marketing and
 * hurt inbox placement for conversational mail.
 */
export async function personalEmailHtml(bodyText: string, opts: { includeSignature?: boolean } = {}) {
  const s = await getSettings();
  const sig = opts.includeSignature !== false && s.signature ? textToHtml(s.signature) : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2328;max-width:600px;padding:16px">
${textToHtml(bodyText)}${sig ? `<div style="color:#57606a;margin-top:18px">${sig}</div>` : ""}
</div></body></html>`;
}

/** Branded card-style email for system notices (portal invites, invoice reminders). */
export async function noticeEmailHtml(opts: {
  heading: string;
  bodyText: string;
  cta?: { label: string; url: string };
  footnote?: string;
}) {
  const s = await getSettings();
  const logo = s.logoUrl
    ? `<img src="${escapeHtml(s.logoUrl)}" alt="${escapeHtml(s.businessName)}" height="36" style="display:block;height:36px;border:0">`
    : `<div style="font-weight:700;font-size:18px;color:#1f2328">${escapeHtml(s.businessName)}</div>`;
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:8px;background:${s.brandColor}">
<a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(opts.cta.label)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #ececef">
<tr><td style="padding:28px 32px 0">${logo}</td></tr>
<tr><td style="padding:20px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2328;font-size:15px;line-height:1.55">
<h1 style="font-size:20px;margin:0 0 14px">${escapeHtml(opts.heading)}</h1>
${textToHtml(opts.bodyText)}${cta}
${opts.footnote ? `<p style="color:#8c8f94;font-size:12px;margin:18px 0 0">${escapeHtml(opts.footnote)}</p>` : ""}
</td></tr></table>
<p style="font-family:Arial,sans-serif;color:#a0a3a8;font-size:12px;margin:16px 0 0">${escapeHtml(s.businessName)}${s.address ? " · " + escapeHtml(s.address) : ""}</p>
</td></tr></table></body></html>`;
}
