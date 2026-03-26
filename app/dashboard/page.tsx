import { auth } from "@/lib/auth";
import { Bot, Package, Users, Briefcase, ArrowRight } from "lucide-react";
import Link from "next/link";

const quickLinks = [
  { href: "/dashboard/agents", icon: Bot, label: "Cloud Agents", description: "Manage and monitor AI agents", color: "bg-violet-50 text-violet-600" },
  { href: "/dashboard/artifacts", icon: Package, label: "Artifacts", description: "Files, outputs, and deliverables", color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/team", icon: Users, label: "Team", description: "Team members and roles", color: "bg-emerald-50 text-emerald-600" },
  { href: "/dashboard/clients", icon: Briefcase, label: "Clients", description: "Client accounts and projects", color: "bg-amber-50 text-amber-600" },
];

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Welcome back, {firstName}</h1>
        <p className="text-slate-500 mt-1 text-sm">Here&apos;s a snapshot of the Hostlyft workspace.</p>
      </div>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Quick access</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quickLinks.map(({ href, icon: Icon, label, description, color }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-sm transition-all group"
          >
            <div className={`p-2.5 rounded-lg ${color}`}>
              <Icon size={20} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
