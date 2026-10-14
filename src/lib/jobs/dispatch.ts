import { tasks } from "@trigger.dev/sdk";
import type { sendCampaignTask } from "../../../trigger/campaigns";

/**
 * Hand a campaign send to Trigger.dev when configured, so the web request
 * returns immediately. Returns false when Trigger.dev isn't set up — the
 * caller should then send inline.
 */
export async function dispatchCampaignSend(campaignId: string) {
  if (!process.env.TRIGGER_SECRET_KEY) return false;
  await tasks.trigger<typeof sendCampaignTask>("send-campaign", { campaignId });
  return true;
}
