import { Users, Plus } from "lucide-react";

export default function TeamPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage team members and their roles.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors cursor-pointer">
          <Plus size={15} />
          Invite Member
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 bg-emerald-50 rounded-2xl mb-4">
          <Users size={32} className="text-emerald-400" strokeWidth={1.5} />
        </div>
        <h3 className="font-medium">No team members yet</h3>
        <p className="text-slate-500 text-sm mt-1 max-w-xs">Invite team members to collaborate on the Hostlyft workspace.</p>
      </div>
    </div>
  );
}
