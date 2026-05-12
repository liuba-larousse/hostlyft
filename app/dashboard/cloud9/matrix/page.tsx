"use client";

import dynamic from "next/dynamic";

const Cloud9Matrix = dynamic(() => import("@/components/dashboard/Cloud9Matrix"), { ssr: false });

export default function Cloud9MatrixPage() {
  return <Cloud9Matrix />;
}
