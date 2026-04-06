import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createSupabaseAdmin } from '@/lib/supabase';
import OnboardingForm from './OnboardingForm';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/auth/signin');

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('team_members')
    .select('id')
    .eq('email', session.user.email)
    .single();

  if (data) redirect('/dashboard');

  return (
    <OnboardingForm
      name={session.user.name ?? ''}
      email={session.user.email}
      image={session.user.image ?? null}
    />
  );
}
