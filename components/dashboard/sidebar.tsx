"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bot, Package, Users, Briefcase, Megaphone, LogOut, FileText, CalendarDays } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "Cloud Agents", icon: Bot },
  { href: "/dashboard/artifacts", label: "Artifacts", icon: Package },
  { href: "/dashboard/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/clients", label: "Clients", icon: Briefcase },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
  { href: "/dashboard/client-reports", label: "Client Reports", icon: FileText },
];

interface Props {
  userName: string;
  userEmail: string;
  userImage?: string | null;
}

export function Sidebar({ userName, userEmail, userImage }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 flex flex-col h-screen bg-white border-r border-gray-200 sticky top-0">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-gray-200">
        <div className="w-9 h-9 rounded-xl bg-yellow-400 flex items-center justify-center shrink-0">
          <span className="text-gray-900 font-bold text-base">H</span>
        </div>
        <span className="text-gray-900 font-bold text-base">Hostlyft Team</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-base transition-colors",
                active
                  ? "bg-yellow-50 text-yellow-700 font-semibold"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2">
          {userImage ? (
            <img src={userImage} alt={userName} className="w-8 h-8 rounded-full shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shrink-0">
              <span className="text-gray-900 text-sm font-bold">{userName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-gray-900 text-sm font-semibold truncate">{userName}</p>
            <p className="text-gray-500 text-sm truncate">{userEmail}</p>
          </div>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors mt-1 cursor-pointer"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
