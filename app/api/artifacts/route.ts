import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('artifacts')
    .select('id, title, description, file_name, created_by, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string | null)?.trim();

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
    return NextResponse.json({ error: 'Only HTML files are supported' }, { status: 400 });
  }

  const html_content = await file.text();
  const artifactTitle = title || file.name.replace(/\.(html|htm)$/i, '');

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      title: artifactTitle,
      html_content,
      file_name: file.name,
      created_by: session.user.email,
    })
    .select('id, title, description, file_name, created_by, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('artifacts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
