/**
 * Starter templates for new campaigns. Pure data — safe to import from client
 * components.
 */
import type { EmailBlock, EmailTheme } from "@/db/schema";
import { newBlock } from "@/lib/email/render-campaign";

export type CampaignKind = "newsletter" | "announcement" | "holiday" | "outreach";

export type CampaignTemplate = {
  id: string;
  name: string;
  description: string;
  kind: CampaignKind;
  subject: string;
  previewText: string;
  theme?: Partial<EmailTheme>;
  /** Plain outreach looks like a 1:1 email — no logo, no buttons. */
  trackReplies?: boolean;
  blocks: () => EmailBlock[];
};

/** Helper: create a block of a given type and override some props. */
function b<T extends EmailBlock["type"]>(type: T, props: Partial<Extract<EmailBlock, { type: T }>> = {}): EmailBlock {
  return { ...newBlock(type), ...props } as EmailBlock;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "newsletter",
    name: "Newsletter",
    description: "A monthly roundup: what's new, what you've been working on, and a clear call to action.",
    kind: "newsletter",
    subject: "What's new this month at {{company|your business}}",
    previewText: "A few quick updates, a recent project and one thing worth trying.",
    blocks: () => [
      b("logo"),
      b("heading", { text: "This month's update", level: 1, align: "left" }),
      b("text", {
        text: "Hi {{first_name|there}},\n\nHere's a quick roundup of what I've been working on and a few things that might be useful for {{company|your business}}.",
      }),
      b("image", { src: "", alt: "Featured project", width: 536 }),
      b("heading", { text: "Recent project", level: 2 }),
      b("text", {
        text: "A short story about a recent win — what the problem was, what we did, and the result.\n\n- Result one\n- Result two\n- Result three",
      }),
      b("button", { label: "See the full case study", href: "https://" }),
      b("divider"),
      b("columns", {
        left: "**Quick tip**\nOne practical thing your readers can do this week.",
        right: "**Worth reading**\nA link or resource you found valuable — [read it here](https://).",
      }),
      b("text", { text: "Thanks for reading — just hit reply if there's anything I can help with.\n\nCheers,\nDavey" }),
      b("social"),
    ],
  },
  {
    id: "launch",
    name: "New product / tool launch",
    description: "Announce something you built and invite people to get early access.",
    kind: "announcement",
    subject: "I built something new — want early access?",
    previewText: "It's a small tool that saves hours every week. You're one of the first to hear about it.",
    blocks: () => [
      b("logo"),
      b("heading", { text: "I built something new 🎉", level: 1, align: "center" }),
      b("text", {
        align: "center",
        text: "Hi {{first_name|there}}, I've been quietly working on a new tool and you're one of the first people I'm telling about it.",
      }),
      b("image", { src: "", alt: "Screenshot of the new tool", width: 536 }),
      b("heading", { text: "What it does", level: 2 }),
      b("text", {
        text: "In one sentence: it helps you **do the thing** without the busywork.\n\n- **Faster** — what used to take hours now takes minutes\n- **Simpler** — no setup, works with what you already use\n- **Built for you** — shaped by feedback from clients like {{company|you}}",
      }),
      b("button", { label: "Get early access", href: "https://" }),
      b("text", {
        align: "center",
        size: 14,
        text: "Early users get founder pricing for life. Questions? Just reply — I read every email.",
      }),
    ],
  },
  {
    id: "holiday",
    name: "Holiday greetings",
    description: "A warm seasonal note to thank clients and share your holiday hours.",
    kind: "holiday",
    subject: "Happy holidays from all of us 🎄",
    previewText: "A quick thank-you for a great year, plus our holiday hours.",
    theme: { brandColor: "#b91c1c", backgroundColor: "#fbf6ef" },
    blocks: () => [
      b("logo"),
      b("image", { src: "", alt: "Happy holidays", width: 536 }),
      b("heading", { text: "Happy holidays, {{first_name|friend}}!", level: 1, align: "center" }),
      b("text", {
        align: "center",
        text: "Thank you for trusting us this year. Working with {{company|you}} has been a real highlight, and we're grateful for every project, message and referral.",
      }),
      b("divider"),
      b("heading", { text: "Holiday hours", level: 3, align: "center" }),
      b("text", {
        align: "center",
        text: "We're taking a short break from **Dec 24 – Jan 2**.\nUrgent issue? Reply to this email and we'll get back to you.",
      }),
      b("spacer", { height: 12 }),
      b("text", { align: "center", text: "Wishing you a restful break and a great new year,\n**The team**" }),
    ],
  },
  {
    id: "reengage",
    name: "Re-engage: checking in",
    description: "A plain, personal-looking note for people who never replied to a proposal or invoice.",
    kind: "outreach",
    subject: "Quick check-in, {{first_name|there}}",
    previewText: "",
    trackReplies: true,
    theme: { backgroundColor: "#ffffff", contentBackground: "#ffffff" },
    blocks: () => [
      b("text", {
        text: "Hi {{first_name|there}},\n\nI wanted to follow up on my last note — I know things get busy, so no pressure at all.\n\nIs this still something you're thinking about for {{company|your business}}? If the timing isn't right, just let me know and I'll close the loop on my end.\n\nIf it helps, I'm happy to jump on a quick 15-minute call to answer any questions.\n\nThanks,\nDavey",
      }),
    ],
  },
  {
    id: "blank",
    name: "Blank",
    description: "Start from scratch with an empty canvas.",
    kind: "newsletter",
    subject: "",
    previewText: "",
    blocks: () => [b("logo"), b("text", { text: "Hi {{first_name|there}},\n\n" })],
  },
];

export function getTemplate(id: string) {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id);
}

export const CAMPAIGN_KINDS: { value: CampaignKind; label: string }[] = [
  { value: "newsletter", label: "Newsletter" },
  { value: "announcement", label: "Announcement" },
  { value: "holiday", label: "Holiday" },
  { value: "outreach", label: "Outreach" },
];
