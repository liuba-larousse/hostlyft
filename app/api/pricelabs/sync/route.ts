import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncAllFromApi } from '@/lib/pricelabs/api-sync';

export const maxDuration = 300;

// GET — Vercel Cron (Bearer CRON_SECRET). Pulls all keyed clients from the
// PriceLabs Customer API into booking_reports. No browser/login.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await syncAllFromApi();
  return NextResponse.json({ success: true, results });
}

// POST — manual sync from the dashboard.
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await syncAllFromApi();
  return NextResponse.json({ success: true, results });
}
