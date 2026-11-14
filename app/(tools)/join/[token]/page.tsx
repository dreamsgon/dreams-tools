import SiteHeader from "@/components/site-header";
import JoinCampaign from "@/components/join-campaign";
import { getAppUser } from "@/lib/app-user";
export const dynamic = "force-dynamic";
// The link is the invite, so it stays out of referrers and search engines.
export const metadata = { title: "Join a campaign | RPG Tools", referrer: "no-referrer" as const, robots: { index: false, follow: false } };
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, user] = await Promise.all([params, getAppUser()]);
  return <main className="rpg-hub"><SiteHeader signedIn={!!user} /><JoinCampaign token={token} /></main>;
}
