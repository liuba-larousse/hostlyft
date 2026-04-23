import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createSupabaseAdmin } from '@/lib/supabase';
import { Sidebar } from '@/components/dashboard/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect('/auth/signin');

  const supabase = createSupabaseAdmin();
  const { data: member } = await supabase
    .from('team_members')
    .select('first_name, last_name')
    .eq('email', session.user.email)
    .single();

  if (!member) redirect('/onboarding');

  const displayName = `${member.first_name} ${member.last_name}`;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={displayName}
        userEmail={session.user.email}
        userImage={session.user.image ?? null}
      />
      <main className="flex-1 overflow-auto pt-[57px] md:pt-0">{children}</main>
    </div>
  );
}
