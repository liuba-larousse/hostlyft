"use client";

import dynamic from "next/dynamic";

const SeasonalityRecalibrator = dynamic(
  () => import("@/components/dashboard/SeasonalityRecalibrator"),
  { ssr: false }
);

export default function SeasonalityPage() {
  return <SeasonalityRecalibrator />;
}
