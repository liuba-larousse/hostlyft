import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/app/api/marketing/sync/route';

// Called daily by Vercel Cron — protected by CRON_SECRET
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return runSync();
}
