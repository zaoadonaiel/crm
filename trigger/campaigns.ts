import { task } from "@trigger.dev/sdk";
import { sendCampaign } from "@/lib/campaigns/send";

/** Sends a campaign in the background (large lists can take minutes). */
export const sendCampaignTask = task({
  id: "send-campaign",
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async (payload: { campaignId: string }) => sendCampaign(payload.campaignId),
});
