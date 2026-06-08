"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";

const tabs = [
  { href: "/dashboard/team/members", label: "Members", icon: Users },
];

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="p-5 md:p-10 max-w-6xl mx-auto">
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors -mb-px ${
                active
                  ? "text-gray-900 border-b-2 border-yellow-400"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
