import MapApp from "@/components/map-app";
import { getAppUser } from "@/lib/app-user";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Maptable | RPG Tools" };
export default async function MaptablePage() {
  const user = await getAppUser();
  if (!user) redirect("/account");
  return <MapApp navigationScope={user.userId} />;
}
