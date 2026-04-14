import { BarChart2, TrendingUp, Calculator, Package, FileCode, Trash2 } from "lucide-react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import UploadArtifactButton from "@/components/dashboard/UploadArtifactButton";
import DeleteArtifactButton from "@/components/dashboard/DeleteArtifactButton";

const builtIn = [
  {
    id: "revpar-analytics",
    title: "Revenue Forecast",
    description: "React component for interactive RevPAR analysis — portfolio vs. market breakdown with goal tracking.",
    icon: BarChart2,
    color: "bg-violet-50 text-violet-600",
    type: "React Component",
    href: "/dashboard/artifacts/revpar-analytics",
  },
  {
    id: "seasonality-analytics",
    title: "Seasonality Analytics and Opportunities",
    description: "Upload a KPI report to analyse seasonal RevPAR deviations, occupancy gaps, target ADR adjustments, and revenue opportunity by unit.",
    icon: TrendingUp,
    color: "bg-indigo-50 text-indigo-600",
    type: "React Component",
    href: "/dashboard/artifacts/seasonality-analytics",
  },
  {
    id: "pricing-calculator",
    title: "BASE, MIN, MAX & Seasonality Calculator",
    description: "Upload a Hostlyft general report to calculate Base, Min, and Max pricing with 12-month seasonality adjustments by hotel tier and market percentile.",
    icon: Calculator,
    color: "bg-yellow-50 text-yellow-600",
    type: "React Component",
    href: "/dashboard/artifacts/pricing-calculator",
  },
];

async function getUploadedArtifacts() {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("artifacts")
    .select("id, title, description, file_name, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export default async function ArtifactsPage() {
  const uploaded = await getUploadedArtifacts();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Artifacts</h1>
          <p className="text-gray-500 mt-2 text-base">Files, outputs, and deliverables from agents and team.</p>
        </div>
        <UploadArtifactButton />
      </div>

      {/* Uploaded HTML artifacts */}
      {uploaded.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Uploaded</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {uploaded.map(artifact => (
              <div
                key={artifact.id}
                className="flex flex-col gap-4 p-6 bg-white border border-gray-200 rounded-2xl hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-orange-50 shrink-0">
                    <FileCode size={22} strokeWidth={1.8} className="text-orange-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-base text-gray-900 truncate">{artifact.title}</p>
                      <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">HTML</span>
                    </div>
                    <p className="text-sm text-gray-400">
                      {new Date(artifact.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <DeleteArtifactButton id={artifact.id} />
                  <Link
                    href={`/dashboard/artifacts/view/${artifact.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <Package size={14} />
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in components */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Components</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {builtIn.map(({ id, title, description, icon: Icon, color, type, href }) => (
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
                href={href}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Package size={14} />
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
