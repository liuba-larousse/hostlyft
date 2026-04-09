import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

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

// Returns both the LinkedIn post and a DALL-E image prompt
async function generateContent(meeting: FathomMeeting): Promise<{ post: string; imagePrompt: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const title = meeting.meeting_title || meeting.title || 'Client call';
  const summary = meeting.default_summary || 'No summary available';
  const attendees = (meeting.calendar_invitees ?? [])
    .map(a => a.name || a.email)
    .filter(Boolean)
    .join(', ');

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are writing a LinkedIn post as a woman who runs a short-term rental consulting firm called Hostlyft. She is knowledgeable, direct, and warm — she shares what she knows without lecturing.

Based on this client call summary, write a LinkedIn post following these rules:

Voice and tone:
- Warm, first-person female voice
- Direct and confident without being preachy or condescending
- Treat the reader as a peer, not a student

Structure:
- Open with a single captivating sentence that makes someone stop scrolling — no clickbait, no "Most people don't know..." hooks, just a real and specific observation
- Write the body as flowing paragraphs, not bullet points or lists
- Keep whitespace minimal — no double line breaks between every sentence
- End with a genuine question or reflection that invites conversation

Style rules:
- No em dashes
- No paired contrasts ("it's X, not Y" constructions)
- No filler phrases ("In today's world", "At the end of the day", "Game-changer")
- No excessive hashtags — max 3 at the very end if relevant
- 150–220 words total
- Do not reveal the client's name or confidential details
- Focus the insight on pricing strategy, revenue management, or occupancy — draw the post around whichever of these the call touched on most

Call title: ${title}
${attendees ? `Attendees: ${attendees}` : ''}
Summary:
${summary}

After the post, on a new line write exactly: [IMAGE_PROMPT]
Then write a DALL-E image prompt for a clean, professional LinkedIn header image that visually represents the theme of the post. The image should feel modern and editorial — think high-end travel photography or architectural photography. No text, no people's faces, no logos. Warm and aspirational. 1–2 sentences max.`,
    }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  const parts = raw.split('[IMAGE_PROMPT]');
  const post = parts[0].trim();
  const imagePrompt = parts[1]?.trim() ?? `A beautifully lit luxury short-term rental interior, warm tones, editorial photography style, no people.`;

  return { post, imagePrompt };
}

async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024', // landscape — ideal for LinkedIn
      quality: 'standard',
    }),
  });

  if (!res.ok) {
    console.error('[marketing/sync] DALL-E error', await res.text());
    return null;
  }

  const data = await res.json();
  return data.data?.[0]?.url ?? null;
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return runSync();
}

export async function runSync() {
  if (!process.env.FATHOM_API_TOKEN) {
    return NextResponse.json({ error: 'FATHOM_API_TOKEN is not set in environment variables' }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set in environment variables' }, { status: 500 });
  }

  const supabase = createSupabaseAdmin();

  const { data: latest } = await supabase
    .from('linkedin_posts')
    .select('call_date')
    .order('call_date', { ascending: false })
    .limit(1)
    .single();

  const since = latest?.call_date
    ? new Date(latest.call_date)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const meetings = await fetchRecentMeetings(since);
  if (!meetings.length) return NextResponse.json({ ok: true, created: 0, debug: `Fetched 0 meetings since ${since.toISOString()}` });

  const { data: existing } = await supabase
    .from('linkedin_posts')
    .select('fathom_recording_id');
  const existingIds = new Set((existing ?? []).map(r => r.fathom_recording_id));

  const newMeetings = meetings.filter(m => !existingIds.has(m.recording_id) && m.default_summary);
  let created = 0;

  for (const meeting of newMeetings) {
    try {
      const { post, imagePrompt } = await generateContent(meeting);
      if (!post) continue;

      const imageUrl = await generateImage(imagePrompt);

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
        post_content: post,
        image_url: imageUrl ?? '',
        status: 'draft',
      });
      created++;
    } catch (err) {
      console.error('[marketing/sync] Failed for', meeting.recording_id, err);
    }
  }

  return NextResponse.json({ ok: true, created });
}
