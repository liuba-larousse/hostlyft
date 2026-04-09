'use client';

import { useState, useEffect, useCallback } from 'react';
import { Megaphone, RefreshCw, Copy, Check, Trash2, ChevronDown, ChevronUp, Download, Send } from 'lucide-react';

interface LinkedInPost {
  id: string;
  fathom_recording_id: string;
  call_title: string;
  call_date: string;
  attendees: string;
  summary: string;
  post_content: string;
  image_url: string;
  status: 'draft' | 'approved' | 'denied' | 'published';
  created_at: string;
}

interface LinkedInStatus {
  connected: boolean;
  expired?: boolean;
  name?: string;
  expiresAt?: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PostCard({ post, linkedInConnected, onUpdate, onDelete }: {
  post: LinkedInPost;
  linkedInConnected: boolean;
  onUpdate: (id: string, fields: Partial<LinkedInPost>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing]       = useState(false);
  const [draft, setDraft]           = useState(post.post_content);
  const [saving, setSaving]         = useState(false);
  const [copied, setCopied]         = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function save() {
    setSaving(true);
    await onUpdate(post.id, { post_content: draft });
    setSaving(false);
    setEditing(false);
  }

  async function toggleApprove() {
    if (post.status === 'published' || post.status === 'denied') return;
    await onUpdate(post.id, { status: post.status === 'approved' ? 'draft' : 'approved' });
  }

  async function deny() {
    await onUpdate(post.id, { status: 'denied' });
  }

  function copy() {
    navigator.clipboard.writeText(post.post_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function publish() {
    setPublishing(true);
    setPublishMsg(null);
    try {
      const res = await fetch('/api/linkedin/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishMsg({ text: data.error ?? 'Publish failed', ok: false });
      } else {
        setPublishMsg({ text: 'Published to LinkedIn!', ok: true });
        await onUpdate(post.id, { status: 'published' });
      }
    } catch {
      setPublishMsg({ text: 'Publish failed', ok: false });
    } finally {
      setPublishing(false);
      setTimeout(() => setPublishMsg(null), 5000);
    }
  }

  const isPublished = post.status === 'published';
  const isDenied    = post.status === 'denied';

  return (
    <div className={`bg-white border rounded-2xl p-5 transition-all ${
      isPublished ? 'border-[#0A66C2]/30' : post.status === 'approved' ? 'border-emerald-200' : isDenied ? 'border-red-100' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{post.call_title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isPublished ? 'bg-[#0A66C2]/10 text-[#0A66C2]' :
              post.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
              isDenied ? 'bg-red-50 text-red-500' :
              'bg-gray-100 text-gray-500'
            }`}>
              {isPublished ? 'Published' : post.status === 'approved' ? 'Approved' : isDenied ? 'Denied' : 'Draft'}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {formatDate(post.call_date)}
            {post.attendees && ` · ${post.attendees}`}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={copy} title="Copy post"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
            {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
          </button>
          <button onClick={() => onDelete(post.id)} title="Delete"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Call summary (collapsible) */}
      {post.summary && (
        <div className="mb-3">
          <button
            onClick={() => setShowSummary(s => !s)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          >
            {showSummary ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Call summary
          </button>
          {showSummary && (
            <p className="mt-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">
              {post.summary}
            </p>
          )}
        </div>
      )}

      {/* Generated image */}
      {post.image_url && (
        <div className="mb-4 rounded-xl overflow-hidden border border-gray-100 relative group">
          <img src={post.image_url} alt="Generated visual" className="w-full object-cover max-h-52" />
          <a href={post.image_url} download target="_blank" rel="noreferrer"
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 backdrop-blur-sm text-gray-600 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">
            <Download size={14} />
          </a>
        </div>
      )}

      {/* LinkedIn post */}
      <div className="flex items-center gap-2 mb-3">
        <svg viewBox="0 0 24 24" fill="#0A66C2" className="w-3.5 h-3.5 shrink-0">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
        <span className="text-xs font-medium text-[#0A66C2]">LinkedIn Post</span>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={8}
          className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl p-3 outline-none focus:border-yellow-400 resize-none leading-relaxed"
        />
      ) : (
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-3">
          {post.post_content}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="flex gap-2 items-center">
          {editing ? (
            <>
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg cursor-pointer hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setDraft(post.post_content); setEditing(false); }}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            !isPublished && (
              <button onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                Edit
              </button>
            )
          )}
          {publishMsg && (
            <span className={`text-xs px-2 py-1 rounded-lg ${publishMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {publishMsg.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isPublished && !isDenied && (
            <>
              <button onClick={deny}
                className="px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors bg-red-50 text-red-500 hover:bg-red-100">
                Deny
              </button>
              <button onClick={toggleApprove}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  post.status === 'approved'
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                }`}>
                {post.status === 'approved' ? '✓ Approved' : 'Approve'}
              </button>
            </>
          )}
          {isDenied && (
            <button onClick={() => onUpdate(post.id, { status: 'draft' })}
              className="px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200">
              Restore
            </button>
          )}
          {linkedInConnected && !isPublished && (
            <button onClick={publish} disabled={publishing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0A66C2] text-white rounded-lg cursor-pointer hover:bg-[#004182] disabled:opacity-50 transition-colors">
              <Send size={12} />
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {isPublished && (
            <span className="flex items-center gap-1.5 text-xs text-[#0A66C2] font-medium">
              <svg viewBox="0 0 24 24" fill="#0A66C2" className="w-3.5 h-3.5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              Published
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketingView() {
  const [posts, setPosts]             = useState<LinkedInPost[]>([]);
  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState<{ text: string; ok: boolean } | null>(null);
  const [filter, setFilter]           = useState<'all' | 'draft' | 'approved' | 'denied' | 'published'>('all');
  const [liStatus, setLiStatus]       = useState<LinkedInStatus | null>(null);

  const load = useCallback(async () => {
    const [postsRes, liRes] = await Promise.all([
      fetch('/api/marketing/posts'),
      fetch('/api/linkedin/status'),
    ]);
    if (postsRes.ok) setPosts(await postsRes.json());
    if (liRes.ok) setLiStatus(await liRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Handle OAuth callback query params
    const params = new URLSearchParams(window.location.search);
    if (params.get('linkedin') === 'connected') {
      setSyncMsg({ text: 'LinkedIn connected!', ok: true });
      window.history.replaceState({}, '', '/dashboard/marketing');
      setTimeout(() => setSyncMsg(null), 4000);
    } else if (params.get('linkedin') === 'error') {
      setSyncMsg({ text: 'LinkedIn connection failed', ok: false });
      window.history.replaceState({}, '', '/dashboard/marketing');
    }
  }, [load]);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const res = await fetch('/api/marketing/sync', { method: 'POST', signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg({ text: data.error ?? `Error ${res.status}`, ok: false });
      } else if (data.created > 0) {
        setSyncMsg({ text: `${data.created} new post${data.created > 1 ? 's' : ''} generated`, ok: true });
        await load();
      } else {
        setSyncMsg({ text: 'No new calls found', ok: true });
      }
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError' ? 'Request timed out' : 'Sync failed';
      setSyncMsg({ text: msg, ok: false });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

  async function disconnectLinkedIn() {
    await fetch('/api/linkedin/status', { method: 'DELETE' });
    setLiStatus({ connected: false });
  }

  async function updatePost(id: string, fields: Partial<LinkedInPost>) {
    const res = await fetch('/api/marketing/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPosts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    }
  }

  async function deletePost(id: string) {
    await fetch('/api/marketing/posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  const filtered = posts.filter(p => filter === 'all' || p.status === filter);
  const draftCount     = posts.filter(p => p.status === 'draft').length;
  const approvedCount  = posts.filter(p => p.status === 'approved').length;
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const deniedCount    = posts.filter(p => p.status === 'denied').length;

  return (
    <div className="p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0A66C2] flex items-center justify-center shrink-0">
            <Megaphone size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Marketing</h1>
            <p className="text-xs text-gray-400">AI-generated LinkedIn posts from Fathom calls</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className={`text-xs px-3 py-1.5 rounded-full ${syncMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {syncMsg.text}
            </span>
          )}
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl cursor-pointer hover:bg-gray-700 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync calls'}
          </button>
        </div>
      </div>

      {/* LinkedIn connection banner */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl mb-5 border ${
        liStatus?.connected
          ? 'bg-[#0A66C2]/5 border-[#0A66C2]/20'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" fill={liStatus?.connected ? '#0A66C2' : '#9ca3af'} className="w-4 h-4 shrink-0">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          {liStatus?.connected ? (
            <span className="text-sm text-[#0A66C2] font-medium">
              Connected{liStatus.name ? ` as ${liStatus.name}` : ''}
              {liStatus.expiresAt && (
                <span className="text-xs text-[#0A66C2]/60 ml-1.5 font-normal">
                  · expires {formatDate(liStatus.expiresAt)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              {liStatus?.expired ? 'LinkedIn token expired — reconnect to publish' : 'Connect LinkedIn to publish posts directly'}
            </span>
          )}
        </div>
        {liStatus?.connected ? (
          <button onClick={disconnectLinkedIn}
            className="text-xs text-gray-400 hover:text-red-500 cursor-pointer transition-colors">
            Disconnect
          </button>
        ) : (
          <a href="/api/linkedin/auth"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0A66C2] text-white rounded-lg hover:bg-[#004182] transition-colors">
            Connect
          </a>
        )}
      </div>

      {/* Stats */}
      {posts.length > 0 && (
        <div className="grid grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Total', value: posts.length },
            { label: 'Drafts', value: draftCount },
            { label: 'Approved', value: approvedCount },
            { label: 'Published', value: publishedCount },
            { label: 'Denied', value: deniedCount },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {posts.length > 0 && (
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
          {(['all', 'draft', 'approved', 'denied', 'published'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors capitalize ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Posts */}
      {loading ? (
        <div className="text-sm text-gray-400 text-center py-16">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
          <Megaphone size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No posts yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Click <strong>Sync calls</strong> to fetch your latest Fathom calls and generate LinkedIn posts
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(post => (
            <PostCard key={post.id} post={post} linkedInConnected={!!liStatus?.connected} onUpdate={updatePost} onDelete={deletePost} />
          ))}
        </div>
      )}
    </div>
  );
}
