import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  runtime: "node",
  logLevel: "info",
  maxDuration: 900,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
  },
  dirs: ["./trigger"],
});
