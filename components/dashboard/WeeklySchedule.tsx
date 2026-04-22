"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Calendar, ChevronRight, X, AlertCircle, Check, Save, Eye, ListChecks } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ScheduleTask {
  name: string;
  time: string;
  type: "internal" | "cloud9" | "ai" | "client";
  client: string | null;
  dep: string | null;
  delegate: string | null;
}

interface PersonSchedule {
  hours: number;
  tasks: Record<string, ScheduleTask[]>;
}

interface WeekSchedule {
  week: string;
  invoices?: string[];
  carry_over_next_week?: string[];
  [person: string]: PersonSchedule | string | string[] | undefined;
}

interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
}

type Priority = "low" | "medium" | "high";

interface ImportRow {
  id: string;
  selected: boolean;
  title: string;
  description: string;
  assignee: string;
  client: string;
  priority: Priority;
  dueDate: string;
  day: string;
  time: string;
  taskType: string;
  personKey: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_OFFSET: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const KNOWN_META = new Set(["week", "invoices", "carry_over_next_week"]);

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPeople(schedule: WeekSchedule): string[] {
  return Object.keys(schedule).filter((k) => !KNOWN_META.has(k));
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseWeekStart(weekStr: string): Date | null {
  const m = weekStr.match(/(\d+)\s+(\w+)/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  const yearMatch = weekStr.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return new Date(year, month, day);
}

function datePlusDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function findTeamMember(personKey: string, members: TeamMember[]): string {
  const key = personKey.toLowerCase();
  const match = members.find((m) => {
    const first = m.first_name.toLowerCase();
    return first.startsWith(key.slice(0, 3)) || key.startsWith(first.slice(0, 3));
  });
  return match ? `${match.first_name} ${match.last_name}` : "";
}

function findClient(jsonClient: string | null, contacts: string[]): string {
  if (!jsonClient) return "";
  const parts = jsonClient.split(/[\/,]/).map((s) => s.trim());
  const first = parts[0];
  const match = contacts.find((c) => c.toLowerCase().includes(first.toLowerCase()));
  return match ?? jsonClient;
}

function typeToPriority(type: string, dep: string | null): Priority {
  if (dep) return "medium";
  if (type === "client" || type === "cloud9") return "medium";
  return "low";
}

function buildDescription(task: ScheduleTask, day: string): string {
  const parts: string[] = [];
  if (task.time && task.time !== "All day") parts.push(`Time: ${task.time}`);
  parts.push(`Day: ${day}`);
  parts.push(`Type: ${task.type}`);
  if (task.delegate) parts.push(`Delegate: ${task.delegate}`);
  if (task.dep) parts.push(`Dependency: ${task.dep}`);
  return parts.join(" · ");
}

let rowIdCounter = 0;

function buildImportRows(schedule: WeekSchedule, members: TeamMember[], contacts: string[]): ImportRow[] {
  const weekStart = parseWeekStart(schedule.week);
  const people = getPeople(schedule);
  const rows: ImportRow[] = [];

  for (const personKey of people) {
    const personData = schedule[personKey] as PersonSchedule;
    if (!personData?.tasks) continue;
    const assignee = findTeamMember(personKey, members);

    for (const day of Object.keys(personData.tasks)) {
      const offset = DAY_OFFSET[day] ?? 0;
      const dueDate = weekStart ? datePlusDays(weekStart, offset) : "";

      for (const task of personData.tasks[day]) {
        rows.push({
          id: `import-${rowIdCounter++}`,
          selected: true,
          title: task.name,
          description: buildDescription(task, day),
          assignee,
          client: findClient(task.client, contacts),
          priority: typeToPriority(task.type, task.dep),
          dueDate,
          day,
          time: task.time,
          taskType: task.type,
          personKey,
        });
      }
    }
  }

  return rows;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WeeklySchedule() {
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");
  const [activePerson, setActivePerson] = useState("");
  const [mode, setMode] = useState<"view" | "import">("view");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [contactNames, setContactNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: number; fail: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch team members + contacts on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/team").then((r) => r.json()),
      fetch("/api/hubspot/contacts").then((r) => r.json()).catch(() => ({ names: [] })),
    ]).then(([membersData, contactsData]) => {
      setTeamMembers(Array.isArray(membersData) ? membersData : []);
      setContactNames(Array.isArray(contactsData?.names) ? contactsData.names : []);
    }).catch(() => {});
  }, []);

  const memberNames = teamMembers.map((m) => `${m.first_name} ${m.last_name}`);

  const parseAndSet = useCallback((text: string) => {
    try {
      const parsed: WeekSchedule = JSON.parse(text);
      const people = getPeople(parsed);
      setSchedule(parsed);
      setActivePerson(people[0] ?? "");
      setError("");
      setMode("view");
      setSaveResult(null);
      // Build import rows
      const rows = buildImportRows(parsed, teamMembers, contactNames);
      setImportRows(rows);
    } catch {
      setError("Invalid JSON — please check the format and try again.");
    }
  }, [teamMembers, contactNames]);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setJsonInput(text);
      parseAndSet(text);
    };
    reader.readAsText(file);
  }

  function toggleRow(id: string) {
    setImportRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  }

  function toggleAll() {
    const allSelected = importRows.every((r) => r.selected);
    setImportRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  }

  function updateRow(id: string, field: keyof ImportRow, value: string) {
    setImportRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  async function saveToTaskBoard() {
    const selected = importRows.filter((r) => r.selected);
    if (selected.length === 0) return;

    setSaving(true);
    setSaveResult(null);
    let ok = 0;
    let fail = 0;

    for (const row of selected) {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: row.title,
            description: row.description,
            status: "todo",
            priority: row.priority,
            assignee: row.assignee,
            client: row.client,
            dueDate: row.dueDate,
          }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }

    setSaving(false);
    setSaveResult({ ok, fail });
    // Deselect saved tasks
    if (ok > 0) {
      setImportRows((prev) => prev.map((r) => (r.selected ? { ...r, selected: false } : r)));
    }
  }

  const selectedCount = importRows.filter((r) => r.selected).length;

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
              className="px-5 py-2.5 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-500 transition-colors cursor-pointer"
            >
              Generate Schedule
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
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

  // ── Schedule view + Import ─────────────────────────────────────────────────
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSchedule(null); setJsonInput(""); setSaveResult(null); }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-2 transition-colors cursor-pointer"
          >
            <X size={14} />
            New
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setMode("view")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            mode === "view" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Eye size={14} />
          Schedule View
        </button>
        <button
          onClick={() => setMode("import")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            mode === "import" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ListChecks size={14} />
          Import to Tasks
          {selectedCount > 0 && (
            <span className="ml-1 text-xs bg-yellow-400 text-gray-900 px-1.5 py-0.5 rounded-full font-bold">
              {selectedCount}
            </span>
          )}
        </button>
      </div>

      {/* ── SCHEDULE VIEW ── */}
      {mode === "view" && (
        <>
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
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Carry Over</p>
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
                  className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors cursor-pointer ${
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
                            {task.client && <p className="text-xs opacity-60 ml-3 mt-0.5 truncate">{task.client}</p>}
                            {task.delegate && <p className="text-xs ml-3 mt-1 opacity-80">{task.delegate}</p>}
                            {task.dep && <p className="text-xs ml-3 mt-0.5 italic opacity-50 truncate">{task.dep}</p>}
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
        </>
      )}

      {/* ── IMPORT VIEW ── */}
      {mode === "import" && (
        <div>
          {/* Save result banner */}
          {saveResult && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
              saveResult.fail === 0
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}>
              <Check size={16} />
              {saveResult.ok} task{saveResult.ok !== 1 ? "s" : ""} saved to Task Board.
              {saveResult.fail > 0 && ` ${saveResult.fail} failed.`}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importRows.length > 0 && importRows.every((r) => r.selected)}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-gray-300 accent-yellow-500"
                />
                Select all ({importRows.length})
              </label>
              <span className="text-xs text-gray-400">
                {selectedCount} selected
              </span>
            </div>
            <button
              onClick={saveToTaskBoard}
              disabled={saving || selectedCount === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {saving ? "Saving..." : `Save ${selectedCount} task${selectedCount !== 1 ? "s" : ""} to Board`}
            </button>
          </div>

          {/* Task list grouped by person */}
          {people.map((personKey) => {
            const personRows = importRows.filter((r) => r.personKey === personKey);
            if (personRows.length === 0) return null;

            return (
              <div key={personKey} className="mb-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 capitalize">
                  {personKey} — {(schedule[personKey] as PersonSchedule).hours}h
                </h3>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                        <th className="w-10 py-2.5 px-3"></th>
                        <th className="text-left py-2.5 px-2 font-semibold">Task</th>
                        <th className="text-left py-2.5 px-2 font-semibold w-16">Day</th>
                        <th className="text-left py-2.5 px-2 font-semibold w-40">Assignee</th>
                        <th className="text-left py-2.5 px-2 font-semibold w-40">Client</th>
                        <th className="text-left py-2.5 px-2 font-semibold w-24">Priority</th>
                        <th className="text-left py-2.5 px-2 font-semibold w-32">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personRows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-50 transition-colors ${
                            row.selected ? "bg-white" : "bg-gray-50 opacity-50"
                          }`}
                        >
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => toggleRow(row.id)}
                              className="w-4 h-4 rounded border-gray-300 accent-yellow-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[row.taskType] ?? "bg-gray-400"}`} />
                              <span className="text-gray-800 font-medium text-xs leading-snug">{row.title}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 ml-3">{row.time}</p>
                          </td>
                          <td className="py-2 px-2 text-xs text-gray-500">{row.day}</td>
                          <td className="py-2 px-2">
                            <select
                              value={row.assignee}
                              onChange={(e) => updateRow(row.id, "assignee", e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:border-yellow-400 cursor-pointer"
                            >
                              <option value="">Unassigned</option>
                              {memberNames.map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={row.client}
                              onChange={(e) => updateRow(row.id, "client", e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:border-yellow-400 cursor-pointer"
                            >
                              <option value="">No client</option>
                              {[...new Set([...contactNames, ...(row.client && !contactNames.includes(row.client) ? [row.client] : [])])].sort().map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={row.priority}
                              onChange={(e) => updateRow(row.id, "priority", e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:border-yellow-400 cursor-pointer"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="date"
                              value={row.dueDate}
                              onChange={(e) => updateRow(row.id, "dueDate", e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:border-yellow-400 cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Bottom save bar */}
          {selectedCount > 0 && (
            <div className="sticky bottom-4 mt-4">
              <div className="bg-gray-900 text-white rounded-2xl px-6 py-4 flex items-center justify-between shadow-lg">
                <span className="text-sm">
                  {selectedCount} task{selectedCount !== 1 ? "s" : ""} ready to import
                </span>
                <button
                  onClick={saveToTaskBoard}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-500 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Save size={16} />
                  {saving ? "Saving..." : "Save to Task Board"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
