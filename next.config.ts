import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
};

export default nextConfig;

// Gives `next dev` access to Cloudflare bindings (R2 media bucket) locally.
initOpenNextCloudflareForDev();
