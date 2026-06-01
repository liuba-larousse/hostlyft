"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Star, Settings, BarChart3 } from "lucide-react";

const tabs = [
  { href: "/dashboard/client-reports", label: "Bookings", icon: FileText },
  { href: "/dashboard/client-reports/ota-scores", label: "OTA Scores", icon: Star },
  { href: "/dashboard/client-reports/monthly-reports", label: "Monthly Reports", icon: BarChart3 },
  { href: "/dashboard/client-reports/manage", label: "Manage Clients", icon: Settings },
];

export default function ClientReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="client-reports-wrap p-5 md:p-10 max-w-6xl mx-auto print:p-0 print:max-w-none">
      <style>{`@media print {
        .client-reports-tabs { display: none !important; }
        .client-reports-wrap { padding: 0 !important; max-width: none !important; margin: 0 !important; }
      }`}</style>
      <div className="client-reports-tabs flex gap-1 mb-6 border-b border-gray-200 print:hidden">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard/client-reports"
            ? pathname === "/dashboard/client-reports"
            : pathname.startsWith(href);
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
