export default function PulseLoading() {
  return (
    <div className="space-y-5">
      <div className="h-9 w-full animate-pulse rounded-lg bg-gray-100" />
      <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="h-64 w-full animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}
