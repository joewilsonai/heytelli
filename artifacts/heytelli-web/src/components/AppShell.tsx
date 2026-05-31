import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { MessageSquare, Plus, Settings, Sparkles, UsersRound } from "lucide-react";
import { useSession } from "@/lib/session-context";

const navItems = [
  { href: "/", label: "Matches", icon: UsersRound },
  { href: "/add", label: "Add", icon: Plus },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

function activeFor(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/matches/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const { session } = useSession();

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Primary">
        <Link href="/" className="brand-lockup" aria-label="HeyTelli matches">
          <span className="brand-mark">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <span>HeyTelli</span>
        </Link>
        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeFor(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={item.label}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="side-user">
          <span className="avatar-fallback small">
            {(session?.user.displayName || session?.user.email || "H").slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{session?.user.displayName || session?.user.email}</span>
        </div>
      </aside>

      <main className="app-main">{children}</main>

      <nav className="bottom-nav" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeFor(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bottom-nav-link ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
