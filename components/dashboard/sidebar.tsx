"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bot, Package, Users, Briefcase, LogOut } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "Cloud Agents", icon: Bot },
  { href: "/dashboard/artifacts", label: "Artifacts", icon: Package },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/clients", label: "Clients", icon: Briefcase },
];

interface Props {
  userName: string;
  userEmail: string;
  userImage?: string | null;
}

export function Sidebar({ userName, userEmail, userImage }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 flex flex-col h-screen bg-[#0f1117] border-r border-white/5 sticky top-0">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">H</span>
        </div>
        <span className="text-white font-semibold text-sm">Hostlyft Team</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-[#1e2433] text-white font-medium"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2">
          {userImage ? (
            <img src={userImage} alt={userName} className="w-7 h-7 rounded-full shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-medium">{userName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-medium truncate">{userName}</p>
            <p className="text-slate-400 text-xs truncate">{userEmail}</p>
          </div>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors mt-1 cursor-pointer"
          >
            <LogOut size={16} strokeWidth={1.8} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
