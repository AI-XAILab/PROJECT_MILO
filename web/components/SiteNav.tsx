"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();
  const links = [
    { href: "/chat", label: "Chat" },
    { href: "/admin", label: "Admin" },
  ];

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <div className="site-nav-inner">
        <Link href="/chat" className="site-logo" aria-label="Go to chat">
          <span className="site-logo-mark">M</span>
          <span>MILO</span>
        </Link>
        <div className="site-nav-links">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "site-nav-link active" : "site-nav-link"}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
