import { Package, Plus, BarChart2 } from "lucide-react";
import Link from "next/link";

const artifacts = [
  {
    id: "revpar-analytics",
    title: "Revenue Forecast",
    description: "React component for interactive RevPAR analysis — portfolio vs. market breakdown with goal tracking.",
    icon: BarChart2,
    color: "bg-violet-50 text-violet-600",
    type: "React Component",
    action: { label: "View", href: "/dashboard/artifacts/revpar-analytics", external: false },
  },
];

export default function ArtifactsPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Artifacts</h1>
          <p className="text-gray-500 mt-2 text-base">Files, outputs, and deliverables from agents and team.</p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-yellow-400 text-gray-900 rounded-xl text-base font-semibold hover:bg-yellow-500 transition-colors cursor-pointer">
          <Plus size={16} />
          Upload
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {artifacts.map(({ id, title, description, icon: Icon, color, type, action }) => (
          <div
            key={id}
            className="flex flex-col gap-4 p-6 bg-white border border-gray-200 rounded-2xl hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${color} shrink-0`}>
                <Icon size={22} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-base text-gray-900">{title}</p>
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{type}</span>
                </div>
                <p className="text-sm text-gray-500">{description}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Link
                href={action.href}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Package size={14} />
                {action.label}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
