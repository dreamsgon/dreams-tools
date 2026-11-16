import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // The Foundry module's files are read at request time by /api/bridge/foundry (lib/bridge/foundry-module.ts).
  outputFileTracingIncludes: { "/api/bridge/foundry/[file]": ["./integrations/foundry/rpg-tools-bridge/**/*"], "/api/bridge/roll20/[file]": ["./integrations/roll20/**/*"], "/api/bridge/fantasygrounds/[file]": ["./integrations/fantasygrounds/**/*"] },
  // Vercel Functions run on glibc Linux, so sharp's musl (Alpine) build is never loaded there. Tracing picks up
  // both builds (about 19 MB each) for every route that can post a roll avatar, and each copy is stored with
  // every deployment under Functions Storage.
  outputFileTracingExcludes: { "*": ["node_modules/@img/sharp-libvips-linuxmusl-*/**", "node_modules/@img/sharp-linuxmusl-*/**"] },
};
export default config;
