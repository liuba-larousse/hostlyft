import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: `Failed to parse request body: ${String(e)}` }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model ?? 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens ?? 1000,
        messages: body.messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', data);
      return NextResponse.json({ error: data.error?.message ?? `Claude API ${response.status}` }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error('Claude API fetch error:', e);
    return NextResponse.json({ error: `Claude API call failed: ${String(e)}` }, { status: 500 });
  }
}
