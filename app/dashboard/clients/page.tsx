import { Briefcase, Plus } from "lucide-react";

export default function ClientsPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-slate-500 mt-1 text-sm">Client accounts, projects, and contact information.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors cursor-pointer">
          <Plus size={15} />
          Add Client
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 bg-amber-50 rounded-2xl mb-4">
          <Briefcase size={32} className="text-amber-400" strokeWidth={1.5} />
        </div>
        <h3 className="font-medium">No clients yet</h3>
        <p className="text-slate-500 text-sm mt-1 max-w-xs">Add client accounts here to track projects, contacts, and status.</p>
      </div>
    </div>
  );
}
