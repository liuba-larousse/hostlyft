"use client";

import { useState, useRef } from "react";
import { Upload, Calendar, ChevronRight, X, AlertCircle } from "lucide-react";

interface Task {
  name: string;
  time: string;
  type: "internal" | "cloud9" | "ai" | "client";
  client: string | null;
  dep: string | null;
  delegate: string | null;
}

interface PersonSchedule {
  hours: number;
  tasks: Record<string, Task[]>;
}

interface WeekSchedule {
  week: string;
  invoices?: string[];
  carry_over_next_week?: string[];
  [person: string]: PersonSchedule | string | string[] | undefined;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const TYPE_STYLES: Record<string, string> = {
  internal: "bg-gray-100 text-gray-700 border-gray-200",
  cloud9:   "bg-blue-50 text-blue-700 border-blue-200",
  ai:       "bg-violet-50 text-violet-700 border-violet-200",
  client:   "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const TYPE_DOT: Record<string, string> = {
  internal: "bg-gray-400",
  cloud9:   "bg-blue-500",
  ai:       "bg-violet-500",
  client:   "bg-emerald-500",
};

const KNOWN_META = new Set(["week", "invoices", "carry_over_next_week"]);

function getPeople(schedule: WeekSchedule): string[] {
  return Object.keys(schedule).filter((k) => !KNOWN_META.has(k));
}

export default function WeeklySchedule() {
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");
  const [activePerson, setActivePerson] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function parseAndSet(text: string) {
    try {
      const parsed: WeekSchedule = JSON.parse(text);
      const people = getPeople(parsed);
      setSchedule(parsed);
      setActivePerson(people[0] ?? "");
      setError("");
    } catch {
      setError("Invalid JSON — please check the format and try again.");
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setJsonInput(text);
      parseAndSet(text);
    };
    reader.readAsText(file);
  }

  // ── Input screen ───────────────────────────────────────────────────────────
  if (!schedule) {
    return (
      <div className="p-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Weekly Schedule</h1>
        <p className="text-gray-500 mb-8">Paste your schedule JSON to generate the weekly view.</p>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <textarea
            className="w-full h-64 font-mono text-sm border border-gray-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
            placeholder='{ "week": "20 Apr – 26 Apr", "liuba": { "hours": 33, "tasks": { "Mon": [...] } }, ... }'
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm mt-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => parseAndSet(jsonInput)}
              className="px-5 py-2.5 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-500 transition-colors"
            >
              Generate Schedule
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Upload size={16} />
              Upload JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Schedule view ──────────────────────────────────────────────────────────
  const people = getPeople(schedule);
  const personData = schedule[activePerson] as PersonSchedule | undefined;

  return (
    <div className="p-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Calendar size={14} />
            <span>{schedule.week}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Schedule</h1>
        </div>
        <button
          onClick={() => { setSchedule(null); setJsonInput(""); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-2 transition-colors"
        >
          <X size={14} />
          Load new JSON
        </button>
      </div>

      {/* Invoices + carry-over */}
      {((schedule.invoices?.length ?? 0) > 0 || (schedule.carry_over_next_week?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {(schedule.invoices?.length ?? 0) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2">Invoices Due</p>
              <ul className="space-y-1.5">
                {schedule.invoices!.map((inv, i) => (
                  <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                    <ChevronRight size={13} className="mt-0.5 shrink-0" />
                    {inv}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(schedule.carry_over_next_week?.length ?? 0) > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Carry Over → Next Week</p>
              <ul className="space-y-1.5">
                {schedule.carry_over_next_week!.map((item, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <ChevronRight size={13} className="mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Person tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {people.map((p) => {
          const pd = schedule[p] as PersonSchedule;
          return (
            <button
              key={p}
              onClick={() => setActivePerson(p)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
                activePerson === p
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p} · {pd.hours}h
            </button>
          );
        })}
      </div>

      {/* Day grid */}
      {personData && (
        <div className="grid grid-cols-5 gap-3">
          {DAYS.map((day) => {
            const tasks = personData.tasks[day] ?? [];
            return (
              <div key={day}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{day}</p>
                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <div className="h-10 border border-dashed border-gray-200 rounded-xl" />
                  ) : (
                    tasks.map((task, i) => (
                      <div
                        key={i}
                        className={`border rounded-xl p-2.5 ${TYPE_STYLES[task.type] ?? "bg-gray-50 border-gray-200"}`}
                      >
                        <div className="flex items-start gap-1.5 mb-1">
                          <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[task.type] ?? "bg-gray-400"}`} />
                          <p className="text-xs font-semibold leading-snug">{task.name}</p>
                        </div>
                        <p className="text-xs opacity-60 ml-3">{task.time}</p>
                        {task.client && (
                          <p className="text-xs opacity-60 ml-3 mt-0.5 truncate">{task.client}</p>
                        )}
                        {task.delegate && (
                          <p className="text-xs ml-3 mt-1 opacity-80">{task.delegate}</p>
                        )}
                        {task.dep && (
                          <p className="text-xs ml-3 mt-0.5 italic opacity-50 truncate">{task.dep}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 mt-8 pt-6 border-t border-gray-100">
        {Object.entries(TYPE_DOT).map(([type, dot]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500 capitalize">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
