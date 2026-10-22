// open-next.config.ts — OpenNext Cloudflare adapter configuration
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({}),
  buildCommand: "npx next build",
};
