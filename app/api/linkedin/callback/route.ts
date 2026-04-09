import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.redirect(new URL('/auth/signin', req.url));

  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const savedState = req.cookies.get('linkedin_oauth_state')?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/dashboard/marketing?linkedin=error', req.url));
  }

  const clientId     = process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
  const redirectUri  = `${process.env.NEXTAUTH_URL}/api/linkedin/callback`;

  // Exchange code for access token
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/dashboard/marketing?linkedin=error', req.url));
  }

  const { access_token, expires_in } = await tokenRes.json() as {
    access_token: string; expires_in: number;
  };

  // Fetch LinkedIn person ID
  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!profileRes.ok) {
    return NextResponse.redirect(new URL('/dashboard/marketing?linkedin=error', req.url));
  }

  const profile = await profileRes.json() as { sub: string; name?: string };
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  // Store token in Supabase settings table
  const supabase = createSupabaseAdmin();
  await supabase.from('settings').upsert([
    { key: 'linkedin_access_token', value: access_token },
    { key: 'linkedin_person_id', value: profile.sub },
    { key: 'linkedin_token_expires_at', value: expiresAt },
    { key: 'linkedin_name', value: profile.name ?? '' },
  ], { onConflict: 'key' });

  const res = NextResponse.redirect(new URL('/dashboard/marketing?linkedin=connected', req.url));
  res.cookies.delete('linkedin_oauth_state');
  return res;
}
