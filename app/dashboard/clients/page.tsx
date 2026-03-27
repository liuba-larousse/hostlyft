import { Briefcase, Plus } from "lucide-react";

export default function ClientsPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-2 text-base">Client accounts, projects, and contact information.</p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-yellow-400 text-gray-900 rounded-xl text-base font-semibold hover:bg-yellow-500 transition-colors cursor-pointer">
          <Plus size={16} />
          Add Client
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-5 bg-amber-50 rounded-2xl mb-5">
          <Briefcase size={36} className="text-amber-500" strokeWidth={1.5} />
        </div>
        <h3 className="font-bold text-lg text-gray-900">No clients yet</h3>
        <p className="text-gray-500 text-base mt-2 max-w-xs">Add client accounts here to track projects, contacts, and status.</p>
      </div>
    </div>
  );
}
