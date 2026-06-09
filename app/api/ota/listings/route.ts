import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  const supabase = createSupabaseAdmin();
  let query = supabase.from('ota_listings').select('*').order('ota_name').order('created_at');

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('ota_listings')
    .insert({
      client_id: body.clientId,
      ota_name: body.otaName,
      listing_url: body.listingUrl,
      listing_label: body.listingLabel ?? '',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Upsert a single (listing, OTA) cell by client + ota + listing label.
// Empty URL deletes the cell. Powers the Manage Clients listing-URL table.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { clientId, otaName, listingLabel, listingUrl } = await req.json();
  if (!clientId || !otaName || listingLabel === undefined) {
    return NextResponse.json({ error: 'clientId, otaName, listingLabel required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: existingRows } = await supabase
    .from('ota_listings')
    .select('id')
    .eq('client_id', clientId)
    .eq('ota_name', otaName)
    .eq('listing_label', listingLabel)
    .limit(1);
  const existing = existingRows?.[0];

  const url = (listingUrl ?? '').trim();

  if (!url) {
    if (existing) await supabase.from('ota_listings').delete().eq('id', existing.id);
    return NextResponse.json({ deleted: true });
  }

  if (existing) {
    const { data, error } = await supabase
      .from('ota_listings')
      .update({ listing_url: url })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('ota_listings')
    .insert({ client_id: clientId, ota_name: otaName, listing_url: url, listing_label: listingLabel })
    .select()
    .single();
  if (error) {
    // 23505 = unique_violation on (client_id, listing_url)
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That URL is already used for another listing for this client.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('ota_listings').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
