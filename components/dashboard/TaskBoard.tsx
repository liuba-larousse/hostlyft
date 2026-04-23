'use client';

import { useState, useEffect, useRef } from 'react';
import { UserPlus } from 'lucide-react';

type Priority = 'low' | 'medium' | 'high';
type Status = 'todo' | 'inprogress' | 'review' | 'done';

interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assignee: string;
  client: string;
  dueDate: string;
  duration: string;
  tags: string[];
  createdAt: string;
}

interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
}

const COLUMNS: { id: Status; label: string; color: string; bg: string; border: string }[] = [
  { id: 'todo',       label: 'To Do',       color: 'text-gray-500',    bg: 'bg-gray-100',    border: 'border-gray-200' },
  { id: 'inprogress', label: 'In Progress',  color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200' },
  { id: 'review',     label: 'Review',       color: 'text-blue-600',    bg: 'bg-blue-50',     border: 'border-blue-200' },
  { id: 'done',       label: 'Done',         color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
];

const PRIORITY_STYLE: Record<Priority, { pill: string; dot: string }> = {
  low:    { pill: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-300' },
  medium: { pill: 'bg-amber-50 text-amber-600',  dot: 'bg-amber-400' },
  high:   { pill: 'bg-red-50 text-red-600',      dot: 'bg-red-500' },
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function avatarColor(name: string) {
  const colors = ['#B5D4F4','#9FE1CB','#CECBF6','#F5C4B3','#C0DD97','#FAC775','#F4C0D1'];
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return colors[n % colors.length];
}

function isOverdue(dueDate: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function formatDue(dueDate: string) {
  if (!dueDate) return '';
  return new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const BLANK: Omit<Task, 'id' | 'createdAt'> = {
  title: '', description: '', status: 'todo',
  priority: 'medium', assignee: '', client: '', dueDate: '',
  duration: '', tags: [],
};

// ── Assignee toggle popover ────────────────────────────────────────────────────
function AssigneeToggle({ taskId, assignee, teamMembers, onAssign }: {
  taskId: string;
  assignee: string;
  teamMembers: TeamMember[];
  onAssign: (taskId: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const assigned = teamMembers.find(m => `${m.first_name} ${m.last_name}` === assignee);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title={assignee || 'Assign member'}
        className="flex items-center gap-1 cursor-pointer"
      >
        {assigned ? (
          assigned.avatar_url ? (
            <img src={assigned.avatar_url} alt={assignee}
              className="w-5 h-5 rounded-full object-cover ring-1 ring-white" />
          ) : (
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-gray-800 font-bold flex-shrink-0 ring-1 ring-white"
              style={{ background: avatarColor(assignee), fontSize: 8 }}>
              {initials(assignee)}
            </span>
          )
        ) : (
          <span className="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-300 hover:border-gray-400 hover:text-gray-400 transition-colors">
            <UserPlus size={10} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[160px]">
          <p className="text-xs text-gray-400 font-medium px-2 pb-1.5">Assign to</p>
          {teamMembers.map(m => {
            const name = `${m.first_name} ${m.last_name}`;
            const isActive = name === assignee;
            return (
              <button
                key={m.id}
                onMouseDown={() => { onAssign(taskId, isActive ? '' : name); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                  isActive ? 'bg-yellow-50 text-yellow-800' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt={name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-gray-800 font-bold shrink-0"
                    style={{ background: avatarColor(name), fontSize: 8 }}>
                    {initials(name)}
                  </span>
                )}
                <span className="truncate">{name}</span>
                {isActive && <span className="ml-auto text-yellow-500 text-xs">✓</span>}
              </button>
            );
          })}
          {assignee && (
            <button
              onMouseDown={() => { onAssign(taskId, ''); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-50 cursor-pointer mt-1 border-t border-gray-100 pt-2"
            >
              Remove assignee
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TaskBoard() {
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [contactNames, setContactNames] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [addingTo, setAddingTo]     = useState<Status | null>(null);
  const [newTitle, setNewTitle]     = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [dragging, setDragging]     = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState<Status | null>(null);
  const [modalTask, setModalTask]   = useState<Task | null>(null);
  const [draft, setDraft]           = useState<Task | null>(null);
  const [saving, setSaving]         = useState(false);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterClient, setFilterClient]     = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load tasks + team members ────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/team').then(r => r.json()),
      fetch('/api/hubspot/contacts').then(r => r.json()).catch(() => ({ names: [] })),
    ]).then(([tasksData, membersData, contactsData]) => {
      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setTeamMembers(Array.isArray(membersData) ? membersData : []);
      setContactNames(Array.isArray(contactsData?.names) ? contactsData.names : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (addingTo && inputRef.current) inputRef.current.focus(); }, [addingTo]);

  // ── Derived option lists ────────────────────────────────────────────────────
  const memberNames    = teamMembers.map(m => `${m.first_name} ${m.last_name}`);
  // Merge HubSpot contacts with any client names already used in tasks (in case HubSpot is not connected)
  const clientOptions  = [...new Set([...contactNames, ...tasks.map(t => t.client).filter(Boolean)])].sort((a, b) => a.localeCompare(b));

  // ── Filtered tasks ──────────────────────────────────────────────────────────
  const filtered = tasks.filter(t =>
    (!filterAssignee || t.assignee === filterAssignee) &&
    (!filterClient   || t.client   === filterClient)   &&
    (!filterPriority || t.priority === filterPriority)
  );
  const activeFilters = [filterAssignee, filterClient, filterPriority].filter(Boolean).length;

  // ── CRUD ────────────────────────────────────────────────────────────────────
  async function addTask() {
    if (!newTitle.trim() || !addingTo) return;
    const payload = { ...BLANK, title: newTitle.trim(), status: addingTo, priority: newPriority };
    setNewTitle(''); setNewPriority('medium'); setAddingTo(null);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const task = await res.json();
      setTasks(prev => [task, ...prev]);
    }
  }

  function openTask(task: Task) { setModalTask(task); setDraft({ ...task }); }

  async function saveModal() {
    if (!draft) return;
    const wasDone = modalTask?.status !== 'done' && draft.status === 'done';
    setSaving(true);
    const res = await fetch(`/api/tasks/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      if (wasDone) window.dispatchEvent(new Event('cat:task-done'));
    }
    setSaving(false);
    setModalTask(null); setDraft(null);
  }

  async function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (modalTask?.id === id) { setModalTask(null); setDraft(null); }
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }

  function moveTask(id: string, status: Status) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    if (status === 'done') window.dispatchEvent(new Event('cat:task-done'));
    fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  async function assignTask(id: string, assignee: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, assignee } : t));
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee }),
    });
  }

  // ── Drag ────────────────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    setDragging(id); e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent, col: Status) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(col);
  }
  function onDrop(e: React.DragEvent, col: Status) {
    e.preventDefault();
    if (dragging) moveTask(dragging, col);
    setDragging(null); setDragOver(null);
  }

  const total     = tasks.length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return (
    <div className="mt-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Task board</h2>
          {total > 0 && <p className="text-xs text-gray-400 mt-0.5">{doneCount} of {total} completed</p>}
        </div>
        {total > 0 && (
          <div className="h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-1.5 bg-emerald-400 rounded-full transition-all"
              style={{ width: `${Math.round(doneCount / total * 100)}%` }} />
          </div>
        )}
      </div>

      {/* ── Filter bar ── */}
      {tasks.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Filter:</span>

          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-full bg-white text-gray-600 outline-none cursor-pointer">
            <option value="">All assignees</option>
            {memberNames.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-full bg-white text-gray-600 outline-none cursor-pointer">
            <option value="">All clients</option>
            {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | '')}
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-full bg-white text-gray-600 outline-none cursor-pointer">
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {activeFilters > 0 && (
            <button onClick={() => { setFilterAssignee(''); setFilterClient(''); setFilterPriority(''); }}
              className="text-xs px-2.5 py-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer transition-colors">
              ✕ Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map(col => (
            <div key={col.id} className="rounded-2xl border border-gray-200 bg-white min-h-40 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Columns ── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const colTasks = filtered.filter(t => t.status === col.id);
            const isOver = dragOver === col.id;
            return (
              <div key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDrop={e => onDrop(e, col.id)}
                onDragLeave={() => setDragOver(null)}
                className={`rounded-2xl border transition-all min-h-40 flex flex-col ${
                  isOver ? 'border-yellow-300 bg-yellow-50 shadow-sm' : 'border-gray-200 bg-white'
                }`}>

                {/* Column header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                    {colTasks.length > 0 && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${col.bg} ${col.color}`}>
                        {colTasks.length}
                      </span>
                    )}
                  </div>
                  <button onClick={() => { setAddingTo(col.id); setNewTitle(''); setNewPriority('medium'); }}
                    className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer text-lg leading-none"
                    title={`Add to ${col.label}`}>+</button>
                </div>

                {/* Inline add form */}
                {addingTo === col.id && (
                  <div className="px-3 pt-3 pb-2 border-b border-gray-100">
                    <input ref={inputRef} value={newTitle} onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTo(null); }}
                      placeholder="Task title..."
                      className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-gray-50 text-gray-900 placeholder-gray-400" />
                    <div className="flex items-center gap-2 mt-2">
                      <select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white text-gray-600 outline-none cursor-pointer">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <button onClick={addTask}
                        className="px-3 py-1 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">Add</button>
                      <button onClick={() => setAddingTo(null)}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Task cards */}
                <div className="flex flex-col gap-2 p-3 flex-1">
                  {colTasks.map(task => {
                    const overdue = isOverdue(task.dueDate);
                    return (
                      <div key={task.id} draggable
                        onDragStart={e => onDragStart(e, task.id)}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        onClick={() => openTask(task)}
                        className={`group bg-white border rounded-xl px-3 py-2.5 cursor-pointer shadow-sm hover:shadow-md transition-all ${
                          dragging === task.id ? 'opacity-40' : 'opacity-100'
                        } border-gray-200 hover:border-gray-300`}>

                        {/* Title row */}
                        <div className="flex items-start gap-2 mb-2">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_STYLE[task.priority].dot}`} />
                          <p className="text-sm text-gray-800 leading-snug flex-1 font-medium">{task.title}</p>
                        </div>

                        {/* Duration + tags */}
                        {(task.duration || (task.tags && task.tags.length > 0)) && (
                          <div className="flex items-center gap-1.5 flex-wrap mb-2 pl-3.5">
                            {task.duration && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium">
                                {task.duration}
                              </span>
                            )}
                            {task.tags?.map((tag, ti) => (
                              <span key={ti} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Description preview */}
                        {task.description && (
                          <p className="text-xs text-gray-400 mb-2 line-clamp-2 leading-relaxed pl-3.5">
                            {task.description}
                          </p>
                        )}

                        {/* Footer: assignee toggle + client + due */}
                        <div className="flex items-center gap-1.5 flex-wrap pl-3.5">
                          <span onClick={e => e.stopPropagation()}>
                            <AssigneeToggle
                              taskId={task.id}
                              assignee={task.assignee}
                              teamMembers={teamMembers}
                              onAssign={assignTask}
                            />
                          </span>
                          {task.assignee && (
                            <span className="text-xs text-gray-500 truncate max-w-16">
                              {task.assignee.split(' ')[0]}
                            </span>
                          )}
                          {task.client && (
                            <span className="text-xs px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded-md font-medium truncate max-w-20">
                              {task.client}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ml-auto flex-shrink-0 ${
                              overdue ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'
                            }`}>
                              {overdue ? '⚠ ' : ''}{formatDue(task.dueDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && addingTo !== col.id && (
                    <div className="flex-1 flex items-center justify-center py-6">
                      <p className="text-xs text-gray-300">Drop tasks here</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Task detail modal ── */}
      {modalTask && draft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setModalTask(null); setDraft(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${PRIORITY_STYLE[draft.priority].dot}`} />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Task detail</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => deleteTask(draft.id)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 cursor-pointer transition-colors">
                  Delete
                </button>
                <button onClick={() => { setModalTask(null); setDraft(null); }}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg leading-none">✕</button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Title</label>
                <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
                  className="w-full text-base font-medium px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-900" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Details</label>
                <textarea value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Add notes, links, context..."
                  rows={4}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700 placeholder-gray-400 resize-none" />
              </div>

              {/* Status + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Status })}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as Priority })}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Assignee + Client */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Assignee</label>
                  <select
                    value={draft.assignee}
                    onChange={e => setDraft({ ...draft, assignee: e.target.value })}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-700 cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map(m => {
                      const name = `${m.first_name} ${m.last_name}`;
                      return <option key={m.id} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Client</label>
                  <select value={draft.client} onChange={e => setDraft({ ...draft, client: e.target.value })}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-900 cursor-pointer">
                    <option value="">— No client —</option>
                    {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Due date</label>
                <input type="date" value={draft.dueDate}
                  onChange={e => setDraft({ ...draft, dueDate: e.target.value })}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700 cursor-pointer" />
              </div>

              {/* Save */}
              <button onClick={saveModal} disabled={saving}
                className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-60">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
