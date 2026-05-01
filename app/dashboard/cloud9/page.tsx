import dynamic from "next/dynamic";

const Cloud9Matrix = dynamic(() => import("@/components/dashboard/Cloud9Matrix"), { ssr: false });

export default function Cloud9Page() {
  return <Cloud9Matrix />;
}
