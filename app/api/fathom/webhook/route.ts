import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';

// Verify Fathom webhook signature (svix-style: whsec_ prefix, HMAC-SHA256)
async function verifySignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) return false;

  const msgId        = req.headers.get('webhook-id') ?? '';
  const msgTimestamp = req.headers.get('webhook-timestamp') ?? '';
  const msgSignature = req.headers.get('webhook-signature') ?? '';
  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Replay attack guard: reject if older than 5 minutes
  const ts = parseInt(msgTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;
  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, Buffer.from(toSign));
  const computed = Buffer.from(sig).toString('base64');

  // webhook-signature header may contain multiple space-separated "v1,<sig>" entries
  return msgSignature.split(' ').some(s => s.replace(/^v\d+,/, '') === computed);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const valid = await verifySignature(req, rawBody);
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only handle meeting_content_ready events
  if (payload.type !== 'meeting_content_ready') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const actionItems = payload.action_items as string[] | undefined;
  if (!actionItems?.length) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  // Best-effort: extract a client/attendee name from the meeting
  const attendees = payload.attendees as { name?: string; email?: string }[] | undefined;
  const externalAttendee = attendees?.find(a => a.email && !a.email.endsWith('@fathom.video'));
  const clientName = externalAttendee?.name ?? '';

  // Extract meeting title for task description context
  const meetingUrl   = (payload.url as string | undefined) ?? '';
  const recordingId  = (payload.recording_id as string | undefined) ?? '';
  const description  = meetingUrl || (recordingId ? `Fathom recording: ${recordingId}` : 'From Fathom call');

  const supabase = createSupabaseAdmin();
  let created = 0;

  for (const item of actionItems) {
    const title = String(item).trim();
    if (!title) continue;
    const { error } = await supabase.from('tasks').insert({
      created_by: 'fathom-webhook',
      title,
      description,
      status: 'todo',
      priority: 'medium',
      assignee: '',
      client: clientName,
      due_date: '',
    });
    if (!error) created++;
  }

  return NextResponse.json({ ok: true, created });
}
