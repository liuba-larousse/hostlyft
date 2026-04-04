'use client';

import { useState, useEffect, useRef } from 'react';

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
  createdAt: string;
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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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
  const d = new Date(dueDate);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const BLANK_TASK: Omit<Task, 'id' | 'createdAt'> = {
  title: '', description: '', status: 'todo',
  priority: 'medium', assignee: '', client: '', dueDate: '',
};

function loadTasks(): Task[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('taskboard') || '[]'); }
  catch { return []; }
}
function saveTasks(tasks: Task[]) {
  localStorage.setItem('taskboard', JSON.stringify(tasks));
}

// ── Autocomplete input ────────────────────────────────────────────────────────
function Autocomplete({ value, onChange, options, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase()) && o !== value);
  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white text-gray-900 placeholder-gray-400 ${className}`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {filtered.map(o => (
            <button key={o} onMouseDown={() => onChange(o)}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TaskBoard() {
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [addingTo, setAddingTo]     = useState<Status | null>(null);
  const [newTitle, setNewTitle]     = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [dragging, setDragging]     = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState<Status | null>(null);
  const [modalTask, setModalTask]   = useState<Task | null>(null);
  const [draft, setDraft]           = useState<Task | null>(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterClient, setFilterClient]     = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTasks(loadTasks()); }, []);
  useEffect(() => { if (addingTo && inputRef.current) inputRef.current.focus(); }, [addingTo]);

  function update(next: Task[]) { setTasks(next); saveTasks(next); }

  // ── Derived option lists ────────────────────────────────────────────────────
  const assigneeOptions = [...new Set(tasks.map(t => t.assignee).filter(Boolean))];
  const clientOptions   = [...new Set(tasks.map(t => t.client).filter(Boolean))];

  // ── Filtered tasks ──────────────────────────────────────────────────────────
  const filtered = tasks.filter(t =>
    (!filterAssignee || t.assignee === filterAssignee) &&
    (!filterClient   || t.client   === filterClient)   &&
    (!filterPriority || t.priority === filterPriority)
  );
  const activeFilters = [filterAssignee, filterClient, filterPriority].filter(Boolean).length;

  // ── CRUD ────────────────────────────────────────────────────────────────────
  function addTask() {
    if (!newTitle.trim() || !addingTo) return;
    const task: Task = { id: genId(), createdAt: new Date().toISOString(),
      ...BLANK_TASK, title: newTitle.trim(), status: addingTo, priority: newPriority };
    update([task, ...tasks]);
    setNewTitle(''); setNewPriority('medium'); setAddingTo(null);
  }

  function openTask(task: Task) { setModalTask(task); setDraft({ ...task }); }

  function saveModal() {
    if (!draft) return;
    update(tasks.map(t => t.id === draft.id ? draft : t));
    setModalTask(null); setDraft(null);
  }

  function deleteTask(id: string) {
    update(tasks.filter(t => t.id !== id));
    if (modalTask?.id === id) { setModalTask(null); setDraft(null); }
  }

  function moveTask(id: string, status: Status) {
    update(tasks.map(t => t.id === id ? { ...t, status } : t));
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

          {/* Assignee filter */}
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-full bg-white text-gray-600 outline-none cursor-pointer">
            <option value="">All assignees</option>
            {assigneeOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Client filter */}
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-full bg-white text-gray-600 outline-none cursor-pointer">
            <option value="">All clients</option>
            {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Priority filter */}
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

      {/* ── Columns ── */}
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

                      {/* Description preview */}
                      {task.description && (
                        <p className="text-xs text-gray-400 mb-2 line-clamp-2 leading-relaxed pl-3.5">
                          {task.description}
                        </p>
                      )}

                      {/* Footer: assignee + client + due */}
                      <div className="flex items-center gap-1.5 flex-wrap pl-3.5">
                        {task.assignee && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-gray-700 font-semibold flex-shrink-0"
                              style={{ background: avatarColor(task.assignee), fontSize: 8 }}>
                              {initials(task.assignee)}
                            </span>
                            <span className="truncate max-w-16">{task.assignee.split(' ')[0]}</span>
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
                  <Autocomplete value={draft.assignee}
                    onChange={v => setDraft({ ...draft, assignee: v })}
                    options={assigneeOptions} placeholder="Team member..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Client</label>
                  <Autocomplete value={draft.client}
                    onChange={v => setDraft({ ...draft, client: v })}
                    options={clientOptions} placeholder="Client name..." />
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
              <button onClick={saveModal}
                className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer">
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
