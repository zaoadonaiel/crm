import type { Audience, ClientStatus, EmailBlock, EmailTheme } from "@/db/schema";
import type { CampaignRenderSettings } from "@/lib/email/render-campaign";
import type { CampaignKind } from "@/lib/campaigns/templates";

/** Serializable campaign shape handed to the client-side builder. */
export type BuilderCampaign = {
  id: string;
  name: string;
  kind: CampaignKind;
  subject: string;
  previewText: string;
  fromName: string | null;
  blocks: EmailBlock[];
  theme: Partial<EmailTheme>;
  audience: Audience;
  trackReplies: boolean;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduledAt: string | null;
};

export type BuilderSettings = CampaignRenderSettings & {
  fromName: string;
  fromEmail: string;
};

export type ClientOption = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: ClientStatus;
};

export type EditableFields = Pick<
  BuilderCampaign,
  "name" | "kind" | "subject" | "previewText" | "fromName" | "blocks" | "theme" | "audience" | "trackReplies"
>;

export type SaveState = "saved" | "dirty" | "saving" | "error";
