import { redirect } from "next/navigation";
import CampaignHub from "@/components/campaign-hub";
import { getAppUser } from "@/lib/app-user";
export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign | RPG Tools" };
export default async function CampaignPage({ params }: { params: Promise<{ key: string }> }) {
  const [{ key }, user] = await Promise.all([params, getAppUser()]);
  if (!user) redirect("/account");
  return <CampaignHub campaignKey={decodeURIComponent(key)} />;
}
