"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Calendar, ChevronRight, X, AlertCircle, Check, Save, Eye, ListChecks, Clock, GripVertical, Tag } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ScheduleTask {
  name: string;
  duration?: string;
  time?: string | null;
  type: "internal" | "cloud9" | "ai" | "client";
  client: string | null;
  tags?: string[];
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
type TaskStatus = "todo" | "inprogress" | "done";

interface ViewTask {
  id: string;
  name: string;
  duration: string;
  time: string;
  type: string;
  client: string | null;
  tags: string[];
  dep: string | null;
  delegate: string | null;
  day: string;
  status: TaskStatus;
  personKey: string;
}

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
  duration: string;
  tags: string[];
  taskType: string;
  personKey: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_OFFSET: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const KNOWN_META = new Set(["week", "invoices", "carry_over_next_week"]);

const STATUS_COLORS: Record<TaskStatus, string[]> = {
  todo: [
    "bg-blue-200/80",
    "bg-indigo-200/80",
    "bg-sky-200/80",
    "bg-slate-200/80",
  ],
  inprogress: [
    "bg-amber-300/80",
    "bg-yellow-200/80",
    "bg-orange-200/80",
    "bg-rose-200/80",
  ],
  done: [
    "bg-emerald-200/80",
    "bg-green-200/80",
    "bg-teal-200/80",
    "bg-lime-200/80",
  ],
};

const STATUS_LABEL: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  todo:       { label: "To Do",       color: "text-blue-700",    dot: "bg-blue-500" },
  inprogress: { label: "In Progress", color: "text-amber-700",   dot: "bg-amber-500" },
  done:       { label: "Done",        color: "text-emerald-700", dot: "bg-emerald-500" },
};

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo: "inprogress",
  inprogress: "done",
  done: "todo",
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

/** Extract a display duration from the task — prefers `duration` field, falls back to computing from time range */
function getDisplayDuration(task: ScheduleTask): string {
  if (task.duration) return task.duration;
  if (!task.time || task.time === "All day") return task.time || "";
  const m = task.time.match(/(\d{1,2}):(\d{2})\s*[–\-—]\s*(\d{1,2}):(\d{2})/);
  if (!m) return task.time;
  const diff = (parseInt(m[3]) * 60 + parseInt(m[4])) - (parseInt(m[1]) * 60 + parseInt(m[2]));
  if (diff <= 0) return task.time;
  const h = Math.floor(diff / 60);
  const min = diff % 60;
  if (h > 0 && min > 0) return `${h}h ${min}m`;
  if (h > 0) return `${h}h`;
  return `${min}m`;
}

function getDayDate(weekStr: string, day: string): number | null {
  const ws = parseWeekStart(weekStr);
  if (!ws) return null;
  const offset = DAY_OFFSET[day] ?? 0;
  const d = new Date(ws);
  d.setDate(d.getDate() + offset);
  return d.getDate();
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
  const dur = getDisplayDuration(task);
  if (dur) parts.push(`Block: ${dur}`);
  if (task.time) parts.push(`Time: ${task.time}`);
  parts.push(`Day: ${day}`);
  parts.push(`Type: ${task.type}`);
  if (task.delegate) parts.push(`Delegate: ${task.delegate}`);
  if (task.dep) parts.push(`Dependency: ${task.dep}`);
  return parts.join(" · ");
}

let rowIdCounter = 0;

function buildViewTasks(schedule: WeekSchedule): Record<string, ViewTask[]> {
  const people = getPeople(schedule);
  const result: Record<string, ViewTask[]> = {};

  for (const personKey of people) {
    const personData = schedule[personKey] as PersonSchedule;
    if (!personData?.tasks) continue;
    const tasks: ViewTask[] = [];

    for (const day of Object.keys(personData.tasks)) {
      for (const task of personData.tasks[day]) {
        tasks.push({
          id: `vt-${rowIdCounter++}`,
          name: task.name,
          duration: getDisplayDuration(task),
          time: task.time ?? "",
          type: task.type,
          client: task.client,
          tags: task.tags ?? [],
          dep: task.dep,
          delegate: task.delegate,
          day,
          status: "todo",
          personKey,
        });
      }
    }

    result[personKey] = tasks;
  }

  return result;
}

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
          duration: getDisplayDuration(task),
          tags: task.tags ?? [],
          taskType: task.type,
          personKey,
        });
      }
    }
  }

  return rows;
}

function getCardColor(status: TaskStatus, index: number): string {
  const colors = STATUS_COLORS[status];
  return colors[index % colors.length];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WeeklySchedule() {
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");
  const [activePerson, setActivePerson] = useState("");
  const [mode, setMode] = useState<"view" | "import">("view");
  const [viewTasks, setViewTasks] = useState<Record<string, ViewTask[]>>({});
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [contactNames, setContactNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: number; fail: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      setViewTasks(buildViewTasks(parsed));
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

  // ── View task actions ──────────────────────────────────────────────────────

  function cycleStatus(taskId: string) {
    setViewTasks((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map((t) =>
          t.id === taskId ? { ...t, status: STATUS_CYCLE[t.status] } : t
        );
      }
      return updated;
    });
  }

  function moveTaskToDay(taskId: string, newDay: string) {
    setViewTasks((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map((t) =>
          t.id === taskId ? { ...t, day: newDay } : t
        );
      }
      return updated;
    });
  }

  function onDragStart(e: React.DragEvent, taskId: string) {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent, day: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(day);
  }
  function onDrop(e: React.DragEvent, day: string) {
    e.preventDefault();
    if (draggingId) moveTaskToDay(draggingId, day);
    setDraggingId(null);
    setDragOverDay(null);
  }
  function onDragEnd() {
    setDraggingId(null);
    setDragOverDay(null);
  }

  // ── Import actions ─────────────────────────────────────────────────────────

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
            duration: row.duration,
            tags: row.tags,
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
            placeholder='{ "week": "28 Apr – 02 May", "liuba": { "hours": 22, "tasks": { "Mon": [...] } }, ... }'
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

  // ── Schedule + Import view ─────────────────────────────────────────────────
  const people = getPeople(schedule);
  const personTasks = viewTasks[activePerson] ?? [];

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
          onClick={() => { setSchedule(null); setJsonInput(""); setSaveResult(null); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-2 transition-colors cursor-pointer"
        >
          <X size={14} />
          New
        </button>
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

          {/* Status legend */}
          <div className="flex items-center gap-4 mb-5">
            {(["todo", "inprogress", "done"] as TaskStatus[]).map((s) => {
              const info = STATUS_LABEL[s];
              const count = personTasks.filter((t) => t.status === s).length;
              return (
                <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className={`w-2.5 h-2.5 rounded-full ${info.dot}`} />
                  <span className={`font-semibold ${info.color}`}>{info.label}</span>
                  <span className="text-gray-400">{count}</span>
                </div>
              );
            })}
            <span className="text-xs text-gray-300 ml-2">Click card to change status · Drag to move day</span>
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-5 gap-4">
            {DAYS.map((day) => {
              const dayDate = getDayDate(schedule.week, day);
              const dayTasks = personTasks.filter((t) => t.day === day);
              const isOver = dragOverDay === day;

              return (
                <div
                  key={day}
                  onDragOver={(e) => onDragOver(e, day)}
                  onDrop={(e) => onDrop(e, day)}
                  onDragLeave={() => setDragOverDay(null)}
                  className={`min-h-32 rounded-2xl transition-all ${
                    isOver ? "bg-yellow-50 ring-2 ring-yellow-300" : ""
                  }`}
                >
                  <div className="flex items-baseline gap-1.5 mb-3 px-1">
                    <span className="text-2xl font-bold text-gray-900">{dayDate ?? ""}</span>
                    <span className="text-sm text-gray-400 font-medium">/ {day}</span>
                  </div>

                  <div className="space-y-3">
                    {dayTasks.length === 0 && (
                      <div className="h-20 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center">
                        <p className="text-xs text-gray-300">Drop here</p>
                      </div>
                    )}
                    {dayTasks.map((task, i) => {
                      const cardBg = getCardColor(task.status, i);
                      const statusInfo = STATUS_LABEL[task.status];
                      const isDragging = draggingId === task.id;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, task.id)}
                          onDragEnd={onDragEnd}
                          onClick={() => cycleStatus(task.id)}
                          className={`${cardBg} rounded-2xl p-3.5 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] select-none ${
                            isDragging ? "opacity-40 scale-95" : "opacity-100"
                          }`}
                        >
                          {/* Drag handle + duration */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 text-gray-600/70">
                              <GripVertical size={12} className="cursor-grab" />
                              <Clock size={11} />
                              <span className="text-xs font-medium">{task.duration || "—"}</span>
                            </div>
                            {task.time && (
                              <span className="text-xs text-gray-500/60 font-medium">{task.time}</span>
                            )}
                          </div>

                          {/* Task name */}
                          <p className="text-sm font-bold text-gray-900 leading-snug mb-2">
                            {task.name}
                          </p>

                          {/* Tags */}
                          {task.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {task.tags.map((tag, ti) => (
                                <span key={ti} className="text-xs bg-white/60 rounded-md px-1.5 py-0.5 font-medium text-gray-700/80 flex items-center gap-1">
                                  <Tag size={9} />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Bottom row: client + status */}
                          <div className="flex items-center justify-between gap-2">
                            {task.client ? (
                              <span className="text-xs font-medium text-gray-700/70 truncate">
                                {task.client}
                              </span>
                            ) : (
                              <span />
                            )}
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                              <span className={`text-xs font-semibold ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                          </div>

                          {/* Delegate / dep */}
                          {(task.delegate || task.dep) && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {task.delegate && (
                                <span className="text-xs bg-white/50 rounded-lg px-1.5 py-0.5 text-gray-600">
                                  {task.delegate}
                                </span>
                              )}
                              {task.dep && (
                                <span className="text-xs bg-white/50 rounded-lg px-1.5 py-0.5 text-gray-500 italic">
                                  {task.dep}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── IMPORT VIEW ── */}
      {mode === "import" && (
        <div>
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
              <span className="text-xs text-gray-400">{selectedCount} selected</span>
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
                        <th className="text-left py-2.5 px-2 font-semibold w-20">Block</th>
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
                            <span className="text-gray-800 font-medium text-xs leading-snug">{row.title}</span>
                            {row.tags.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {row.tags.map((t, i) => (
                                  <span key={i} className="text-xs bg-gray-100 text-gray-500 rounded px-1 py-0.5">{t}</span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-xs text-gray-500">{row.day}</td>
                          <td className="py-2 px-2 text-xs text-gray-500">{row.duration}</td>
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
