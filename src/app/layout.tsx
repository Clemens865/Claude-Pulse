import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Pulse",
  description: "Local-first activity tracker for Claude Code",
};

const navItems = [
  { href: "/", label: "Overview", icon: "◈" },
  { href: "/brain", label: "Brain", icon: "◉" },
  { href: "/projects", label: "Projects", icon: "◆" },
  { href: "/timeline", label: "Timeline", icon: "▤" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-50 antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="fixed left-0 top-0 flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4">
              <span className="text-violet-500 text-lg">●</span>
              <span className="font-mono text-sm font-semibold tracking-tight">
                Claude Pulse
              </span>
            </div>

            <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 font-mono text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                >
                  <span className="text-xs">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="border-t border-zinc-800 px-5 py-3">
              <p className="font-mono text-xs text-zinc-600">
                localhost:3141
              </p>
            </div>
          </aside>

          {/* Main content */}
          <main className="ml-56 flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
