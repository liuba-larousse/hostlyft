import { createSupabaseAdmin } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function ArtifactViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect('/auth/signin');

  const { id } = await params;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('artifacts')
    .select('title, html_content, file_name, created_at')
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  const uploadedDate = new Date(data.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <Link
          href="/dashboard/artifacts"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Artifacts
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-900">{data.title}</span>
        <span className="text-xs text-gray-400 ml-auto">{data.file_name} · Uploaded {uploadedDate}</span>
      </div>

      {/* HTML rendered in sandboxed iframe */}
      <iframe
        srcDoc={data.html_content}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 w-full border-0"
        title={data.title}
      />
    </div>
  );
}
