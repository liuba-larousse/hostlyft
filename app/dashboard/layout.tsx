import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createSupabaseAdmin } from '@/lib/supabase';
import { Sidebar } from '@/components/dashboard/sidebar';
import CatMascot from '@/components/dashboard/CatMascot';

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
    <>
      <style>{`@media print { .sidebar-wrap, .cat-wrap { display: none !important; } main { padding-top: 0 !important; } }`}</style>
      <div className="flex min-h-screen">
        <div className="sidebar-wrap">
          <Sidebar
            userName={displayName}
            userEmail={session.user.email}
            userImage={session.user.image ?? null}
          />
        </div>
        <main className="flex-1 overflow-auto pt-[57px] md:pt-0">{children}</main>
        <div className="cat-wrap">
          <CatMascot />
        </div>
      </div>
    </>
  );
}
