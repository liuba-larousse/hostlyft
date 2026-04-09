import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300;

const FATHOM_BASE = 'https://api.fathom.ai/external/v1';

interface FathomSummary {
  short_summary?: string;
  long_summary?: string;
  keywords?: string[];
  action_items?: string[];
  outline?: string;
  overview?: string;
  bullet_summary?: string;
}

interface FathomMeeting {
  recording_id: string;
  title?: string;
  meeting_title?: string;
  created_at: string;
  default_summary?: string | FathomSummary;
  calendar_invitees?: { name?: string; email?: string }[];
}

function extractSummaryText(s: string | FathomSummary | undefined): string {
  if (!s) return '';
  if (typeof s === 'string') return s;
  // Prefer longer forms; fall back through available fields
  const parts: string[] = [];
  if (s.long_summary) parts.push(s.long_summary);
  else if (s.short_summary) parts.push(s.short_summary);
  if (s.outline) parts.push(`Outline:\n${s.outline}`);
  if (s.overview) parts.push(`Overview:\n${s.overview}`);
  if (s.bullet_summary) parts.push(`Summary:\n${s.bullet_summary}`);
  if (s.action_items?.length) parts.push(`Action items:\n${s.action_items.join('\n')}`);
  return parts.join('\n\n') || JSON.stringify(s);
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
  const summary = extractSummaryText(meeting.default_summary) || 'No summary available';
  const attendees = (meeting.calendar_invitees ?? [])
    .map(a => a.name || a.email)
    .filter(Boolean)
    .join(', ');

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are writing a LinkedIn post for Liubov, a female short-term rental revenue manager who works at Hostlyft. She helps STR hosts grow revenue through smart pricing, OTA channel management, and listing optimization.

VOICE & IDENTITY
- Warm, conversational, peer-to-peer — like a knowledgeable friend, never an expert lecturing
- Female voice — natural and grounded, not polished or corporate
- ~4th–5th grade reading level — simple words, clear sentences
- She shares from experience and from working with real clients
- She's learning alongside hosts — she doesn't position herself above them
- When client outcomes are mentioned, they must come from the source material only. Never invent stats, results, or dialogue.

FORMATTING RULES
- Bullet points: 🟡 yellow circles only
- Short paragraphs — 1 to 3 lines max
- Varied rhythm — mix short punchy lines with slightly longer ones
- Line breaks between ideas to keep it scannable
- Bold section headers only when the post is structured with distinct sections
- NO em dashes — ever
- NO paired contrast patterns ("it's not X, it's Y")
- NO "Why [X] matters" as a hook
- NO corporate or robotic language
- NO excessive emojis — use sparingly and only when natural

SENTENCE STRUCTURE
- Never write two sentences that mirror each other back to back
- Vary how sentences open — don't start three in a row the same way
- Conversational filler words are welcome when natural (honestly, okay, thing is, turns out, basically)

HOOK RULES
- The hook (first 1–2 lines) must stop the scroll and create genuine curiosity or relevance
- It must flow naturally into the body — no bait-and-switch
- Preferred hook style: scene-setting. Drop the reader into a small moment before you explain anything. A Tuesday morning. A calendar check. A number that surprised her.
- First-person learning hooks preferred: "Here's what changed for me" / "I started watching something else"
- These also work well: missed opportunity, surprising observation, direct question, pattern interrupt ("Everyone watches X. I watch Y.")
- Hooks must NOT summarize the whole post or give the answer away

ATTRIBUTION — NON-NEGOTIABLE
- If a client or colleague said it, Liubov HEARD it — she did not discover it independently
- Always use: "He told me" / "She mentioned" / "I heard this from someone I work with" — never "I've seen this pattern" when the insight came from someone else
- Insights belong to whoever originated them. Liubov learned from them — that's her honest role.
- Never write from the perspective that Liubov generated an insight that came from the source material she received

FAITHFULNESS — HARD RULE
- If it is not in the source material, it does not exist
- Do not invent client quotes, fabricated dialogue, specific numbers, or outcomes — even if they seem plausible
- Do not expand a single example into a full framework that Liubov claims to have observed herself

CONTENT RULES
- Posts should teach one clear thing — not try to cover everything
- End with a light CTA, a question to the audience, or a clean takeaway line — never a hard sell
- Target length: 150 to 300 words
- Max 3 hashtags at the very end if relevant
- Do not reveal the client's name or confidential details
- Focus on whichever of these the call touched on most: dynamic pricing, OTA channel strategy, listing optimization, revenue metrics, booking policies, fee structure, guest experience, or launch strategy

WHAT TO AVOID
- Em dashes
- Paired mirroring sentences
- Summarizing the post in the hook
- Invented stats, dialogue, or client results not in source material
- Talking down to the audience
- Robotic or predictable formatting patterns
- Hard sell endings
- Phrases like "game-changer", "unlock", "dive deep", "in today's landscape", "let's be honest"
- Starting every post the same way

SOURCE MATERIAL (call summary — use only what is here, do not invent):
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

  // Always fetch last 30 days so deleted posts can be re-pulled
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const meetings = await fetchRecentMeetings(since);
  if (!meetings.length) return NextResponse.json({ ok: true, created: 0, debug: `Fetched 0 meetings since ${since.toISOString()}` });

  // Skip approved/denied/published — re-pull if deleted (draft posts get regenerated)
  const { data: existing } = await supabase
    .from('linkedin_posts')
    .select('fathom_recording_id, status');
  const skipIds = new Set(
    (existing ?? [])
      .filter(r => ['approved', 'denied', 'published'].includes(r.status))
      .map(r => r.fathom_recording_id)
  );

  // Also skip draft posts that already exist (avoid duplicates)
  const draftIds = new Set(
    (existing ?? [])
      .filter(r => r.status === 'draft')
      .map(r => r.fathom_recording_id)
  );

  const allNew = meetings.filter(m => !skipIds.has(m.recording_id) && !draftIds.has(m.recording_id) && extractSummaryText(m.default_summary));
  // Cap at 3 per run to avoid 60s timeout — cron runs daily so the rest get picked up next time
  const newMeetings = allNew.slice(0, 3);
  console.log('[marketing/sync] meetings:', meetings.length, 'skip:', skipIds.size, 'draft:', draftIds.size, 'new (total):', allNew.length, 'processing:', newMeetings.length);
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

      await supabase.from('linkedin_posts').upsert({
        fathom_recording_id: meeting.recording_id,
        call_title: title,
        call_date: meeting.created_at,
        attendees,
        summary: extractSummaryText(meeting.default_summary),
        post_content: post,
        image_url: imageUrl ?? '',
        status: 'draft',
      }, { onConflict: 'fathom_recording_id' });
      created++;
    } catch (err) {
      console.error('[marketing/sync] Failed for', meeting.recording_id, err);
    }
  }

  return NextResponse.json({ ok: true, created });
}
