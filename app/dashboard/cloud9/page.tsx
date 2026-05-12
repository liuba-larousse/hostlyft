import { BarChart3, FileText, Grid3X3, ArrowRight } from "lucide-react";
import Link from "next/link";

const cards = [
  {
    href: "/dashboard/cloud9/matrix",
    icon: BarChart3,
    label: "Cloud 9 Matrix",
    description: "Pricing actions and bookings correlation matrix",
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    href: "/dashboard/cloud9/action-log",
    icon: FileText,
    label: "Action Log",
    description: "Daily pricing review funnel, action tracking, and portfolio reports",
    color: "bg-amber-50 text-amber-600",
  },
  {
    href: "/dashboard/cloud9/price-matrix",
    icon: Grid3X3,
    label: "Price Matrix",
    description: "Base, min, max pricing calculator",
    color: "bg-rose-50 text-rose-600",
  },
];

export default function Cloud9Page() {
  return (
    <div className="p-5 md:p-10 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Cloud 9</h1>
        <p className="text-gray-500 mt-2 text-base">Pricing tools and action tracking.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ href, icon: Icon, label, description, color }) => (
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
    </div>
  );
}
