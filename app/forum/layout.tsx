import './forum.css';
export const metadata = { title: 'Forum | RPG Tools', referrer: 'no-referrer' };
// The forum's own styles and fonts (Cinzel for headings, Cormorant Garamond for post text). A campaign theme
// (the Campaign Skin Studio, later) will layer over these through the same variables and class names.
const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap';
export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return <><link rel="stylesheet" href={FONTS} precedence="default" />{children}</>;
}
