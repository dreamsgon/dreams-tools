import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { getAppUser } from "@/lib/app-user";
import "@/components/home.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Forums | RPG Tools" };
export default async function ForumsPage() {
  const user = await getAppUser();
  return <main className="rpg-hub">
    <SiteHeader signedIn={!!user} active="forums" />
    <section className="forums-soon">
      <h1>Forums are coming soon</h1>
      <p>We are building a place for players and game masters to swap tips, share ideas and find tables. It is not open yet, but it will live right here when it is.</p>
      <p>In the meantime, your campaigns, maps and notes are all ready for you.</p>
      <div className="forums-soon-links">
        <Link href="/campaigns" className="forums-soon-link">Campaigns</Link>
        <a href="/maptable" className="forums-soon-link">Maptable</a>
        <a href="/encyclopedia" className="forums-soon-link">Encyclopedia</a>
      </div>
    </section>
  </main>;
}
