"use client";

import { useState } from "react";
import { Link2, Link2Off, Eye, EyeOff, ToggleLeft, ToggleRight, Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";

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

  const connectedByHubspotId = new Map(
    clients.filter(c => c.hubspot_contact_id).map(c => [c.hubspot_contact_id!, c])
  );

  function toggleExpand(contactId: string) {
    setExpandedId(prev => prev === contactId ? null : contactId);
    setError(prev => ({ ...prev, [contactId]: '' }));
  }

  function setForm(contactId: string, patch: Partial<ConnectFormState>) {
    setForms(prev => ({ ...prev, [contactId]: { email: '', password: '', ...prev[contactId], ...patch } }));
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
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-sm text-gray-500">
          Connect a PriceLabs login to each client so the daily sync can pull their booking reports.
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
                      <span className="text-gray-400 font-normal hidden sm:inline">· {linked.email}</span>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
