import SiteHeader from "@/components/site-header";
import CampaignsApp from "@/components/campaigns-app";
import { getAppUser } from "@/lib/app-user";
export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns | RPG Tools" };
export default async function CampaignsPage() {
  const user = await getAppUser();
  return <main className="rpg-hub"><SiteHeader signedIn={!!user} active="campaigns" me={user?{name:user.displayName,avatar:user.avatar}:undefined} /><CampaignsApp signedIn={!!user} /></main>;
}
