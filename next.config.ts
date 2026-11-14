import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // The Foundry module's files are read at request time by /api/bridge/foundry (lib/bridge/foundry-module.ts).
  outputFileTracingIncludes: { "/api/bridge/foundry/[file]": ["./integrations/foundry/rpg-tools-bridge/**/*"] },
};
export default config;
