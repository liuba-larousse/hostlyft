import { getClientList, getMetricsOverview } from '@/lib/metrics/overview';
import { getClientDetail } from '@/lib/metrics/client-detail';
import { parseRange, parseScope, resolveRange } from '@/lib/metrics/range';
import { ClientScopePicker } from '@/components/dashboard/metrics/ClientScopePicker';
import { AttentionStrip } from '@/components/dashboard/metrics/AttentionStrip';
import { ClientMatrix } from '@/components/dashboard/metrics/ClientMatrix';
import { ClientView } from '@/components/dashboard/metrics/ClientView';

export const dynamic = 'force-dynamic';

interface PulsePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PulsePage({ searchParams }: PulsePageProps) {
  const sp = await searchParams;
  const preset = parseRange(sp.range);
  const scope = parseScope(sp.clients);
  const range = resolveRange(preset);

  const clientList = await getClientList();

  // Single client selected → "separate" detail view (Client surface).
  if (Array.isArray(scope) && scope.length === 1) {
    const detail = await getClientDetail(scope[0], range, clientList);
    return (
      <div className="space-y-5">
        <ClientScopePicker clients={clientList} selected={scope} preset={preset} />
        {detail ? (
          <ClientView detail={detail} range={range} />
        ) : (
          <p className="text-sm text-gray-500">Client not found.</p>
        )}
      </div>
    );
  }

  const overview = await getMetricsOverview(scope, range, clientList);

  const scopeLabel =
    scope === 'all'
      ? `All clients · ${overview.clients.length}`
      : `${overview.clients.length} selected`;

  return (
    <div className="space-y-5">
      <ClientScopePicker
        clients={clientList}
        selected={scope}
        preset={preset}
      />

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-gray-900">Pulse</h1>
        <p className="text-xs text-gray-500 tabular-nums">
          {scopeLabel} · {range.label}
        </p>
      </div>

      <AttentionStrip flags={overview.attention} />

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Clients</h2>
          <span className="text-xs text-gray-400">
            each client in its own currency · ▲▼ vs previous {range.label.toLowerCase()}
          </span>
        </div>
        <ClientMatrix clients={overview.clients} />
      </section>
    </div>
  );
}
