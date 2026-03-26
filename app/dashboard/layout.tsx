import { Sidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName="Team Member"
        userEmail="team@hostlyft.com"
        userImage={null}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
