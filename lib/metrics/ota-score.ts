// Single source of truth for OTA score color tone, scaled to the OTA's max
// (Airbnb /5, others /10). Used by both the OTA Scores grid and the client-detail
// review cards so the same score always renders the same color.
export function scoreTone(scale: number, score: number): { bg: string; text: string } {
  const pct = scale > 0 ? score / scale : 0;
  if (pct < 0.84) return { bg: "bg-red-100", text: "text-red-700" };
  if (pct < 0.96) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-emerald-100", text: "text-emerald-700" };
}
