'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Copy, Check, Mail, X, Clock, Eye, EyeOff } from 'lucide-react';

interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  toggl_api_token?: string;
  isCurrentUser?: boolean;
  isAdmin?: boolean;
  avatar_url: string;
  created_at: string;
}

function avatarColor(name: string) {
  const colors = ['#B5D4F4', '#9FE1CB', '#CECBF6', '#F5C4B3', '#C0DD97', '#FAC775', '#F4C0D1'];
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return colors[n % colors.length];
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [togglEdit, setTogglEdit] = useState<string | null>(null); // member id being edited
  const [togglInput, setTogglInput] = useState('');
  const [togglShow, setTogglShow] = useState(false);
  const [togglSaving, setTogglSaving] = useState(false);

  useEffect(() => {
    fetch('/api/team')
      .then(r => r.json())
      .then(data => setMembers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const amAdmin = members.some(m => m.isCurrentUser && m.isAdmin);

  async function saveTogglToken(memberId: string) {
    setTogglSaving(true);
    const res = await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ togglApiToken: togglInput.trim(), memberId }),
    });
    if (res.ok) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, toggl_api_token: togglInput.trim() } : m));
      setTogglEdit(null);
      setTogglInput('');
    }
    setTogglSaving(false);
  }

  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/signin`
    : '/auth/signin';

  const mailtoLink = inviteEmail
    ? `mailto:${inviteEmail}?subject=You've been invited to Hostlyft Team&body=Hi!%0A%0AYou've been invited to join the Hostlyft team dashboard.%0A%0AClick the link below to sign in with your Google account:%0A${encodeURIComponent(inviteLink)}%0A%0ASee you there!`
    : '';

  function copyLink() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500 mt-2 text-base">Manage team members and their access.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-yellow-400 text-gray-900 rounded-xl text-base font-semibold hover:bg-yellow-500 transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Invite Member
        </button>
      </div>

      {/* Member list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-2xl border border-gray-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-5 bg-emerald-50 rounded-2xl mb-5">
            <Users size={36} className="text-emerald-500" strokeWidth={1.5} />
          </div>
          <h3 className="font-bold text-lg text-gray-900">No team members yet</h3>
          <p className="text-gray-500 text-base mt-2 max-w-xs">
            Invite team members to collaborate on the Hostlyft workspace.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(member => {
            const fullName = `${member.first_name} ${member.last_name}`;
            return (
              <div key={member.id} className="flex items-center gap-4 px-5 py-4 bg-white border border-gray-200 rounded-2xl">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={fullName} className="w-11 h-11 rounded-full shrink-0 object-cover" />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-gray-800"
                    style={{ background: avatarColor(fullName) }}
                  >
                    {initials(member.first_name, member.last_name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-base">{fullName}</p>
                  <p className="text-sm text-gray-500 truncate">{member.email}</p>
                  {/* Toggl token row — always visible */}
                  <div className="mt-2">
                    {togglEdit === member.id ? (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 max-w-xs">
                          <input
                            type={togglShow ? 'text' : 'password'}
                            value={togglInput}
                            onChange={e => setTogglInput(e.target.value)}
                            placeholder="Paste Toggl API token"
                            className="w-full text-xs px-2.5 py-1.5 pr-8 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-900 placeholder-gray-400"
                            autoFocus
                          />
                          <button onClick={() => setTogglShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                            {togglShow ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                        <button onClick={() => saveTogglToken(member.id)} disabled={togglSaving}
                          className="text-xs px-2.5 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-50 transition-colors">
                          {togglSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => { setTogglEdit(null); setTogglInput(''); }}
                          className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setTogglEdit(member.id); setTogglInput(member.toggl_api_token ?? ''); setTogglShow(false); }}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                      >
                        <Clock size={11} />
                        {member.toggl_api_token ? 'Toggl connected · update token' : 'Connect Toggl API token'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-400 shrink-0">
                  Joined {new Date(member.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowInvite(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">Invite a team member</h2>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Their email address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="teammate@gmail.com"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-yellow-400 text-gray-900 placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Invite link
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50">
                  <span className="text-sm text-gray-500 flex-1 truncate">{inviteLink}</span>
                  <button
                    onClick={copyLink}
                    className="shrink-0 text-gray-500 hover:text-gray-800 cursor-pointer transition-colors"
                    title="Copy link"
                  >
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Anyone with this link can sign in — make sure their email is in your allowed list.
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                {inviteEmail && (
                  <a
                    href={mailtoLink}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    <Mail size={15} />
                    Send email
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
