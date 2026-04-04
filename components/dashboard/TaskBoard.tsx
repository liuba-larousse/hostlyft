'use client';

import { useState, useEffect, useRef } from 'react';

type Priority = 'low' | 'medium' | 'high';
type Status = 'todo' | 'inprogress' | 'review' | 'done';

interface Task {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  createdAt: string;
}

const COLUMNS: { id: Status; label: string; color: string; bg: string }[] = [
  { id: 'todo',       label: 'To Do',      color: 'text-gray-500',   bg: 'bg-gray-100' },
  { id: 'inprogress', label: 'In Progress', color: 'text-amber-600',  bg: 'bg-amber-50' },
  { id: 'review',     label: 'Review',      color: 'text-blue-600',   bg: 'bg-blue-50' },
  { id: 'done',       label: 'Done',        color: 'text-emerald-600', bg: 'bg-emerald-50' },
];

const PRIORITY_STYLE: Record<Priority, string> = {
  low:    'bg-gray-100 text-gray-500',
  medium: 'bg-amber-50 text-amber-600',
  high:   'bg-red-50 text-red-600',
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadTasks(): Task[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('taskboard') || '[]'); }
  catch { return []; }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem('taskboard', JSON.stringify(tasks));
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [addingTo, setAddingTo] = useState<Status | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTasks(loadTasks()); }, []);
  useEffect(() => { if (addingTo && inputRef.current) inputRef.current.focus(); }, [addingTo]);

  function update(next: Task[]) {
    setTasks(next);
    saveTasks(next);
  }

  function addTask() {
    if (!newTitle.trim() || !addingTo) return;
    const task: Task = {
      id: genId(),
      title: newTitle.trim(),
      status: addingTo,
      priority: newPriority,
      createdAt: new Date().toISOString(),
    };
    update([task, ...tasks]);
    setNewTitle('');
    setNewPriority('medium');
    setAddingTo(null);
  }

  function moveTask(id: string, status: Status) {
    update(tasks.map(t => t.id === id ? { ...t, status } : t));
  }

  function deleteTask(id: string) {
    update(tasks.filter(t => t.id !== id));
  }

  // Drag handlers
  function onDragStart(e: React.DragEvent, id: string) {
    setDragging(id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent, col: Status) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(col);
  }
  function onDrop(e: React.DragEvent, col: Status) {
    e.preventDefault();
    if (dragging) moveTask(dragging, col);
    setDragging(null);
    setDragOver(null);
  }
  function onDragEnd() {
    setDragging(null);
    setDragOver(null);
  }

  const total = tasks.length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return (
    <div className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Task board</h2>
          {total > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {doneCount} of {total} completed
            </p>
          )}
        </div>
        {total > 0 && (
          <div className="h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-1.5 bg-emerald-400 rounded-full transition-all"
              style={{ width: `${Math.round(doneCount / total * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.id);
          const isOver = dragOver === col.id;
          return (
            <div
              key={col.id}
              onDragOver={e => onDragOver(e, col.id)}
              onDrop={e => onDrop(e, col.id)}
              onDragLeave={() => setDragOver(null)}
              className={`rounded-2xl border transition-all min-h-40 flex flex-col ${
                isOver
                  ? 'border-yellow-300 bg-yellow-50 shadow-sm'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                    {col.label}
                  </span>
                  {colTasks.length > 0 && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${col.bg} ${col.color}`}>
                      {colTasks.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setAddingTo(col.id); setNewTitle(''); setNewPriority('medium'); }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer text-lg leading-none"
                  title={`Add to ${col.label}`}
                >
                  +
                </button>
              </div>

              {/* Add task form */}
              {addingTo === col.id && (
                <div className="px-3 pt-3 pb-2 border-b border-gray-100">
                  <input
                    ref={inputRef}
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addTask();
                      if (e.key === 'Escape') setAddingTo(null);
                    }}
                    placeholder="Task title..."
                    className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-gray-50 text-gray-900 placeholder-gray-400"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={newPriority}
                      onChange={e => setNewPriority(e.target.value as Priority)}
                      className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white text-gray-600 outline-none cursor-pointer"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <button
                      onClick={addTask}
                      className="px-3 py-1 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAddingTo(null)}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Tasks */}
              <div className="flex flex-col gap-2 p-3 flex-1">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={e => onDragStart(e, task.id)}
                    onDragEnd={onDragEnd}
                    className={`group bg-white border rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all ${
                      dragging === task.id ? 'opacity-40' : 'opacity-100'
                    } ${isOver && dragging !== task.id ? 'border-yellow-200' : 'border-gray-200'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-800 leading-snug flex-1">{task.title}</p>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all cursor-pointer text-xs leading-none mt-0.5 flex-shrink-0"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${PRIORITY_STYLE[task.priority]}`}>
                        {task.priority}
                      </span>
                      {/* Quick move buttons */}
                      <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        {COLUMNS.filter(c => c.id !== task.status).map(c => (
                          <button
                            key={c.id}
                            onClick={() => moveTask(task.id, c.id)}
                            title={`Move to ${c.label}`}
                            className={`text-xs px-1.5 py-0.5 rounded-md ${c.bg} ${c.color} font-medium cursor-pointer hover:opacity-80 transition-opacity`}
                          >
                            {c.label === 'In Progress' ? 'WIP' : c.label === 'To Do' ? 'Todo' : c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

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
    </div>
  );
}
