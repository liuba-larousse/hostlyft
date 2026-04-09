import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const FATHOM_BASE = 'https://api.fathom.ai/external/v1';

interface FathomMeeting {
  recording_id: string;
  title?: string;
  meeting_title?: string;
  created_at: string;
  default_summary?: string;
  calendar_invitees?: { name?: string; email?: string }[];
}

async function fetchRecentMeetings(since: Date): Promise<FathomMeeting[]> {
  const token = process.env.FATHOM_API_TOKEN;
  if (!token) return [];

  const params = new URLSearchParams({
    include_summary: 'true',
    created_after: since.toISOString(),
  });

  const res = await fetch(`${FATHOM_BASE}/meetings?${params}`, {
    headers: { 'X-Api-Key': token },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

async function generateLinkedInPost(meeting: FathomMeeting): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const title = meeting.meeting_title || meeting.title || 'Client call';
  const summary = meeting.default_summary || 'No summary available';
  const attendees = (meeting.calendar_invitees ?? [])
    .map(a => a.name || a.email)
    .filter(Boolean)
    .join(', ');

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a LinkedIn content writer for a short-term rental consulting firm called Hostlyft.

Based on this client call summary, write a compelling LinkedIn post that:
- Shares a key insight or lesson from the call (without revealing confidential client details)
- Is professional yet conversational
- Ends with a thought-provoking question or call to action
- Is 150–250 words
- Does NOT use hashtags excessively (max 3 relevant ones at the end)
- Does NOT mention the client's name

Call title: ${title}
${attendees ? `Attendees: ${attendees}` : ''}
Summary:
${summary}

Write only the LinkedIn post text, nothing else.`,
    }],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return runSync();
}

export async function runSync() {
  const supabase = createSupabaseAdmin();

  // Find the most recent call we already processed to avoid duplicates
  const { data: latest } = await supabase
    .from('linkedin_posts')
    .select('call_date')
    .order('call_date', { ascending: false })
    .limit(1)
    .single();

  const since = latest?.call_date
    ? new Date(latest.call_date)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default: last 30 days

  const meetings = await fetchRecentMeetings(since);
  if (!meetings.length) return NextResponse.json({ ok: true, created: 0 });

  // Skip meetings we've already processed
  const { data: existing } = await supabase
    .from('linkedin_posts')
    .select('fathom_recording_id');
  const existingIds = new Set((existing ?? []).map(r => r.fathom_recording_id));

  const newMeetings = meetings.filter(m => !existingIds.has(m.recording_id) && m.default_summary);
  let created = 0;

  for (const meeting of newMeetings) {
    try {
      const postContent = await generateLinkedInPost(meeting);
      if (!postContent) continue;

      const title = meeting.meeting_title || meeting.title || 'Call';
      const attendees = (meeting.calendar_invitees ?? [])
        .map(a => a.name || a.email)
        .filter(Boolean)
        .join(', ');

      await supabase.from('linkedin_posts').insert({
        fathom_recording_id: meeting.recording_id,
        call_title: title,
        call_date: meeting.created_at,
        attendees,
        summary: meeting.default_summary ?? '',
        post_content: postContent,
        status: 'draft',
      });
      created++;
    } catch (err) {
      console.error('[marketing/sync] Failed for', meeting.recording_id, err);
    }
  }

  return NextResponse.json({ ok: true, created });
}
