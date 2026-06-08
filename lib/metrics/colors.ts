// Stable categorical color per client — the same client keeps its color across
// every chart, table, and dot, so it's recognizable without a legend.
// Deliberately excludes brand yellow (reserved for active/selected state).
const CLIENT_PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#db2777', // pink
  '#0891b2', // cyan
  '#9333ea', // violet
  '#ea580c', // orange
  '#0d9488', // teal
  '#dc2626', // red
  '#4f46e5', // indigo
  '#65a30d', // lime
];

export function clientColor(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return CLIENT_PALETTE[hash % CLIENT_PALETTE.length];
}
