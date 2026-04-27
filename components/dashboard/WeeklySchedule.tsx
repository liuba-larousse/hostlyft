"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload, Calendar, ChevronRight, ChevronLeft, X, AlertCircle, Check, Save,
  Eye, ListChecks, Clock, GripVertical, Tag, Pencil, Inbox, Plus,
} from "lucide-react";

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

type Priority = "low" | "medium" | "high" | "critical";
type TaskStatus = "todo" | "inprogress" | "done";

interface DBTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  client: string;
  dueDate: string;
  duration: string;
  tags: string[];
  weekId: string | null;
  dayOfWeek: string;
  taskType: string;
  dependency: string;
  delegate: string;
  sortOrder: number;
  createdAt: string;
}

interface DBWeek {
  id: string;
  week_start: string;
  week_label: string;
  invoices: string[];
  carry_over: string[];
  person_hours: Record<string, number>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_OFFSET: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const KNOWN_META = new Set(["week", "invoices", "carry_over_next_week"]);

const TODO_COLORS = ["#f5efe6", "#e8dfd4", "#ddd0c0", "#d3c1ad"];
const STATUS_COLORS: Record<TaskStatus, string[]> = {
  todo: [],
  inprogress: ["bg-yellow-200/80", "bg-amber-300/80", "bg-orange-200/80", "bg-yellow-300/80"],
  done: ["bg-emerald-200/80", "bg-green-200/80", "bg-teal-200/80", "bg-lime-200/80"],
};
const STATUS_LABEL: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  todo:       { label: "To Do",       color: "text-stone-600",   dot: "bg-[#d3c1ad]" },
  inprogress: { label: "In Progress", color: "text-amber-700",   dot: "bg-amber-500" },
  done:       { label: "Done",        color: "text-emerald-700", dot: "bg-emerald-500" },
};
const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = { todo: "inprogress", inprogress: "done", done: "todo" };

const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function sortByPriority<T extends { priority: Priority }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const s = size;
  if (priority === "critical") return <svg width={s} height={s} viewBox="0 0 20 20" className="shrink-0"><circle cx="10" cy="10" r="9" fill="#dc2626"/><path d="M10 5 L14 11 H6 Z" fill="white"/></svg>;
  if (priority === "high") return <svg width={s} height={s} viewBox="0 0 20 20" className="shrink-0"><circle cx="10" cy="10" r="9" fill="#f59e0b"/><path d="M8 13 L13 10 L8 7 Z" fill="white"/></svg>;
  if (priority === "medium") return <svg width={s} height={s} viewBox="0 0 20 20" className="shrink-0"><circle cx="10" cy="10" r="9" fill="#22c55e"/><circle cx="6.5" cy="10" r="1.3" fill="white"/><circle cx="10" cy="10" r="1.3" fill="white"/><circle cx="13.5" cy="10" r="1.3" fill="white"/></svg>;
  return <svg width={s} height={s} viewBox="0 0 20 20" className="shrink-0"><circle cx="10" cy="10" r="9" fill="#5b9aad"/><path d="M10 15 L6 9 H14 Z" fill="white"/></svg>;
}

function getCardColor(status: TaskStatus, index: number): { className: string; style?: React.CSSProperties } {
  if (status === "todo") return { className: "", style: { backgroundColor: TODO_COLORS[index % TODO_COLORS.length] } };
  const colors = STATUS_COLORS[status];
  return { className: colors[index % colors.length] };
}

function getPeople(schedule: WeekSchedule): string[] {
  return Object.keys(schedule).filter((k) => !KNOWN_META.has(k));
}

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

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

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(d: Date): string {
  const end = new Date(d);
  end.setDate(end.getDate() + 4);
  const fmt = (dt: Date) => `${dt.getDate()} ${dt.toLocaleString("en", { month: "short" })}`;
  return `${fmt(d)} – ${fmt(end)}`;
}

function getDayDate(weekStart: string, day: string): number | null {
  const d = new Date(weekStart + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (DAY_OFFSET[day] ?? 0));
  return d.getDate();
}

function getDisplayDuration(task: ScheduleTask): string {
  if (task.duration) return task.duration;
  if (!task.time || task.time === "All day") return task.time || "";
  const m = task.time.match(/(\d{1,2}):(\d{2})\s*[–\-—]\s*(\d{1,2}):(\d{2})/);
  if (!m) return task.time;
  const diff = (parseInt(m[3]) * 60 + parseInt(m[4])) - (parseInt(m[1]) * 60 + parseInt(m[2]));
  if (diff <= 0) return task.time;
  const h = Math.floor(diff / 60); const min = diff % 60;
  if (h > 0 && min > 0) return `${h}h ${min}m`;
  if (h > 0) return `${h}h`;
  return `${min}m`;
}

// Name aliases: different names that refer to the same team member
const NAME_ALIASES: Record<string, string[]> = {
  olaniyan: ["ayoka", "yetunde"],
  ayoka: ["olaniyan", "yetunde"],
  yetunde: ["olaniyan", "ayoka"],
};

// Display name overrides for person tabs
const DISPLAY_NAMES: Record<string, string> = {
  olaniyan: "Ayoka",
};

function findTeamMember(personKey: string, members: TeamMember[]): string {
  const key = personKey.toLowerCase();
  const aliases = [key, ...(NAME_ALIASES[key] ?? [])];
  const match = members.find((m) => {
    const first = m.first_name.toLowerCase();
    const last = m.last_name.toLowerCase();
    return aliases.some((a) =>
      first.startsWith(a.slice(0, 3)) || a.startsWith(first.slice(0, 3)) ||
      last.startsWith(a.slice(0, 3)) || a.startsWith(last.slice(0, 3))
    );
  });
  return match ? `${match.first_name} ${match.last_name}` : "";
}

function findClient(jsonClient: string | null, contacts: string[]): string {
  if (!jsonClient) return "";
  const parts = jsonClient.split(/[\/,]/).map((s) => s.trim());
  const match = contacts.find((c) => c.toLowerCase().includes(parts[0].toLowerCase()));
  return match ?? jsonClient;
}

function typeToPriority(type: string, dep: string | null): Priority {
  if (dep) return "medium";
  if (type === "client" || type === "cloud9") return "medium";
  return "low";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WeeklySchedule() {
  const [tab, setTab] = useState<"week" | "import" | "backlog">("week");
  const [weekStart, setWeekStart] = useState(() => formatDateISO(getMonday(new Date())));
  const [weekData, setWeekData] = useState<DBWeek | null>(null);
  const [tasks, setTasks] = useState<DBTask[]>([]);
  const [backlog, setBacklog] = useState<DBTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [contactNames, setContactNames] = useState<string[]>([]);
  const [activePerson, setActivePerson] = useState("");
  const [activeDay, setActiveDay] = useState("Mon");
  const [modalTask, setModalTask] = useState<DBTask | null>(null);
  const [draft, setDraft] = useState<DBTask | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  // Import state
  const [jsonInput, setJsonInput] = useState("");
  const [importError, setImportError] = useState("");
  const [parsedSchedule, setParsedSchedule] = useState<WeekSchedule | null>(null);
  const [importWeek, setImportWeek] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<number | null>(null);
  const [excludedTasks, setExcludedTasks] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const memberNames = teamMembers.map((m) => `${m.first_name} ${m.last_name}`);

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch("/api/team").then((r) => r.json()),
      fetch("/api/hubspot/contacts").then((r) => r.json()).catch(() => ({ names: [] })),
    ]).then(([m, c]) => {
      setTeamMembers(Array.isArray(m) ? m : []);
      setContactNames(Array.isArray(c?.names) ? c.names : []);
    }).catch(() => {});
  }, []);

  const loadWeek = useCallback(async (ws: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/weeks/${ws}`);
      const data = await res.json();
      if (data.error) {
        setLoadError(data.error);
        setTasks([]); setWeekData(null);
      } else {
        setWeekData(data.week ?? null);
        setTasks(data.tasks ?? []);
        const assigneeList = [...new Set((data.tasks ?? []).map((t: DBTask) => t.assignee).filter(Boolean))] as string[];
        if (assigneeList.length > 0) {
          setActivePerson((prev) => assigneeList.includes(prev) ? prev : assigneeList[0]);
        }
      }
    } catch (e) { console.error("Failed to load week:", e); setLoadError(String(e)); setTasks([]); setWeekData(null); }
    setLoading(false);
  }, []);

  const loadBacklog = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?backlog=true");
      const data = await res.json();
      setBacklog(Array.isArray(data) ? data : []);
    } catch { setBacklog([]); }
  }, []);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);
  useEffect(() => { if (tab === "backlog") loadBacklog(); }, [tab, loadBacklog]);

  // ── Week navigation ────────────────────────────────────────────────────────

  function shiftWeek(delta: number) {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(formatDateISO(d));
  }

  // ── Task CRUD ──────────────────────────────────────────────────────────────

  async function patchTask(id: string, patch: Partial<DBTask>) {
    const body: Record<string, unknown> = {};
    if ('status' in patch) body.status = patch.status;
    if ('dayOfWeek' in patch) body.dayOfWeek = patch.dayOfWeek;
    if ('title' in patch) body.title = patch.title;
    if ('description' in patch) body.description = patch.description;
    if ('priority' in patch) body.priority = patch.priority;
    if ('assignee' in patch) body.assignee = patch.assignee;
    if ('client' in patch) body.client = patch.client;
    if ('duration' in patch) body.duration = patch.duration;
    if ('taskType' in patch) body.taskType = patch.taskType;
    if ('dependency' in patch) body.dependency = patch.dependency;
    if ('delegate' in patch) body.delegate = patch.delegate;
    if ('tags' in patch) body.tags = patch.tags;
    if ('weekId' in patch) body.weekId = patch.weekId;
    if ('dueDate' in patch) body.dueDate = patch.dueDate;

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setBacklog((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function cycleStatus(id: string) {
    const task = tasks.find((t) => t.id === id) ?? backlog.find((t) => t.id === id);
    if (!task) return;
    const newStatus = STATUS_CYCLE[task.status];
    patchTask(id, { status: newStatus });
    if (newStatus === "done") window.dispatchEvent(new Event("cat:task-done"));
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setBacklog((prev) => prev.filter((t) => t.id !== id));
    setModalTask(null); setDraft(null);
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  function openModal(task: DBTask) {
    setModalTask(task);
    setDraft({ ...task });
  }

  async function saveModal() {
    if (!draft) return;
    const wasDone = modalTask?.status !== "done" && draft.status === "done";
    await patchTask(draft.id, draft);
    if (wasDone) window.dispatchEvent(new Event("cat:task-done"));
    setModalTask(null); setDraft(null);
  }

  async function moveToBacklog(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setBacklog((prev) => [{ ...task, weekId: null, dayOfWeek: "" }, ...prev]);
    await patchTask(id, { weekId: null, dayOfWeek: "" } as Partial<DBTask>);
  }

  async function assignToWeek(id: string, day: string) {
    const task = backlog.find((t) => t.id === id);
    if (!task || !weekData) return;
    setBacklog((prev) => prev.filter((t) => t.id !== id));
    setTasks((prev) => [...prev, { ...task, weekId: weekData.id, dayOfWeek: day }]);
    await patchTask(id, { weekId: weekData.id, dayOfWeek: day } as Partial<DBTask>);
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function onDragStart(e: React.DragEvent, id: string) { setDraggingId(id); e.dataTransfer.effectAllowed = "move"; }
  function onDragOver(e: React.DragEvent, day: string) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverDay(day); }
  function onDrop(e: React.DragEvent, day: string) {
    e.preventDefault();
    if (draggingId) patchTask(draggingId, { dayOfWeek: day });
    setDraggingId(null); setDragOverDay(null);
  }
  function onDragEnd() { setDraggingId(null); setDragOverDay(null); }

  // ── Import logic ───────────────────────────────────────────────────────────

  function parseJSON(text: string) {
    try {
      const parsed: WeekSchedule = JSON.parse(text);
      setParsedSchedule(parsed);
      setImportError("");
      setExcludedTasks(new Set());
      const ws = parseWeekStart(parsed.week);
      setImportWeek(ws ? formatDateISO(ws) : formatDateISO(getMonday(new Date())));
    } catch { setImportError("Invalid JSON"); }
  }

  async function runImport() {
    if (!parsedSchedule || !importWeek) return;
    setImporting(true);
    setImportResult(null);
    const people = getPeople(parsedSchedule);
    const personHours: Record<string, number> = {};
    const allTasks: Array<Record<string, unknown>> = [];

    for (const personKey of people) {
      const pd = parsedSchedule[personKey] as PersonSchedule;
      if (!pd?.tasks) continue;
      personHours[personKey] = pd.hours;
      const assignee = findTeamMember(personKey, teamMembers);

      for (const day of Object.keys(pd.tasks)) {
        const offset = DAY_OFFSET[day] ?? 0;
        const ws = new Date(importWeek + "T00:00:00");
        ws.setDate(ws.getDate() + offset);
        const dueDate = formatDateISO(ws);

        for (const [i, task] of pd.tasks[day].entries()) {
          const taskKey = `${personKey}-${day}-${i}`;
          if (excludedTasks.has(taskKey)) continue;
          allTasks.push({
            title: task.name,
            description: "",
            status: "todo",
            priority: typeToPriority(task.type, task.dep),
            assignee,
            client: findClient(task.client, contactNames),
            dueDate,
            duration: getDisplayDuration(task),
            tags: task.tags ?? [],
            dayOfWeek: day,
            taskType: task.type,
            dependency: task.dep ?? "",
            delegate: task.delegate ?? "",
            sortOrder: i,
          });
        }
      }
    }

    try {
      const res = await fetch(`/api/weeks/${importWeek}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_label: parsedSchedule.week,
          invoices: parsedSchedule.invoices ?? [],
          carry_over: parsedSchedule.carry_over_next_week ?? [],
          person_hours: personHours,
          tasks: allTasks,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setImportError(`Import failed: ${data.error}`);
      } else {
        setImportResult(data.imported ?? 0);
        window.dispatchEvent(new Event("cat:schedule-import"));
        // Navigate to imported week — force reload even if same week
        if (weekStart === importWeek) {
          await loadWeek(importWeek);
        } else {
          setWeekStart(importWeek);
        }
        setTimeout(() => setTab("week"), 1500);
      }
    } catch (e) { setImportError("Import failed — check console"); console.error(e); }
    setImporting(false);
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const assignees = [...new Set(tasks.map((t) => t.assignee).filter(Boolean))];
  const personTasks = tasks.filter((t) => t.assignee === activePerson);
  const allStatuses = tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const totalTasks = tasks.length;
  const doneTasks = allStatuses.done ?? 0;
  const inprogTasks = allStatuses.inprogress ?? 0;
  const todoTasks = allStatuses.todo ?? 0;
  const donePct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const inprogPct = totalTasks ? Math.round((inprogTasks / totalTasks) * 100) : 0;
  const todoPct = totalTasks ? Math.round((todoTasks / totalTasks) * 100) : 0;

  // ── Render: Task Card (shared between week view and backlog) ───────────────

  function TaskCard({ task, index, showDay, draggable: isDraggable }: { task: DBTask; index: number; showDay?: boolean; draggable?: boolean }) {
    const card = getCardColor(task.status as TaskStatus, index);
    const statusInfo = STATUS_LABEL[task.status as TaskStatus] ?? STATUS_LABEL.todo;
    const isDragging = draggingId === task.id;

    return (
      <div
        draggable={isDraggable}
        onDragStart={isDraggable ? (e) => onDragStart(e, task.id) : undefined}
        onDragEnd={isDraggable ? onDragEnd : undefined}
        onClick={() => cycleStatus(task.id)}
        style={card.style}
        className={`${card.className} rounded-2xl p-3.5 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] select-none relative group ${isDragging ? "opacity-40 scale-95" : ""}`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); openModal(task); }}
          className="absolute top-2.5 right-2.5 w-6 h-6 rounded-lg bg-white/60 hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
          title="Edit details"
        >
          <Pencil size={11} className="text-gray-600" />
        </button>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-gray-600/70">
            {isDraggable && <GripVertical size={12} className="cursor-grab" />}
            <Clock size={11} />
            <span className="text-xs font-medium">{task.duration || "—"}</span>
          </div>
          {showDay && task.dayOfWeek && <span className="text-xs text-gray-500 font-medium">{task.dayOfWeek}</span>}
        </div>
        <div className="flex items-start gap-1 mb-2">
          <PriorityIcon priority={task.priority as Priority} size={14} />
          <p className="text-sm font-bold text-gray-900 leading-snug">{task.title}</p>
        </div>
        {task.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.tags.map((tag, ti) => (
              <span key={ti} className="text-xs bg-white/60 rounded-md px-1.5 py-0.5 font-medium text-gray-700/80 flex items-center gap-1">
                <Tag size={9} />{tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {task.client ? <span className="text-xs font-medium text-gray-700/70 truncate">{task.client}</span> : <span />}
          <div className="flex items-center gap-1 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
            <span className={`text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>
        </div>
        {(task.delegate || task.dependency) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {task.delegate && <span className="text-xs bg-white/50 rounded-lg px-1.5 py-0.5 text-gray-600">{task.delegate}</span>}
            {task.dependency && <span className="text-xs bg-white/50 rounded-lg px-1.5 py-0.5 text-gray-500 italic">{task.dependency}</span>}
          </div>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 md:p-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Weekly Schedule</h1>
      </div>

      {/* Main tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { id: "week" as const, icon: Eye, label: "This Week" },
          { id: "import" as const, icon: Upload, label: "Import" },
          { id: "backlog" as const, icon: Inbox, label: "Backlog", count: backlog.length },
        ]).map(({ id, icon: Icon, label, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={14} />
            {label}
            {count !== undefined && count > 0 && (
              <span className="ml-1 text-xs bg-yellow-400 text-gray-900 px-1.5 py-0.5 rounded-full font-bold">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
         TAB 1: THIS WEEK
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === "week" && (
        <>
          {/* Week navigation */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => shiftWeek(-1)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 cursor-pointer"><ChevronLeft size={16} /></button>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900">{weekData?.week_label || formatWeekLabel(new Date(weekStart + "T00:00:00"))}</span>
            </div>
            <button onClick={() => shiftWeek(1)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 cursor-pointer"><ChevronRight size={16} /></button>
            <button onClick={() => setWeekStart(formatDateISO(getMonday(new Date())))} className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 cursor-pointer">Today</button>
          </div>

          {loading && <div className="text-sm text-gray-400 py-10 text-center">Loading...</div>}

          {loadError && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200">
              <AlertCircle size={16} /> {loadError}
            </div>
          )}

          {!loading && tasks.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-base font-medium mb-1">No schedule for this week</p>
              <p className="text-sm">Import a schedule in the Import tab</p>
            </div>
          )}

          {!loading && tasks.length > 0 && (
            <>
              {/* Invoices + carry-over */}
              {weekData && ((weekData.invoices?.length ?? 0) > 0 || (weekData.carry_over?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {weekData.invoices?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2">Invoices Due</p>
                      <ul className="space-y-1.5">
                        {weekData.invoices.map((inv, i) => <li key={i} className="text-sm text-amber-800 flex items-start gap-2"><ChevronRight size={13} className="mt-0.5 shrink-0" />{inv}</li>)}
                      </ul>
                    </div>
                  )}
                  {weekData.carry_over?.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Carry Over</p>
                      <ul className="space-y-1.5">
                        {weekData.carry_over.map((item, i) => <li key={i} className="text-sm text-gray-600 flex items-start gap-2"><ChevronRight size={13} className="mt-0.5 shrink-0" />{item}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Progress donut */}
              {totalTasks > 0 && (() => {
                const R = 54; const C = 2 * Math.PI * R;
                const seg1 = (doneTasks / totalTasks) * C;
                const seg2 = (inprogTasks / totalTasks) * C;
                const seg3 = (todoTasks / totalTasks) * C;
                return (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-center gap-5">
                    <div className="relative w-32 h-32 shrink-0">
                      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                        <circle cx="64" cy="64" r={R} fill="none" stroke="#86efac" strokeWidth="16" strokeDasharray={`${seg1} ${C - seg1}`} strokeDashoffset={0} strokeLinecap="round" />
                        {inprogTasks > 0 && <circle cx="64" cy="64" r={R} fill="none" stroke="#93c5fd" strokeWidth="16" strokeDasharray={`${seg2} ${C - seg2}`} strokeDashoffset={-seg1} strokeLinecap="round" />}
                        {todoTasks > 0 && <circle cx="64" cy="64" r={R} fill="none" stroke="#d3c1ad" strokeWidth="16" strokeDasharray={`${seg3} ${C - seg3}`} strokeDashoffset={-(seg1 + seg2)} strokeLinecap="round" />}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold text-gray-900">{donePct}%</span><span className="text-xs text-gray-400">done</span></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-gray-900 mb-3">Team Progress</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-300" /><span className="text-sm text-gray-700">Completed</span></div><span className="text-sm font-semibold text-gray-900">{doneTasks}/{totalTasks} · {donePct}%</span></div>
                        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-300" /><span className="text-sm text-gray-700">In Progress</span></div><span className="text-sm font-semibold text-gray-900">{inprogTasks}/{totalTasks} · {inprogPct}%</span></div>
                        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#d3c1ad" }} /><span className="text-sm text-gray-700">To Do</span></div><span className="text-sm font-semibold text-gray-900">{todoTasks}/{totalTasks} · {todoPct}%</span></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Person tabs */}
              {assignees.length > 0 && (
                <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto">
                  {assignees.map((a) => {
                    const [firstName, lastName] = [a.split(" ")[0], a.split(" ").slice(1).join(" ")];
                    const displayName = DISPLAY_NAMES[firstName.toLowerCase()] ?? firstName;
                    const nameParts = [firstName, lastName, displayName].map((n) => n.toLowerCase()).filter(Boolean);
                    const allAliases = [...new Set(nameParts.flatMap((n) => [n, ...(NAME_ALIASES[n] ?? [])]))];
                    const hoursKey = Object.keys(weekData?.person_hours ?? {}).find((k) => {
                      const kl = k.toLowerCase();
                      return allAliases.some((al) => kl === al || kl.startsWith(al.slice(0, 3)) || al.startsWith(kl.slice(0, 3)));
                    });
                    const hours = hoursKey ? weekData?.person_hours?.[hoursKey] : null;
                    return (
                      <button key={a} onClick={() => setActivePerson(a)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${activePerson === a ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                        {displayName}{hours ? ` · ${hours}h` : ""}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Status legend */}
              <div className="flex items-center gap-3 md:gap-4 mb-5 flex-wrap">
                {(["todo", "inprogress", "done"] as TaskStatus[]).map((s) => {
                  const info = STATUS_LABEL[s];
                  const count = personTasks.filter((t) => t.status === s).length;
                  return <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500"><span className={`w-2.5 h-2.5 rounded-full ${info.dot}`} /><span className={`font-semibold ${info.color}`}>{info.label}</span><span className="text-gray-400">{count}</span></div>;
                })}
                <span className="hidden md:inline text-xs text-gray-300 ml-2">Click card to change status · Drag to move day</span>
              </div>

              {/* Mobile: day tabs + stacked cards */}
              <div className="md:hidden">
                <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 overflow-x-auto">
                  {DAYS.map((day) => {
                    const dayDate = getDayDate(weekStart, day);
                    const count = personTasks.filter((t) => t.dayOfWeek === day).length;
                    return (
                      <button key={day} onClick={() => setActiveDay(day)}
                        className={`flex-1 min-w-0 py-2.5 px-1 rounded-lg text-center transition-colors cursor-pointer ${activeDay === day ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                        <span className="text-lg font-bold block">{dayDate ?? ""}</span>
                        <span className="text-xs text-gray-400">{day}</span>
                        {count > 0 && <span className={`block text-xs mt-0.5 ${activeDay === day ? "text-yellow-600" : "text-gray-400"}`}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  {sortByPriority(personTasks.filter((t) => t.dayOfWeek === activeDay)).map((task, i) => (
                    <TaskCard key={task.id} task={task} index={i} />
                  ))}
                  {personTasks.filter((t) => t.dayOfWeek === activeDay).length === 0 && (
                    <div className="h-20 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center"><p className="text-sm text-gray-300">No tasks</p></div>
                  )}
                </div>
              </div>

              {/* Desktop: 5-column grid */}
              <div className="hidden md:grid grid-cols-5 gap-4">
                {DAYS.map((day) => {
                  const dayDate = getDayDate(weekStart, day);
                  const dayTasks = sortByPriority(personTasks.filter((t) => t.dayOfWeek === day));
                  const isOver = dragOverDay === day;
                  return (
                    <div key={day} onDragOver={(e) => onDragOver(e, day)} onDrop={(e) => onDrop(e, day)} onDragLeave={() => setDragOverDay(null)}
                      className={`min-h-32 rounded-2xl transition-all ${isOver ? "bg-yellow-50 ring-2 ring-yellow-300" : ""}`}>
                      <div className="flex items-baseline gap-1.5 mb-3 px-1">
                        <span className="text-2xl font-bold text-gray-900">{dayDate ?? ""}</span>
                        <span className="text-sm text-gray-400 font-medium">/ {day}</span>
                      </div>
                      <div className="space-y-3">
                        {dayTasks.length === 0 && <div className="h-20 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center"><p className="text-xs text-gray-300">Drop here</p></div>}
                        {dayTasks.map((task, i) => <TaskCard key={task.id} task={task} index={i} draggable />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
         TAB 2: IMPORT
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === "import" && (
        <div className="max-w-3xl">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Import Schedule</h2>
          <p className="text-gray-500 text-sm mb-6">Paste your schedule JSON, pick the week, and import.</p>

          {importResult !== null && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check size={16} /> {importResult} tasks imported. Switching to This Week...
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <textarea
              className="w-full h-48 font-mono text-sm border border-gray-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
              placeholder='Paste schedule JSON here...'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
            />
            {importError && <div className="flex items-center gap-2 text-red-600 text-sm"><AlertCircle size={14} />{importError}</div>}

            <div className="flex items-center gap-3">
              <button onClick={() => parseJSON(jsonInput)} className="px-5 py-2.5 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-500 transition-colors cursor-pointer">Parse JSON</button>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"><Upload size={16} />Upload File</button>
              {(parsedSchedule || jsonInput) && (
                <button onClick={() => { setJsonInput(""); setParsedSchedule(null); setImportError(""); setImportResult(null); setExcludedTasks(new Set()); }} className="flex items-center gap-1.5 px-4 py-2.5 text-gray-500 hover:text-gray-900 text-sm font-medium cursor-pointer transition-colors"><X size={14} />Reset</button>
              )}
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { const r = new FileReader(); r.onload = (ev) => { const t = ev.target?.result as string; setJsonInput(t); parseJSON(t); }; r.readAsText(e.target.files[0]); } }} />
            </div>

            {parsedSchedule && (
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Assign to week starting</label>
                    <input type="date" value={importWeek} onChange={(e) => setImportWeek(e.target.value)} className="text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700 cursor-pointer" />
                  </div>
                  <div className="pt-5">
                    <span className="text-sm text-gray-500">{parsedSchedule.week}</span>
                  </div>
                </div>

                {/* Summary stats */}
                {(() => {
                  const totalImportTasks = getPeople(parsedSchedule).reduce((sum, p) => { const pd = parsedSchedule![p] as PersonSchedule; return sum + Object.values(pd?.tasks ?? {}).flat().length; }, 0);
                  const selectedCount = totalImportTasks - excludedTasks.size;
                  return (
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <span><strong>{getPeople(parsedSchedule).length}</strong> people</span>
                      <span><strong>{selectedCount}</strong> / {totalImportTasks} tasks selected</span>
                      {parsedSchedule.invoices?.length ? <span><strong>{parsedSchedule.invoices.length}</strong> invoices</span> : null}
                    </div>
                  );
                })()}

                {/* Task preview by person */}
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  {getPeople(parsedSchedule).map((personKey) => {
                    const pd = parsedSchedule![personKey] as PersonSchedule;
                    if (!pd?.tasks) return null;
                    const allTasks = Object.entries(pd.tasks).flatMap(([day, tasks]) => tasks.map((t, ti) => ({ ...t, day, _key: `${personKey}-${day}-${ti}` })));
                    return (
                      <div key={personKey}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest capitalize">{personKey}</span>
                          <span className="text-xs text-gray-400">{pd.hours}h · {allTasks.length} tasks</span>
                        </div>
                        <div className="bg-gray-50 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-200">
                                <th className="w-8 py-2 px-2">
                                  <input
                                    type="checkbox"
                                    checked={allTasks.every((t) => !excludedTasks.has(t._key))}
                                    onChange={() => {
                                      const allSelected = allTasks.every((t) => !excludedTasks.has(t._key));
                                      setExcludedTasks((prev) => {
                                        const next = new Set(prev);
                                        allTasks.forEach((t) => allSelected ? next.add(t._key) : next.delete(t._key));
                                        return next;
                                      });
                                    }}
                                    className="w-3.5 h-3.5 rounded border-gray-300 accent-yellow-500 cursor-pointer"
                                  />
                                </th>
                                <th className="text-left py-2 px-3 font-semibold w-14">Day</th>
                                <th className="text-left py-2 px-3 font-semibold">Task</th>
                                <th className="text-left py-2 px-3 font-semibold w-16">Block</th>
                                <th className="text-left py-2 px-3 font-semibold w-24">Client</th>
                                <th className="text-left py-2 px-3 font-semibold w-20">Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allTasks.map((task, i) => {
                                const checked = !excludedTasks.has(task._key);
                                return (
                                <tr key={i} className={`border-b border-gray-100 last:border-0 transition-opacity ${checked ? "" : "opacity-40"}`}>
                                  <td className="py-1.5 px-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => setExcludedTasks((prev) => {
                                        const next = new Set(prev);
                                        checked ? next.add(task._key) : next.delete(task._key);
                                        return next;
                                      })}
                                      className="w-3.5 h-3.5 rounded border-gray-300 accent-yellow-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-1.5 px-3 text-xs text-gray-500">{task.day}</td>
                                  <td className="py-1.5 px-3 text-xs text-gray-800 font-medium">{task.name}</td>
                                  <td className="py-1.5 px-3 text-xs text-gray-500">{getDisplayDuration(task)}</td>
                                  <td className="py-1.5 px-3 text-xs text-gray-500 truncate">{task.client || "—"}</td>
                                  <td className="py-1.5 px-3">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                      task.type === "client" ? "bg-emerald-50 text-emerald-600" :
                                      task.type === "cloud9" ? "bg-blue-50 text-blue-600" :
                                      task.type === "ai" ? "bg-violet-50 text-violet-600" :
                                      "bg-gray-100 text-gray-500"
                                    }`}>{task.type}</span>
                                  </td>
                                </tr>
                              ); })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={runImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Save size={16} />
                  {importing ? "Importing..." : "Import Schedule"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
         TAB 3: BACKLOG
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === "backlog" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Task Backlog</h2>
              <p className="text-sm text-gray-500">{backlog.length} unassigned task{backlog.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {backlog.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Inbox size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-base font-medium">Backlog is empty</p>
              <p className="text-sm">Tasks not assigned to a week will appear here</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortByPriority(backlog).map((task, i) => (
              <div key={task.id} className="relative">
                <TaskCard task={task} index={i} showDay />
                {weekData && (
                  <div className="absolute top-2.5 left-2.5 opacity-0 group-hover:opacity-100">
                    <select
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { if (e.target.value) assignToWeek(task.id, e.target.value); }}
                      className="text-xs px-2 py-1 rounded-lg bg-white/80 border border-gray-200 cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>+ Assign to day</option>
                      {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
         TASK DETAIL MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {modalTask && draft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setModalTask(null); setDraft(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <PriorityIcon priority={draft.priority as Priority} size={14} />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Task detail</span>
              </div>
              <div className="flex items-center gap-2">
                {draft.weekId && (
                  <button onClick={() => { moveToBacklog(draft.id); setModalTask(null); setDraft(null); }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                    Move to Backlog
                  </button>
                )}
                <button onClick={() => deleteTask(draft.id)} className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 cursor-pointer transition-colors">Delete</button>
                <button onClick={() => { setModalTask(null); setDraft(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Title</label>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full text-base font-medium px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Details</label>
                <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Add notes, links, context..." rows={3} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700 placeholder-gray-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    <option value="todo">To Do</option><option value="inprogress">In Progress</option><option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Day</label>
                  <select value={draft.dayOfWeek} onChange={(e) => setDraft({ ...draft, dayOfWeek: e.target.value })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    <option value="">Unassigned</option>
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Assignee</label>
                  <select value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    <option value="">Unassigned</option>
                    {memberNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Client</label>
                  <select value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    <option value="">— No client —</option>
                    {[...new Set([...contactNames, ...(draft.client && !contactNames.includes(draft.client) ? [draft.client] : [])])].sort().map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Duration</label>
                  <input value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} placeholder="e.g. 1h" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Type</label>
                  <select value={draft.taskType} onChange={(e) => setDraft({ ...draft, taskType: e.target.value })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    <option value="client">Client</option><option value="cloud9">Cloud 9</option><option value="internal">Internal</option><option value="ai">AI</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tags</label>
                <input value={draft.tags?.join(", ") ?? ""} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} placeholder="Comma-separated" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700 placeholder-gray-400" />
              </div>
              <button onClick={saveModal} className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
