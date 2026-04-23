"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Calendar, ArrowRight } from "lucide-react";

interface SummaryTask {
  id: string;
  status: string;
  assignee: string;
  priority: string;
}

function getMonday(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.getFullYear(), d.getMonth(), diff);
  return mon.toISOString().slice(0, 10);
}

export default function WeekSummary() {
  const [tasks, setTasks] = useState<SummaryTask[]>([]);
  const [weekLabel, setWeekLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ws = getMonday(new Date());
    fetch(`/api/weeks/${ws}`)
      .then((r) => r.json())
      .then((data) => {
        setTasks(data.tasks ?? []);
        setWeekLabel(data.week?.week_label ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inprog = tasks.filter((t) => t.status === "inprogress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) {
    return <div className="bg-white border border-gray-200 rounded-2xl p-6 animate-pulse h-32" />;
  }

  if (total === 0) {
    return (
      <Link href="/dashboard/schedule" className="block bg-white border border-gray-200 rounded-2xl p-6 hover:border-yellow-400 hover:shadow-sm transition-all group">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-gray-400" />
            <div>
              <p className="font-semibold text-gray-900">No schedule this week</p>
              <p className="text-sm text-gray-500">Import a schedule to get started</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-gray-400 group-hover:text-yellow-500 transition-colors" />
        </div>
      </Link>
    );
  }

  const R = 36;
  const C = 2 * Math.PI * R;
  const seg1 = (done / total) * C;
  const seg2 = (inprog / total) * C;
  const seg3 = (todo / total) * C;

  return (
    <Link href="/dashboard/schedule" className="block bg-white border border-gray-200 rounded-2xl p-6 hover:border-yellow-400 hover:shadow-sm transition-all group">
      <div className="flex items-center gap-5">
        {/* Mini donut */}
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
            <circle cx="40" cy="40" r={R} fill="none" stroke="#86efac" strokeWidth="10" strokeDasharray={`${seg1} ${C - seg1}`} strokeDashoffset={0} strokeLinecap="round" />
            {inprog > 0 && <circle cx="40" cy="40" r={R} fill="none" stroke="#93c5fd" strokeWidth="10" strokeDasharray={`${seg2} ${C - seg2}`} strokeDashoffset={-seg1} strokeLinecap="round" />}
            {todo > 0 && <circle cx="40" cy="40" r={R} fill="none" stroke="#d3c1ad" strokeWidth="10" strokeDasharray={`${seg3} ${C - seg3}`} strokeDashoffset={-(seg1 + seg2)} strokeLinecap="round" />}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-gray-900">{pct}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-gray-400" />
            <span className="text-xs text-gray-500">{weekLabel}</span>
          </div>
          <p className="font-semibold text-gray-900 mb-2">This Week</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-300" />{done} done</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-300" />{inprog} active</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#d3c1ad" }} />{todo} to do</span>
          </div>
        </div>

        <ArrowRight size={18} className="text-gray-400 group-hover:text-yellow-500 transition-colors shrink-0" />
      </div>
    </Link>
  );
}
