export type InboxFilter = "all" | "unread" | "interested" | "closed";
export const INBOX_FILTERS: InboxFilter[] = ["all", "unread", "interested", "closed"];

export type ConversationStatus = "open" | "interested" | "closed";

export type ConversationListItem = {
  id: string;
  subject: string;
  status: ConversationStatus;
  unread: boolean;
  lastMessageAt: Date;
  preview: string | null;
  direction: "in" | "out" | null;
  client: { id: string; name: string; email: string; company: string | null };
};

export type ThreadMessage = {
  id: string;
  direction: "in" | "out";
  channel: "email" | "portal" | "note";
  fromEmail: string | null;
  toEmail: string | null;
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  createdAt: Date;
};

export type ThreadData = {
  id: string;
  subject: string;
  status: ConversationStatus;
  unread: boolean;
  client: { id: string; name: string; email: string; company: string | null; status: string };
  sequences: { id: string; name: string }[];
  suppressed: boolean;
  messages: ThreadMessage[];
};

export type InboxCounts = Record<InboxFilter, number>;

export type Snippet = { id: string; title: string; body: string };

export type ClientOption = { id: string; name: string; email: string; company: string | null };

export type ActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { data: T })) | { ok: false; error: string };

export const MERGE_TAGS = [
  { tag: "{{first_name}}", label: "First name" },
  { tag: "{{name}}", label: "Full name" },
  { tag: "{{company}}", label: "Company" },
  { tag: "{{email}}", label: "Email" },
] as const;

export const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: "thanks",
    title: "Thanks — on it",
    body: "Hi {{first_name}},\n\nThanks for getting back to me! I'm on it and will follow up shortly.\n\n",
  },
  {
    id: "call",
    title: "Suggest a quick call",
    body: "Hi {{first_name}},\n\nWould it be easier to talk this through? I'm free most afternoons this week — just let me know a time that works for you.\n\n",
  },
  {
    id: "checkin",
    title: "Friendly check-in",
    body: "Hi {{first_name}},\n\nJust checking in to see how everything is going on your end. Anything I can help with?\n\n",
  },
];
