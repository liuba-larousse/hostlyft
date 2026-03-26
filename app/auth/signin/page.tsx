import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;

  if (session) redirect(callbackUrl ?? "/dashboard");

  const errorMessages: Record<string, string> = {
    AccessDenied: "Access denied. Only authorized Google accounts can sign in.",
    Default: "Something went wrong. Please try again.",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500 mb-4">
            <span className="text-white font-bold text-2xl">H</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">Hostlyft Team</h1>
          <p className="text-slate-400 mt-1 text-sm">Internal dashboard — team access only</p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {errorMessages[error] ?? errorMessages.Default}
          </div>
        )}

        <div className="bg-[#1e2433] rounded-2xl p-8 border border-white/5">
          <p className="text-slate-400 text-sm text-center mb-6">
            Sign in with your Google account to access the team dashboard.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl ?? "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Access restricted to authorized team members.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
