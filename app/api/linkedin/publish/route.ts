import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await req.json() as { postId: string };
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const supabase = createSupabaseAdmin();

  // Fetch the post
  const { data: post, error: postError } = await supabase
    .from('linkedin_posts')
    .select('post_content')
    .eq('id', postId)
    .single();

  if (postError || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  // Fetch LinkedIn credentials
  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['linkedin_access_token', 'linkedin_person_id', 'linkedin_token_expires_at']);

  const map = Object.fromEntries((settings ?? []).map(r => [r.key, r.value]));

  if (!map.linkedin_access_token || !map.linkedin_person_id) {
    return NextResponse.json({ error: 'LinkedIn not connected' }, { status: 400 });
  }

  if (map.linkedin_token_expires_at && new Date(map.linkedin_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'LinkedIn token expired — please reconnect' }, { status: 400 });
  }

  // Publish to LinkedIn using ugcPosts API
  const body = {
    author: `urn:li:person:${map.linkedin_person_id}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: post.post_content },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const liRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${map.linkedin_access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!liRes.ok) {
    const err = await liRes.text();
    console.error('[linkedin/publish] error', err);
    return NextResponse.json({ error: `LinkedIn API error: ${liRes.status}` }, { status: 502 });
  }

  // Mark post as published
  await supabase.from('linkedin_posts').update({ status: 'published' }).eq('id', postId);

  return NextResponse.json({ ok: true });
}
