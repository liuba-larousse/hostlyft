'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  name: string;
  email: string;
  image?: string | null;
}

export default function OnboardingForm({ name, email, image }: Props) {
  const router = useRouter();
  const parts = name.split(' ');
  const [firstName, setFirstName] = useState(parts[0] ?? '');
  const [lastName, setLastName] = useState(parts.slice(1).join(' ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter both first and last name.');
      return;
    }
    setSaving(true);
    setError('');
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-400 mb-5">
            {image ? (
              <img src={image} alt={name} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <span className="text-gray-900 font-bold text-3xl">H</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Hostlyft!</h1>
          <p className="text-gray-500 mt-2 text-base">Tell us your name to get started.</p>
        </div>

        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-400 text-center mb-6">Signed in as <span className="font-medium text-gray-600">{email}</span></p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                First name
              </label>
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Jane"
                autoFocus
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-yellow-400 text-gray-900 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Last name
              </label>
              <input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-yellow-400 text-gray-900 placeholder-gray-400"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-60 mt-2"
            >
              {saving ? 'Setting up…' : 'Join the team'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
