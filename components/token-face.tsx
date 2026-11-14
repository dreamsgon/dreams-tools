"use client";
import "./token-ui.css";
import type { Token, Workspace } from "@/lib/model";
import { resolveTokenForCampaign } from "@/lib/token-defaults";

/** A token as a small circle: its picture, or its initials on the side colours (or its own colours). */
export default function TokenFace({ token, workspace, campaignId, initials, size = 33, className = "token-avatar" }: {
  token: Token; workspace: Workspace; campaignId: string | null | undefined; initials: string; size?: number; className?: string;
}) {
  const look = resolveTokenForCampaign(workspace, campaignId, token);
  const asset = token.assetId ? workspace.assets.find(a => a.id === token.assetId) : undefined;
  const letters = initials || "?";
  return <span className={`${className} token-face`} aria-hidden="true" data-picture={asset ? "true" : undefined}
    style={{ width: size, height: size, flex: `0 0 ${size}px`, background: look.color, color: look.textColor ?? "#ffffff", borderColor: look.borderColor ?? look.color,
      fontSize: Math.max(8, Math.round(size * (letters.length > 2 ? 0.3 : 0.38))) }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {asset ? <img src={asset.src} alt="" /> : letters}
  </span>;
}
