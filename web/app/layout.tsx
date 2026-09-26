import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "MILO — A little rebellious. A lot of possibility.",
  description: "Meet MILO, a fictional runaway robot and your curious AI companion. Think, learn, and build something together.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-root-shell">
          <SiteNav />
          <main className="page-shell">{children}</main>
        </div>
      </body>
    </html>
  );
}
