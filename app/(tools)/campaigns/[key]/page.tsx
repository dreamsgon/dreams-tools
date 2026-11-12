import { redirect } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CampaignHub from "@/components/campaign-hub";
import { getAppUser } from "@/lib/app-user";
export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign | RPG Tools" };
export default async function CampaignPage({ params }: { params: Promise<{ key: string }> }) {
  const [{ key }, user] = await Promise.all([params, getAppUser()]);
  if (!user) redirect("/account");
  return <main className="rpg-hub"><SiteHeader signedIn active="campaigns" /><CampaignHub campaignKey={decodeURIComponent(key)} /></main>;
}
