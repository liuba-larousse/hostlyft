'use client';

import { useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  status: 'customer' | 'lead' | 'inactive';
  added: string;
  lastDeal?: {
    amount: string;
    currency: string;
    closeDate: string;
    paid: boolean;
  };
}

interface TogglProject { id: number; name: string; }

type Filter = 'all' | 'customer' | 'lead' | 'inactive' | 'subscription';
type Platform = 'none' | 'HubSpot' | 'Upwork' | 'Fiverr';

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = ['none', 'HubSpot', 'Upwork', 'Fiverr'];

const PLAT_STYLE: Record<Platform, { bg: string; color: string }> = {
  none:    { bg: '#F1EFE8', color: '#5F5E5A' },
  HubSpot: { bg: '#FAECE7', color: '#712B13' },
  Upwork:  { bg: '#EAF3DE', color: '#27500A' },
  Fiverr:  { bg: '#EEEDFE', color: '#3C3489' },
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  customer: { bg: '#EAF3DE', color: '#27500A', label: 'Customer' },
  lead:     { bg: '#E6F1FB', color: '#0C447C', label: 'Lead' },
  inactive: { bg: '#F1EFE8', color: '#444441', label: 'Inactive' },
};

const STATUS_ORDER = ['customer', 'lead', 'inactive'];
const STATUS_LABELS: Record<string, string> = {
  customer: 'Customers',
  lead: 'Leads',
  inactive: 'Past / inactive',
};

const WEEK_KEYS = ['w3', 'w2', 'w1', 'w0'] as const; // oldest → newest
const AVATAR_COLORS = ['#B5D4F4','#9FE1CB','#CECBF6','#F5C4B3','#C0DD97','#FAC775','#F4C0D1'];
const SYM: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

type DateRange = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_4_weeks';
const DATE_RANGE_LABELS: Record<DateRange, string> = {
  this_week:    'This week',
  last_week:    'Last week',
  this_month:   'This month',
  last_month:   'Last month',
  last_4_weeks: 'Last 4 weeks',
};

type PayMode = 'none' | 'subscription' | 'hourly' | 'percentage' | 'fixed';
interface PaySlot { mode: PayMode; label: string; amount: number; rate: number; pct: number; pval: number; }
const DEFAULT_SLOT: PaySlot = { mode: 'none', label: '', amount: 0, rate: 0, pct: 0, pval: 0 };
const PAY_MODE_LABELS: Record<PayMode, string> = {
  none: '— select type', subscription: 'Subscription', hourly: 'Hourly',
  percentage: '% of Value', fixed: 'Fixed Fee',
};

// ─── Utils ───────────────────────────────────────────────────────────────────

function ls(k: string, v?: string): string | null {
  if (typeof window === 'undefined') return null;
  if (v === undefined) return localStorage.getItem(k);
  localStorage.setItem(k, v);
  return null;
}

function lsj<T>(k: string, v?: T): T {
  if (typeof window === 'undefined') return {} as T;
  if (v === undefined) {
    try { return JSON.parse(localStorage.getItem(k) || '{}') as T; } catch { return {} as T; }
  }
  localStorage.setItem(k, JSON.stringify(v));
  return v;
}

function avatarBg(id: string) { return AVATAR_COLORS[parseInt(id.slice(-2), 10) % AVATAR_COLORS.length]; }
function avatarFg(hex: string) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#1a1a1a' : '#f5f5f5';
}
function initials(n: string) { return n.split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase(); }

function matchContact(c: Contact, projectName: string): boolean {
  const pn = projectName.toLowerCase();
  const fn = c.firstName.toLowerCase();
  const ln = c.lastName.toLowerCase();
  const co = c.company.toLowerCase().split(' ')[0];
  return (
    (fn.length > 2 && pn.includes(fn)) ||
    (ln.length > 2 && pn.includes(ln)) ||
    (co.length > 3 && co !== '—' && pn.includes(co))
  );
}

function weekLabels(): string[] {
  return [3, 2, 1, 0].map(i => {
    const now = new Date();
    now.setDate(now.getDate() - i * 7);
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `${fmt(start)} – ${fmt(end)}`;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClientsView({
  initialContacts,
  hubspotConnected,
}: {
  initialContacts: Contact[];
  hubspotConnected: boolean;
}) {
  const [contacts] = useState<Contact[]>(initialContacts);
  // Local status overrides (so promoting takes effect immediately without waiting for HubSpot cache)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Contact['status']>>({});
  const [promoting, setPromoting] = useState<string | null>(null); // contact id being promoted
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [togglHours, setTogglHours] = useState<Record<string, number>>({});
  const [togglClientIds, setTogglClientIds] = useState<Record<string, number>>({}); // contactId → toggl client id
  const [togglSynced, setTogglSynced] = useState(false);
  const [togglStatus, setTogglStatus] = useState('Click "Sync now" to load Toggl hours');
  const [dateRange, setDateRange] = useState<DateRange>('this_week');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [tick, setTick] = useState(0); // forces re-read of localStorage

  // Modal
  const [modalId, setModalId] = useState<string | null>(null);
  const [weekInputs, setWeekInputs] = useState<Record<string, number>>({});
  const [payA, setPayA] = useState<PaySlot>(DEFAULT_SLOT);
  const [payB, setPayB] = useState<PaySlot>(DEFAULT_SLOT);
  const [currency, setCurrency] = useState('USD');
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Add Customer modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', email: '', company: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [localContacts, setLocalContacts] = useState<Contact[]>([]);

  const labels = weekLabels();
  const allContacts = [...contacts, ...localContacts];
  const modalContact = modalId ? allContacts.find(c => c.id === modalId) ?? null : null;

  // ── Toggl sync ──────────────────────────────────────────────────────────────

  const syncToggl = useCallback(async (range: DateRange = dateRange) => {
    setTogglStatus('Syncing with Toggl...');
    try {
      const res = await fetch(`/api/toggl?action=sync&range=${range}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const projects: TogglProject[] = data.projects || [];
      const togglClients: TogglProject[] = data.clients || [];
      const clientGroups: { clientId: number; seconds: number }[] = data.clientGroups || [];
      const hours: Record<string, number> = {};
      const clientIds: Record<string, number> = {};

      // Match contacts to Toggl clients by name
      allContacts.forEach(c => {
        const match = togglClients.find(tc => matchContact(c, tc.name));
        if (match) clientIds[c.id] = match.id;
      });

      // For contacts with a matched Toggl client, use client-grouped hours (more accurate)
      allContacts.forEach(c => {
        const cid = clientIds[c.id];
        if (cid) {
          const g = clientGroups.find(g => g.clientId === cid);
          if (g) hours[c.id] = g.seconds / 3600;
        }
      });

      // Fallback: project name matching for contacts without a Toggl client
      (data.weekGroups as { projectId: number; seconds: number }[]).forEach(g => {
        const proj = projects.find(p => p.id === g.projectId);
        if (!proj) return;
        allContacts.forEach(c => {
          if (!clientIds[c.id] && matchContact(c, proj.name)) {
            hours[c.id] = (hours[c.id] || 0) + g.seconds / 3600;
          }
        });
      });

      setTogglHours(hours);
      setTogglClientIds(clientIds);
      setTogglSynced(true);
      setTogglStatus(`Toggl synced — ${data.email} — ${DATE_RANGE_LABELS[range]} — ${new Date().toLocaleTimeString()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error';
      setTogglStatus(`Could not connect to Toggl — ${msg}`);
    }
  }, [allContacts, dateRange]);

  // ── Toast ────────────────────────────────────────────────────────────────────

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Promote to Customer ──────────────────────────────────────────────────────

  async function promoteToCustomer(c: Contact) {
    setPromoting(c.id);
    try {
      // 1. Update HubSpot lifecyclestage
      const hsRes = await fetch(`/api/hubspot/contacts/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecyclestage: 'customer' }),
      });
      if (!hsRes.ok) throw new Error('HubSpot update failed');

      // 2. Create Toggl project
      const projectName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name;
      const tgRes = await fetch('/api/toggl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName }),
      });
      const tgData = await tgRes.json();
      if (tgData.error) throw new Error(tgData.error);

      // 3. Update local status immediately
      setStatusOverrides(prev => ({ ...prev, [c.id]: 'customer' }));

      const existed = tgData.existed ? ' (Toggl project already existed)' : '';
      showToast(`${c.name} promoted to Customer — Toggl project created${existed}`, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      showToast(`Error: ${msg}`, false);
    } finally {
      setPromoting(null);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getHrs(id: string) {
    const synced = togglHours[id] ?? 0;
    return synced > 0 ? synced : (parseFloat(ls('hrs_' + id) || '0') || 0);
  }

  function getPlatform(id: string): Platform {
    return (ls('plat_' + id) as Platform) || 'none';
  }

  function isSub(id: string) {
    const a = lsj<Partial<PaySlot>>('payA_' + id);
    const b = lsj<Partial<PaySlot>>('payB_' + id);
    return a.mode === 'subscription' || b.mode === 'subscription' || !!(lsj<{ v?: boolean }>('sub_' + id)?.v);
  }

  // ── Filtered rows ───────────────────────────────────────────────────────────

  function effectiveStatus(c: Contact): Contact['status'] {
    return statusOverrides[c.id] ?? c.status;
  }

  const filtered = allContacts
    .filter(c => {
      const status = effectiveStatus(c);
      const matchF =
        filter === 'all' ||
        status === filter ||
        (filter === 'subscription' && isSub(c.id));
      const s = search.toLowerCase();
      const matchS = !s ||
        c.name.toLowerCase().includes(s) ||
        c.company.toLowerCase().includes(s) ||
        c.email.toLowerCase().includes(s);
      return matchF && matchS;
    })
    .sort((a, b) => STATUS_ORDER.indexOf(effectiveStatus(a)) - STATUS_ORDER.indexOf(effectiveStatus(b)));

  // ── Modal ───────────────────────────────────────────────────────────────────

  async function openModal(id: string) {
    const c = allContacts.find(x => x.id === id);
    if (!c) return;
    setModalId(id);
    setCurrency(ls('cur_' + id) || 'USD');
    const stored = lsj<Record<string, number>>('wk_' + id);
    setWeekInputs(stored);
    // Load payment slots; migrate legacy rate if payA has no mode yet
    const storedA = lsj<Partial<PaySlot>>('payA_' + id);
    const legacyRate = parseFloat(ls('rate_' + id) || '0') || 0;
    const slotA: PaySlot = { ...DEFAULT_SLOT, ...storedA };
    if (slotA.mode === 'none' && legacyRate > 0) { slotA.mode = 'hourly'; slotA.rate = legacyRate; }
    setPayA(slotA);
    setPayB({ ...DEFAULT_SLOT, ...lsj<Partial<PaySlot>>('payB_' + id) });

    if (togglSynced) {
      setWeeklyLoading(true);
      try {
        const cid = togglClientIds[id];
        const params = cid
          ? `clientId=${cid}`
          : `firstName=${encodeURIComponent(c.firstName)}&company=${encodeURIComponent(c.company)}`;
        const res = await fetch(`/api/toggl?action=weekly&${params}`);
        const data = await res.json();
        if (data.hoursByWeek) {
          setWeekInputs(prev => {
            const merged = { ...prev };
            Object.entries(data.hoursByWeek as Record<string, number>).forEach(([k, v]) => {
              if (v > 0) merged[k] = v;
            });
            return merged;
          });
        }
      } catch { /* ignore */ }
      setWeeklyLoading(false);
    }
  }

  function saveModal() {
    if (!modalId) return;
    lsj('wk_' + modalId, weekInputs);
    lsj('payA_' + modalId, payA);
    lsj('payB_' + modalId, payB);
    ls('cur_' + modalId, currency);
    ls('hrs_' + modalId, String(weekInputs['w0'] || 0));
    setTick(t => t + 1);
  }

  function closeModal() { setModalId(null); setWeekInputs({}); }

  // ── Add Customer ─────────────────────────────────────────────────────────────

  async function addCustomer() {
    const { firstName, lastName, email, company } = addForm;
    if (!firstName && !lastName) return;
    setAddLoading(true);
    try {
      // 1. Create HubSpot contact as customer
      const hsRes = await fetch('/api/hubspot/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, company }),
      });
      const hsData = await hsRes.json();
      if (!hsRes.ok) throw new Error(hsData.message || hsData.error || 'HubSpot error');

      const newId: string = hsData.contact?.id || String(Date.now());
      const name = [firstName, lastName].filter(Boolean).join(' ');

      // 2. Create Toggl project
      const tgRes = await fetch('/api/toggl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const tgData = await tgRes.json();
      if (tgData.error) throw new Error(tgData.error);

      // 3. Add to local state
      const newContact: Contact = {
        id: newId,
        name,
        firstName,
        lastName,
        company: company || '—',
        email,
        status: 'customer',
        added: new Date().toISOString().split('T')[0],
      };
      setLocalContacts(prev => [newContact, ...prev]);
      setAddOpen(false);
      setAddForm({ firstName: '', lastName: '', email: '', company: '' });

      const existed = tgData.existed ? ' (Toggl project already existed)' : '';
      showToast(`${name} added as Customer — Toggl project created${existed}`, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      showToast(`Error: ${msg}`, false);
    } finally {
      setAddLoading(false);
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  function slotAmount(slot: PaySlot, hrs: number): number {
    switch (slot.mode) {
      case 'subscription': return slot.amount;
      case 'hourly':       return slot.rate * hrs;
      case 'percentage':   return (slot.pct / 100) * slot.pval;
      case 'fixed':        return slot.amount;
      default:             return 0;
    }
  }

  const totalWeekHrs = WEEK_KEYS.reduce((s, k) => s + (weekInputs[k] || 0), 0);
  const maxHrs = Math.max(...WEEK_KEYS.map(k => weekInputs[k] || 0), 1);
  const totalInvoice = slotAmount(payA, totalWeekHrs) + slotAmount(payB, totalWeekHrs);
  const sym = SYM[currency] || '$';

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6" key={tick}>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <span>{toast.ok ? '✓' : '✕'}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-medium text-gray-900">Clients &amp; leads</h1>
        <div className="flex items-center gap-4 text-xs font-medium">
          <a href="https://track.toggl.com" target="_blank" rel="noopener"
            className="flex items-center gap-1.5" style={{ color: '#9B2EAD' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: '#E57CD8' }} />
            Toggl
          </a>
          <a href="https://app-eu1.hubspot.com/contacts/146532818/contacts/list/all/all/"
            target="_blank" rel="noopener" className="flex items-center gap-1.5 text-blue-600">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            HubSpot
          </a>
          <button
            onClick={() => setAddOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 cursor-pointer transition-colors">
            + New Customer
          </button>
        </div>
      </div>

      {/* Toggl banner */}
      <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-2.5 mb-4 text-xs flex-wrap">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#E57CD8' }} />
        <span className="flex-1 text-gray-500">{togglStatus}</span>
        <select
          value={dateRange}
          onChange={e => {
            const r = e.target.value as DateRange;
            setDateRange(r);
            syncToggl(r);
          }}
          className="px-2 py-1 rounded-full border text-xs font-medium cursor-pointer outline-none bg-white"
          style={{ borderColor: '#E57CD8', color: '#9B2EAD' }}>
          {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(r => (
            <option key={r} value={r}>{DATE_RANGE_LABELS[r]}</option>
          ))}
        </select>
        <button onClick={() => syncToggl(dateRange)}
          className="px-3 py-1 rounded-full border text-xs font-medium cursor-pointer"
          style={{ borderColor: '#E57CD8', color: '#9B2EAD' }}>
          ↻ Sync now
        </button>
      </div>

      {/* HubSpot setup notice */}
      {!hubspotConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 mb-4 text-xs text-amber-700">
          HubSpot not connected — add{' '}
          <code className="font-mono bg-amber-100 px-1 rounded">HUBSPOT_ACCESS_TOKEN</code>{' '}
          to <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code>.
          Create a Private App in HubSpot with <code className="font-mono bg-amber-100 px-1 rounded">crm.objects.contacts.read</code> scope.
        </div>
      )}

      {/* Metrics */}
      <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        {[
          { label: 'Total contacts', value: allContacts.length },
          { label: 'Customers', value: allContacts.filter(c => effectiveStatus(c) === 'customer').length },
          { label: 'Leads', value: allContacts.filter(c => effectiveStatus(c) === 'lead').length },
          { label: `Toggl hrs (${DATE_RANGE_LABELS[dateRange].toLowerCase()})`, value: allContacts.reduce((s, c) => s + getHrs(c.id), 0).toFixed(1) },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-lg px-3.5 py-3">
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className="text-xl font-medium text-gray-900">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {(['all', 'customer', 'lead', 'subscription'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-full border cursor-pointer transition-colors ${
              filter === f
                ? 'bg-gray-100 text-gray-900 border-gray-300 font-medium'
                : 'text-gray-400 border-gray-200 hover:text-gray-700'
            }`}>
            {f === 'all' ? 'All' : f === 'subscription' ? 'Subscriptions' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
          </button>
        ))}
        <input
          className="px-3 py-1 text-xs rounded-full border border-gray-200 bg-transparent text-gray-900 outline-none w-48"
          placeholder="Search name or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Name', 'Company', 'Status', 'Last Invoice', 'Payment Processor', 'Toggl hrs', 'Toggl client', 'Breakdown', 'Added'].map(h => (
                <th key={h} className="text-left text-gray-400 font-medium uppercase py-2 px-2.5 border-b border-gray-100 whitespace-nowrap"
                  style={{ fontSize: 10, letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const rows: React.ReactNode[] = [];
              let lastStatus = '';
              filtered.forEach(c => {
                const status = effectiveStatus(c);
                if (status !== lastStatus) {
                  rows.push(
                    <tr key={'sep-' + status}>
                      <td colSpan={9} className="bg-gray-50 px-2.5 py-1 text-gray-400 font-medium uppercase"
                        style={{ fontSize: 10, letterSpacing: '0.05em' }}>
                        {STATUS_LABELS[status] || status}
                      </td>
                    </tr>
                  );
                  lastStatus = status;
                }

                const hrs = getHrs(c.id);
                const synced = (togglHours[c.id] ?? 0) > 0;
                const bg = avatarBg(c.id);
                const fg = avatarFg(bg);
                const st = STATUS_STYLE[status];
                const plat = getPlatform(c.id);
                const ps = PLAT_STYLE[plat];
                const isPromoting = promoting === c.id;

                rows.push(
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    {/* Name */}
                    <td className="py-2 px-2.5 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-medium flex-shrink-0"
                          style={{ background: bg, color: fg, fontSize: 10 }}>
                          {initials(c.name)}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-900">{c.name}</div>
                          <div className="text-gray-400" style={{ fontSize: 10 }}>{c.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Company */}
                    <td className="py-2 px-2.5 border-b border-gray-50 text-xs text-gray-500">{c.company}</td>

                    {/* Status */}
                    <td className="py-2 px-2.5 border-b border-gray-50">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: st.bg, color: st.color }}>
                          {isPromoting ? '…' : st.label}
                        </span>
                        {isSub(c.id) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg font-medium"
                            style={{ fontSize: 10, background: '#FAEEDA', color: '#633806' }}>
                            ↻ monthly
                          </span>
                        )}
                        {status === 'lead' && !isPromoting && (
                          <button
                            onClick={() => promoteToCustomer(c)}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs border border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 cursor-pointer transition-colors whitespace-nowrap"
                            style={{ fontSize: 10 }}
                            title="Promote to Customer — updates HubSpot & creates Toggl project">
                            → Customer
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Last Invoice */}
                    <td className="py-2 px-2.5 border-b border-gray-50">
                      {c.lastDeal?.closeDate ? (
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-medium text-gray-900">
                              {c.lastDeal.amount
                                ? `${SYM[c.lastDeal.currency] || c.lastDeal.currency || '$'}${parseFloat(c.lastDeal.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                : '—'}
                            </span>
                            <span className="inline-flex items-center px-1.5 rounded-full font-medium"
                              style={{
                                fontSize: 10,
                                background: c.lastDeal.paid ? '#EAF3DE' : '#FAEEDA',
                                color: c.lastDeal.paid ? '#27500A' : '#633806',
                              }}>
                              {c.lastDeal.paid ? 'Paid' : 'Due'}
                            </span>
                          </div>
                          <div className="text-gray-400" style={{ fontSize: 10 }}>{c.lastDeal.closeDate}</div>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Platform */}
                    <td className="py-2 px-2.5 border-b border-gray-50">
                      <select
                        className="rounded-full px-2 py-0.5 border-0 cursor-pointer font-medium"
                        style={{ background: ps.bg, color: ps.color, fontSize: 11 }}
                        value={plat}
                        onChange={e => { ls('plat_' + c.id, e.target.value); setTick(t => t + 1); }}>
                        {PLATFORMS.map(p => (
                          <option key={p} value={p}>{p === 'none' ? '— platform' : p}</option>
                        ))}
                      </select>
                    </td>

                    {/* Hours */}
                    <td className="py-2 px-2.5 border-b border-gray-50">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: synced ? '#F9E8FD' : '#F1EFE8',
                          color: synced ? '#9B2EAD' : '#5F5E5A',
                        }}>
                        {synced && <span style={{ fontSize: 6 }}>●</span>}
                        {hrs.toFixed(1)} hrs{synced ? ' (Toggl)' : ''}
                      </span>
                      {!synced && (
                        <input
                          type="number" min="0" step="0.5"
                          defaultValue={hrs || ''}
                          placeholder="0"
                          className="w-11 ml-1.5 text-center text-xs px-1 py-0.5 border border-gray-200 rounded bg-transparent text-gray-900 outline-none"
                          onChange={e => { ls('hrs_' + c.id, e.target.value); setTick(t => t + 1); }}
                        />
                      )}
                    </td>

                    {/* Toggl client */}
                    <td className="py-2 px-2.5 border-b border-gray-50">
                      {togglClientIds[c.id] ? (
                        <a
                          href={`https://track.toggl.com/clients/${togglClientIds[c.id]}`}
                          target="_blank"
                          rel="noopener"
                          title="Connected to Toggl client"
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full"
                          style={{ background: '#F9E8FD', color: '#9B2EAD' }}>
                          ✓
                        </a>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-300 text-xs"
                          title="No matching Toggl client">
                          —
                        </span>
                      )}
                    </td>

                    {/* Weekly */}
                    <td className="py-2 px-2.5 border-b border-gray-50">
                      <button onClick={() => openModal(c.id)}
                        className="px-2.5 py-1 text-xs border border-gray-200 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                        Weekly ↗
                      </button>
                    </td>

                    {/* Added */}
                    <td className="py-2 px-2.5 border-b border-gray-50 text-gray-400 whitespace-nowrap"
                      style={{ fontSize: 10 }}>
                      {c.added}
                    </td>
                  </tr>
                );
              });
              if (filtered.length === 0) rows.push(
                <tr key="empty">
                  <td colSpan={9} className="py-12 text-center text-sm text-gray-400">
                    No contacts found
                  </td>
                </tr>
              );
              return rows;
            })()}
          </tbody>
        </table>
      </div>

      {/* Add Customer Modal */}
      {addOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setAddOpen(false); }}>
          <div className="bg-white rounded-xl border border-gray-100 shadow-xl p-5 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-medium text-gray-900">New Customer</div>
              <button onClick={() => setAddOpen(false)} className="text-gray-300 hover:text-gray-500 text-base leading-none cursor-pointer">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">First name *</label>
                <input
                  type="text"
                  value={addForm.firstName}
                  onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane"
                  className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Last name</label>
                <input
                  type="text"
                  value={addForm.lastName}
                  onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))}
                  placeholder="Smith"
                  className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none"
                />
              </div>
            </div>
            <div className="mb-2">
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={addForm.email}
                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">Company</label>
              <input
                type="text"
                value={addForm.company}
                onChange={e => setAddForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Acme Inc."
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none"
              />
            </div>
            <div className="text-xs text-gray-400 mb-3">
              Creates contact in HubSpot as <strong>Customer</strong> and creates a matching Toggl project.
            </div>
            <button
              onClick={addCustomer}
              disabled={addLoading || (!addForm.firstName && !addForm.lastName)}
              className="w-full py-2 text-xs font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              {addLoading ? 'Creating…' : 'Create Customer'}
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalContact && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-white rounded-xl border border-gray-100 shadow-xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-sm font-medium text-gray-900">{modalContact.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {modalContact.company !== '—' ? modalContact.company : modalContact.email}
                </div>
              </div>
              <button onClick={closeModal} className="text-gray-300 hover:text-gray-500 text-base leading-none cursor-pointer">✕</button>
            </div>

            {/* Last HubSpot Deal */}
            {modalContact.lastDeal?.closeDate && (
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-4 border border-gray-100">
                <div className="text-xs text-gray-400 font-medium mb-1.5">Last HubSpot Deal</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {modalContact.lastDeal.amount
                        ? `${SYM[modalContact.lastDeal.currency] || modalContact.lastDeal.currency || '$'}${parseFloat(modalContact.lastDeal.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : 'No amount set'}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{modalContact.lastDeal.closeDate}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: modalContact.lastDeal.paid ? '#EAF3DE' : '#FAEEDA',
                      color: modalContact.lastDeal.paid ? '#27500A' : '#633806',
                    }}>
                    {modalContact.lastDeal.paid ? '✓ Paid' : '⚠ Unpaid'}
                  </span>
                </div>
              </div>
            )}

            {/* Currency */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-gray-700">Payment setup</div>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none">
                <option>USD</option><option>EUR</option><option>GBP</option>
              </select>
            </div>

            {/* Payment Slot A */}
            {([['A', payA, setPayA], ['B', payB, setPayB]] as const).map(([letter, slot, setSlot]) => (
              <div key={letter} className="border border-gray-100 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-500 w-20">Payment {letter}</span>
                  <input
                    type="text"
                    value={slot.label}
                    onChange={e => setSlot(s => ({ ...s, label: e.target.value }))}
                    placeholder={letter === 'A' ? 'e.g. Retainer' : 'e.g. Dev work'}
                    className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none"
                  />
                  <select
                    value={slot.mode}
                    onChange={e => setSlot(s => ({ ...s, mode: e.target.value as PayMode }))}
                    className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none">
                    {(Object.keys(PAY_MODE_LABELS) as PayMode[]).map(m => (
                      <option key={m} value={m}>{PAY_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
                {slot.mode === 'subscription' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-20">Amount</label>
                    <div className="flex-1 flex items-center gap-1">
                      <span className="text-xs text-gray-400">{sym}</span>
                      <input type="number" min="0" value={slot.amount || ''}
                        onChange={e => setSlot(s => ({ ...s, amount: parseFloat(e.target.value) || 0 }))}
                        placeholder="0" className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none" />
                      <span className="text-xs text-gray-400">/ mo</span>
                    </div>
                  </div>
                )}
                {slot.mode === 'hourly' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-20">Rate / hr</label>
                    <div className="flex-1 flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">{sym}</span>
                      <input type="number" min="0" value={slot.rate || ''}
                        onChange={e => setSlot(s => ({ ...s, rate: parseFloat(e.target.value) || 0 }))}
                        placeholder="0" className="w-20 text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none" />
                      <span className="text-xs text-gray-400">× {totalWeekHrs.toFixed(1)} hrs =</span>
                      <span className="text-xs font-medium text-gray-700">{sym}{Math.round(slot.rate * totalWeekHrs).toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {slot.mode === 'percentage' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 w-20">% charge</label>
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" max="100" value={slot.pct || ''}
                          onChange={e => setSlot(s => ({ ...s, pct: parseFloat(e.target.value) || 0 }))}
                          placeholder="0" className="w-16 text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none" />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 w-20">Project value</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">{sym}</span>
                        <input type="number" min="0" value={slot.pval || ''}
                          onChange={e => setSlot(s => ({ ...s, pval: parseFloat(e.target.value) || 0 }))}
                          placeholder="0" className="w-24 text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none" />
                        <span className="text-xs text-gray-400">= {sym}{Math.round((slot.pct / 100) * slot.pval).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
                {slot.mode === 'fixed' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-20">Fixed fee</label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">{sym}</span>
                      <input type="number" min="0" value={slot.amount || ''}
                        onChange={e => setSlot(s => ({ ...s, amount: parseFloat(e.target.value) || 0 }))}
                        placeholder="0" className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none" />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Week inputs */}
            <div className="text-xs text-gray-400 font-medium mb-2">
              Weekly hours{weeklyLoading ? ' — loading from Toggl…' : ' — edit or pulled from Toggl'}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {WEEK_KEYS.map((key, i) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{labels[i]}</label>
                  <input
                    type="number" min="0" step="0.5"
                    value={weekInputs[key] || ''}
                    placeholder="0 hrs"
                    onChange={e => setWeekInputs(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-transparent text-gray-900 outline-none"
                  />
                </div>
              ))}
            </div>

            <button onClick={saveModal}
              className="w-full py-2 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 cursor-pointer mb-4 transition-colors">
              Save
            </button>

            {/* Bars */}
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-400 font-medium mb-2">Hours summary</div>
              {WEEK_KEYS.map((key, i) => {
                const val = weekInputs[key] || 0;
                return (
                  <div key={key} className="grid items-center gap-2 mb-1.5"
                    style={{ gridTemplateColumns: '90px 1fr 44px' }}>
                    <span className="text-xs text-gray-400 truncate">{labels[i].split('–')[0].trim()}</span>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.round(val / maxHrs * 100)}%`, background: '#E57CD8' }} />
                    </div>
                    <span className="text-xs font-medium text-right text-gray-700">{val.toFixed(1)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between text-xs border-t border-gray-100 pt-2 mt-1">
                <span className="text-gray-900">Total</span>
                <span className="font-medium text-gray-900">{totalWeekHrs.toFixed(1)} hrs</span>
              </div>
              {totalInvoice > 0 && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-gray-400">Est. invoice</span>
                  <span className="font-medium" style={{ color: '#27500A' }}>
                    {sym}{Math.round(totalInvoice).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <a href="https://track.toggl.com/reports/summary" target="_blank" rel="noopener"
              className="inline-flex items-center gap-1.5 text-xs font-medium mt-3"
              style={{ color: '#9B2EAD' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#E57CD8' }} />
              View in Toggl reports
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
