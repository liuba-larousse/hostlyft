import { auth } from "@/lib/auth";
import { Bot, Package, Users, Briefcase, ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import WeekSummary from "@/components/dashboard/WeekSummary";
import SendTasksEmailButton from "@/components/dashboard/SendTasksEmailButton";

const quickLinks = [
  { href: "/dashboard/agents", icon: Bot, label: "Cloud Agents", description: "Manage and monitor AI agents", color: "bg-violet-50 text-violet-600" },
  { href: "/dashboard/artifacts", icon: Package, label: "Artifacts", description: "Files, outputs, and deliverables", color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/schedule", icon: CalendarDays, label: "Schedule", description: "Weekly team schedule", color: "bg-yellow-50 text-yellow-600" },
  { href: "/dashboard/team", icon: Users, label: "Team", description: "Team members and roles", color: "bg-emerald-50 text-emerald-600" },
  { href: "/dashboard/clients", icon: Briefcase, label: "Clients", description: "Client accounts and projects", color: "bg-amber-50 text-amber-600" },
];

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="p-5 md:p-10 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Welcome back, {firstName}</h1>
        <p className="text-gray-500 mt-2 text-base">Here&apos;s a snapshot of the Hostlyft workspace.</p>
      </div>
      <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-5">Quick access</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quickLinks.map(({ href, icon: Icon, label, description, color }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-5 p-6 bg-white border border-gray-200 rounded-2xl hover:border-yellow-400 hover:shadow-sm transition-all group"
          >
            <div className={`p-3 rounded-xl ${color}`}>
              <Icon size={22} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base text-gray-900">{label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            </div>
            <ArrowRight size={18} className="text-gray-400 group-hover:text-yellow-500 transition-colors shrink-0" />
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-between mt-10 mb-5">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">This Week</h2>
        <SendTasksEmailButton />
      </div>
      <WeekSummary />
    </div>
  );
}
