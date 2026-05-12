"use client";

import { useState, useEffect } from "react";
import { Link2, Link2Off, Eye, EyeOff, ToggleLeft, ToggleRight, Loader2, CheckCircle2, ChevronDown, ChevronUp, Upload, FileSpreadsheet } from "lucide-react";
import { useRef } from "react";
import { clsx } from "clsx";
import OtaListingsEditor from "./OtaListingsEditor";

interface HubSpotContact {
  id: string;
  name: string;
  company: string;
  email: string;
}

interface PriceLabsClient {
  id: string;
  client_name: string;
  email: string;
  active: boolean;
  hubspot_contact_id: string | null;
  connection_type?: string;
  has_api_key?: boolean;
  created_at: string;
}

interface Props {
  contacts: HubSpotContact[];
  initialClients: PriceLabsClient[];
}

interface ConnectFormState {
  email: string;
  password: string;
}

export default function PriceLabsClients({ contacts, initialClients }: Props) {
  const [clients, setClients] = useState<PriceLabsClient[]>(initialClients);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ConnectFormState>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  // RM Portal
  const [rmEmail, setRmEmail] = useState("");
  const [rmPassword, setRmPassword] = useState("");
  const [rmSaving, setRmSaving] = useState(false);
  const [rmSaved, setRmSaved] = useState(false);
  const [rmLoaded, setRmLoaded] = useState(false);
  const [rmExpanded, setRmExpanded] = useState(false);

  // Load RM Portal credentials on mount
  useEffect(() => {
    fetch("/api/pricelabs/rm-portal").then(r => r.json()).then(data => {
      if (data.credentials) { setRmEmail(data.credentials.email); setRmLoaded(true); }
    }).catch(() => {});
  }, []);

  const connectedByHubspotId = new Map(
    clients.filter(c => c.hubspot_contact_id).map(c => [c.hubspot_contact_id!, c])
  );

  function toggleExpand(contactId: string) {
    setExpandedId(prev => prev === contactId ? null : contactId);
    setError(prev => ({ ...prev, [contactId]: '' }));
  }

  function setForm(contactId: string, patch: Partial<ConnectFormState>) {
    setForms(prev => ({
      ...prev,
      [contactId]: { ...(prev[contactId] ?? { email: '', password: '' }), ...patch },
    }));
  }

  async function saveRmPortal() {
    if (!rmEmail || !rmPassword) return;
    setRmSaving(true);
    try {
      await fetch("/api/pricelabs/rm-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: rmEmail, password: rmPassword }),
      });
      setRmSaved(true);
      setRmLoaded(true);
      setRmPassword("");
      setTimeout(() => setRmSaved(false), 3000);
    } catch {}
    setRmSaving(false);
  }

  async function connectViaRmPortal(contact: HubSpotContact) {
    setSaving(contact.id);
    setError(prev => ({ ...prev, [contact.id]: '' }));
    try {
      const res = await fetch('/api/pricelabs/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hubspot_contact_id: contact.id,
          client_name: contact.name,
          connection_type: 'rm_portal',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setClients(prev => [...prev, data]);
      setExpandedId(null);
    } catch (err) {
      setError(prev => ({ ...prev, [contact.id]: String(err) }));
    }
    setSaving(null);
  }

  async function handleConnect(contact: HubSpotContact) {
    const form = forms[contact.id] ?? { email: '', password: '' };
    if (!form.email || !form.password) {
      setError(prev => ({ ...prev, [contact.id]: 'Email and password are required' }));
      return;
    }
    setSaving(contact.id);
    setError(prev => ({ ...prev, [contact.id]: '' }));
    try {
      const res = await fetch('/api/pricelabs/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hubspot_contact_id: contact.id,
          client_name: contact.name,
          email: form.email,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(prev => ({ ...prev, [contact.id]: data.error ?? 'Failed' })); return; }
      setClients(prev => [...prev, data]);
      setExpandedId(null);
      setForms(prev => ({ ...prev, [contact.id]: { email: '', password: '' } }));
    } catch {
      setError(prev => ({ ...prev, [contact.id]: 'Network error' }));
    } finally {
      setSaving(null);
    }
  }

  async function handleDisconnect(client: PriceLabsClient) {
    if (!confirm(`Disconnect PriceLabs from ${client.client_name}? Their booking history will also be deleted.`)) return;
    setDeletingId(client.id);
    try {
      await fetch('/api/pricelabs/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id }),
      });
      setClients(prev => prev.filter(c => c.id !== client.id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(client: PriceLabsClient) {
    setTogglingId(client.id);
    try {
      await fetch('/api/pricelabs/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, active: !client.active }),
      });
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, active: !c.active } : c));
    } finally {
      setTogglingId(null);
    }
  }

  if (!contacts.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
        <p className="text-gray-500 text-sm">No HubSpot clients found. Add clients in the Clients tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* RM Portal Credentials */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setRmExpanded(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <span className="text-red-600 font-bold text-sm">RM</span>
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">RM Portal Credentials</p>
              <p className="text-xs text-gray-400">{rmLoaded ? `Connected: ${rmEmail}` : "Set up shared Revenue Manager login"}</p>
            </div>
          </div>
          {rmExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {rmExpanded && (
          <div className="px-6 pb-5 border-t border-gray-100">
            <p className="text-xs text-gray-500 pt-3 mb-3">
              Unified PriceLabs RM login — used for clients connected via RM Portal (e.g. Cody).
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                placeholder="RM Portal email"
                value={rmEmail}
                onChange={e => setRmEmail(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 bg-white"
              />
              <input
                type="password"
                placeholder={rmLoaded ? "••••••• (saved)" : "RM Portal password"}
                value={rmPassword}
                onChange={e => setRmPassword(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 bg-white"
              />
              <button
                onClick={saveRmPortal}
                disabled={rmSaving || !rmEmail}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-400 hover:bg-yellow-300 text-gray-900 cursor-pointer disabled:opacity-40 shrink-0"
              >
                {rmSaving ? "Saving..." : (rmLoaded && !rmPassword) ? "Saved" : "Save"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Password is encrypted with AES-256 before saving.</p>
          </div>
        )}
      </div>

      {/* Client List */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-sm text-gray-500">
          Connect a PriceLabs login to each client, or use the RM Portal for shared accounts.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {contacts.map(contact => {
          const linked = connectedByHubspotId.get(contact.id);
          const isExpanded = expandedId === contact.id;
          const form = forms[contact.id] ?? { email: '', password: '' };
          const isSaving = saving === contact.id;
          const isDeleting = deletingId === linked?.id;
          const isToggling = togglingId === linked?.id;

          return (
            <div key={contact.id}>
              <div className="px-6 py-4 flex items-center gap-4">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <span className="text-gray-600 font-semibold text-sm">
                    {contact.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Name + company */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{contact.name}</p>
                  <p className="text-gray-400 text-xs truncate">{contact.company || contact.email}</p>
                </div>

                {/* Status + actions */}
                {linked ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                      <CheckCircle2 size={13} strokeWidth={2} />
                      <span className="hidden sm:inline">Connected</span>
                      <span className="text-gray-400 font-normal hidden sm:inline">
                        · {linked.connection_type === 'rm_portal' ? 'RM Portal' : linked.email}
                      </span>
                    </div>

                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggle(linked)}
                      disabled={isToggling}
                      title={linked.active ? 'Disable sync' : 'Enable sync'}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {isToggling
                        ? <Loader2 size={18} className="animate-spin" strokeWidth={2} />
                        : linked.active
                          ? <ToggleRight size={20} className="text-emerald-500" strokeWidth={1.8} />
                          : <ToggleLeft size={20} strokeWidth={1.8} />
                      }
                    </button>

                    {/* Disconnect */}
                    <button
                      onClick={() => handleDisconnect(linked)}
                      disabled={isDeleting}
                      title="Disconnect"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      {isDeleting
                        ? <Loader2 size={12} className="animate-spin" strokeWidth={2} />
                        : <Link2Off size={12} strokeWidth={2} />
                      }
                      <span className="hidden sm:inline">Disconnect</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleExpand(contact.id)}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0",
                      isExpanded
                        ? "bg-gray-100 text-gray-600"
                        : "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
                    )}
                  >
                    <Link2 size={12} strokeWidth={2} />
                    Connect
                    {isExpanded ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
                  </button>
                )}
              </div>

              {/* OTA listings for connected clients */}
              {linked && (
                <div className="px-6 pb-4">
                  <OtaListingsEditor clientId={linked.id} clientName={contact.name} />
                </div>
              )}

              {/* API Key for connected clients */}
              {linked && (
                <ApiKeyField clientId={linked.id} hasApiKey={linked.has_api_key ?? false} />
              )}

              {/* Inline connect form */}
              {!linked && isExpanded && (
                <div className="px-6 pb-5 bg-gray-50 border-t border-gray-100">
                  <p className="text-xs text-gray-500 pt-4 mb-3">
                    Enter <strong>{contact.name}&apos;s</strong> PriceLabs login credentials:
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      placeholder="PriceLabs email"
                      value={form.email}
                      onChange={e => setForm(contact.id, { email: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 bg-white transition-colors"
                    />
                    <div className="relative flex-1">
                      <input
                        type={showPassword[contact.id] ? 'text' : 'password'}
                        placeholder="PriceLabs password"
                        value={form.password}
                        onChange={e => setForm(contact.id, { password: e.target.value })}
                        className="w-full px-3 py-2 pr-9 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 bg-white transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(p => ({ ...p, [contact.id]: !p[contact.id] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword[contact.id] ? <EyeOff size={13} strokeWidth={1.8} /> : <Eye size={13} strokeWidth={1.8} />}
                      </button>
                    </div>
                    <button
                      onClick={() => handleConnect(contact)}
                      disabled={isSaving}
                      className={clsx(
                        "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0",
                        isSaving ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
                      )}
                    >
                      {isSaving && <Loader2 size={12} className="animate-spin" strokeWidth={2} />}
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {error[contact.id] && (
                    <p className="text-red-500 text-xs mt-2">{error[contact.id]}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">Password is encrypted with AES-256 before saving.</p>

                  {/* OR connect via RM Portal */}
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-400">or</span>
                      <button
                        onClick={() => connectViaRmPortal(contact)}
                        disabled={isSaving || !rmLoaded}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer transition-colors disabled:opacity-40"
                      >
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                        Connect via RM Portal
                      </button>
                      {rmLoaded
                        ? <span className="text-xs text-gray-400">Uses shared RM credentials ({rmEmail})</span>
                        : <span className="text-xs text-amber-600">Set up RM Portal credentials above first</span>
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>

    {/* Listing → Building Group Mapping */}
    <ListingMappingUpload />

    </div>
  );
}

function ListingMappingUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; groups: Record<string, number> } | null>(null);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const csvText = await file.text();
      const res = await fetch('/api/pricelabs/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, clientName: 'Marcus' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Import failed');
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
    }
    setUploading(false);
  };

  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-gray-900 mb-1">Listing → Building Group Mapping</h3>
      <p className="text-xs text-gray-500 mb-4">
        Upload the PriceLabs "Manage Listings" CSV export to map listings to their building groups.
        Combined Listings are automatically resolved by tag. Used for bulk overrides.
      </p>
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors",
              uploading ? "bg-gray-100 text-gray-400" : "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
            )}
          >
            {uploading ? (
              <><Loader2 size={14} className="animate-spin" /> Importing...</>
            ) : (
              <><Upload size={14} /> Upload CSV</>
            )}
          </button>
          {result && (
            <span className="text-sm text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> {result.imported} listings imported
            </span>
          )}
          {error && (
            <span className="text-sm text-red-500">{error}</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
        />

        {result && result.groups && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(result.groups).sort(([,a],[,b]) => b - a).map(([group, count]) => (
              <div key={group} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs">
                <FileSpreadsheet size={12} className="text-gray-400 shrink-0" />
                <span className="font-medium text-gray-900 truncate">{group}</span>
                <span className="text-gray-400 ml-auto shrink-0">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeyField({ clientId, hasApiKey }: { clientId: string; hasApiKey: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(hasApiKey);
  const [show, setShow] = useState(false);

  const save = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/pricelabs/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, api_key: apiKey.trim() }),
      });
      setSaved(true);
      setApiKey("");
    } catch {}
    setSaving(false);
  };

  const remove = async () => {
    setSaving(true);
    try {
      await fetch("/api/pricelabs/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, api_key: null }),
      });
      setSaved(false);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="px-6 pb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">PriceLabs API Key</span>
        {saved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            placeholder={saved ? "••••••••••••" : "Paste API key"}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="w-full px-3 py-2 pr-9 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 bg-white transition-colors"
          />
          <button
            type="button"
            onClick={() => setShow(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show ? <EyeOff size={13} strokeWidth={1.8} /> : <Eye size={13} strokeWidth={1.8} />}
          </button>
        </div>
        <button
          onClick={save}
          disabled={saving || !apiKey.trim()}
          className={clsx(
            "px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0",
            saving || !apiKey.trim() ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
          )}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && (
          <button
            onClick={remove}
            disabled={saving}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1.5">Encrypted with AES-256. Used for PriceLabs API access.</p>
    </div>
  );
}
