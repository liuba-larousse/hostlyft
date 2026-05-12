"use client";

import dynamic from "next/dynamic";

const ActionLog = dynamic(() => import("@/components/dashboard/ActionLog"), { ssr: false });

export default function ActionLogPage() {
  return <ActionLog />;
}
