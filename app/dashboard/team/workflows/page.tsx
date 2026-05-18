'use client';

import { useState } from 'react';

type Panel = 'daily' | 'weekly' | 'monthly' | 'glossary';

const pills: { id: Panel; label: string; cls: string }[] = [
  { id: 'daily', label: 'Daily', cls: 'bg-emerald-700 text-white' },
  { id: 'weekly', label: 'Weekly', cls: 'bg-blue-600 text-white' },
  { id: 'monthly', label: 'Monthly', cls: 'bg-purple-900 text-white' },
  { id: 'glossary', label: 'Glossary', cls: 'bg-gray-600 text-white' },
];

/* ─── Tiny reusable bits ─── */

function StepCard({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">{num}</span>
        <span className="text-[15px] font-bold text-[#1B3A5C]">{title}</span>
      </div>
      <div className="px-5 pb-4">{children}</div>
    </div>
  );
}

function Callout({ type, title, children }: { type: 'info' | 'warning' | 'danger' | 'success' | 'purple'; title?: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    info: 'bg-blue-50 border-blue-600 text-[#1B3A5C]',
    warning: 'bg-amber-50 border-amber-600 text-amber-900',
    danger: 'bg-red-50 border-red-700 text-red-900',
    success: 'bg-emerald-50 border-emerald-700 text-emerald-900',
    purple: 'bg-purple-50 border-purple-800 text-purple-900',
  };
  return (
    <div className={`rounded-lg px-4 py-3 my-3 text-[13px] leading-relaxed border-l-4 ${styles[type]}`}>
      {title && <strong className="block mb-1">{title}</strong>}
      {children}
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setDone(d => !d)}
        className={`w-[22px] h-[22px] rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center cursor-pointer transition-colors ${done ? 'bg-blue-600 border-blue-600 text-white' : 'border-blue-600'}`}
      >
        {done && <span className="text-[13px] font-bold">&#10003;</span>}
      </button>
      <span className="text-[13px] text-gray-700 leading-relaxed">{children}</span>
    </div>
  );
}

function DayRow({ day, type, badge, children }: { day: string; type: 'action' | 'action-mid' | 'observe'; badge: string; children: React.ReactNode }) {
  const bgCol = type === 'action' ? 'bg-[#1B3A5C]' : type === 'action-mid' ? 'bg-blue-600' : 'bg-gray-500';
  const contentBg = type === 'observe' ? 'bg-gray-50' : 'bg-white';
  const tagCls = type === 'observe' ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-[#1B3A5C]';
  return (
    <div className="grid grid-cols-[80px_1fr] rounded-xl overflow-hidden shadow-sm mb-2.5">
      <div className={`${bgCol} text-white flex flex-col items-center justify-center py-3.5 px-1.5`}>
        <span className="text-xl font-bold">{day}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-80 mt-1">{type === 'observe' ? 'Observe' : 'Adjust'}</span>
      </div>
      <div className={`${contentBg} px-4 py-3.5`}>
        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide mb-2 ${tagCls}`}>{badge}</span>
        <ul className="list-disc pl-4 space-y-1 text-[13px] text-gray-700 leading-relaxed">{children}</ul>
      </div>
    </div>
  );
}

function DecisionGrid({ ifType, ifItems, thenItems }: { ifType: 'up' | 'down'; ifItems: string[]; thenItems: string[] }) {
  const ifCls = ifType === 'up' ? 'bg-emerald-50' : 'bg-red-50';
  const thenCls = ifType === 'up' ? 'bg-emerald-100' : 'bg-red-100';
  const labelCls = ifType === 'up' ? 'text-emerald-800' : 'text-red-800';
  return (
    <div className="grid grid-cols-2 rounded-lg overflow-hidden border border-gray-200 my-3">
      <div className={`${ifCls} px-4 py-3.5`}>
        <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${labelCls}`}>IF</div>
        <ul className="list-disc pl-4 space-y-1 text-[13px] text-gray-700 leading-relaxed">{ifItems.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      <div className={`${thenCls} px-4 py-3.5`}>
        <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${labelCls}`}>THEN</div>
        <ul className="list-disc pl-4 space-y-1 text-[13px] text-gray-700 leading-relaxed">{thenItems.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
    </div>
  );
}

/* ─── Panels ─── */

function WeeklyPanel() {
  return (
    <>
      <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 pb-2 border-b-[3px] border-blue-600">Weekly Cycle — 7-Day Action Loop</h2>
      <Callout type="info" title="Core Principle">Every action references your revenue goal. Pacing and pickup data only have meaning when you know where you need to be. If you cannot connect an action to your revenue goal, do not take it.</Callout>

      <h3 className="text-[15px] font-bold text-blue-600 mt-6 mb-3">Day 1 — Main Analysis &amp; Pricing Day</h3>
      <Callout type="success" title="Purpose">This is your most important day of the week. Read the data, identify where to move prices, and make the changes in PriceLabs. Be decisive.</Callout>

      <StepCard num={1} title="Open Overview by Week in PriceLabs">
        <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
          <li>Check <strong>Pacing</strong>: your KPIs vs Last Year KPIs and vs Market KPIs</li>
          <li>Check <strong>Pickup</strong> for the last 3 days and last 7 days</li>
          <li>Ask: am I ahead of my revenue goal, behind it, or on track?</li>
          <li>Note all high-demand days and public holidays in the coming weeks</li>
        </ul>
      </StepCard>

      <StepCard num={2} title="Identify Strong & Weak Weeks">
        <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
          <li><strong>Strong week:</strong> pacing ahead of target — can support higher prices</li>
          <li><strong>Weak week:</strong> pacing behind target — needs price action to stimulate pickup</li>
          <li>Pay specific attention to high-demand days and public holidays within each week</li>
        </ul>
      </StepCard>

      <StepCard num={3} title="Drill Into Overview by Day">
        <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
          <li>Inside each strong or weak week, open the <strong>Overview by Day</strong> view in PriceLabs</li>
          <li>Identify the specific strong and weak days within that week</li>
          <li>A weak week can still contain 2–3 strong days — price them separately, not as a block</li>
        </ul>
      </StepCard>

      <StepCard num={4} title="Apply the Pricing Decision Rules">
        <p className="text-sm font-bold text-emerald-700 mb-1">Rule 1 — Occupancy Ahead: Raise Prices</p>
        <DecisionGrid
          ifType="up"
          ifItems={['OCC is ahead by 5–10%', 'AND 3-day & 7-day OCC pickup is consistent', 'AND ADR pickup is consistent with market']}
          thenItems={['Adjust price UP by 5–10%', 'Or move towards above-market price level', 'Use PriceLabs minimum price override for that period']}
        />
        <p className="text-sm font-bold text-red-800 mt-4 mb-1">Rule 2 — Occupancy Behind: Lower Prices</p>
        <DecisionGrid
          ifType="down"
          ifItems={['OCC is behind by 5–10%', 'OR 3-day & 7-day OCC pickup is weak', 'OR ADR pickup is below market']}
          thenItems={['Adjust price DOWN by 5–10%', 'Or move towards below-market price level', 'Consider relaxing minimum stay if set too high']}
        />
        <Callout type="warning" title="Booking Window Rule">Only adjust dates within the active booking window for your market. If unsure what the booking window is for a property — ask your Senior RM before touching far-out dates.</Callout>
        <p className="text-[13px] text-gray-500 mt-3">Document every change: which dates, direction, percentage, and why.</p>
      </StepCard>

      <h3 className="text-[15px] font-bold text-blue-600 mt-6 mb-3">Days 2, 3, 5, 6, 7 — Observation Days</h3>
      <Callout type="warning" title="Discipline Rule">The market needs time to respond to your Day 1 decisions. Touching prices every day creates instability and makes it impossible to read what is actually working.</Callout>

      <DayRow day="D2" type="observe" badge="Observation Day">
        <li>Check pickup since Day 1 adjustments</li>
        <li>Note any unexpected movement on specific dates</li>
        <li>Micro-adjustment only if pickup clearly shows a problem — otherwise hold</li>
      </DayRow>
      <DayRow day="D3" type="observe" badge="Observation Day">
        <li>Check pickup — is there a pattern since Day 1?</li>
        <li>Minor nudges only if warranted — no restructuring</li>
      </DayRow>

      <h3 className="text-[15px] font-bold text-blue-600 mt-6 mb-3">Day 4 — Mid-Week Adjustment</h3>
      <Callout type="info" title="Purpose">You now have 3 days of pickup data since your Day 1 changes. If the data demands action, make it. If not, treat Day 4 as an observation day.</Callout>
      <DayRow day="D4" type="action-mid" badge="Mid-Week Action">
        <li>Check pickup for the 3 days since Day 1</li>
        <li>Weak period not picking up? Consider a further price reduction or minimum stay relaxation</li>
        <li>Strong period filling fast? Raise price to protect ADR</li>
        <li>Apply the same IF/THEN rules from Day 1 — use the data, not your gut</li>
        <li>Document all changes</li>
      </DayRow>
      <DayRow day="D5" type="observe" badge="Observation Day">
        <li>Check pickup response to Day 4 adjustments</li>
        <li>Micro-adjustments only</li>
      </DayRow>
      <DayRow day="D6" type="observe" badge="Observation Day">
        <li>Observe — note anything to carry into next week&apos;s Day 1</li>
        <li>No major changes</li>
      </DayRow>
      <DayRow day="D7" type="observe" badge="Observation Day">
        <li>Let the week close cleanly</li>
        <li>Prepare notes for tomorrow&apos;s Day 1 review — no pricing changes</li>
      </DayRow>
    </>
  );
}

function DailyPanel() {
  return (
    <>
      <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 pb-2 border-b-[3px] border-blue-600">Daily Check — Every Morning Without Exception</h2>
      <Callout type="success" title="Purpose">10–15 minutes. Did bookings come in? Check ADR, LOS, platform. Does your pricing need an immediate response? Do this before anything else.</Callout>

      <h3 className="text-[15px] font-bold text-blue-600 mt-6 mb-3">Did Any Bookings Come In the Last 24 Hours?</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-emerald-600 overflow-hidden">
          <div className="px-5 pt-4 pb-2"><span className="text-[15px] font-bold text-emerald-700">YES — Bookings came in</span></div>
          <div className="px-5 pb-4">
            <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
              <li>Check each booking: <strong>ADR, LOS, Platform</strong></li>
              <li>Is the ADR lower than expected for that period?
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Yes — prices may be too low. Adjust up and remove any active promotions for that period</li>
                  <li>No — pricing is working. Observe and hold.</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-red-600 overflow-hidden">
          <div className="px-5 pt-4 pb-2"><span className="text-[15px] font-bold text-red-700">NO — No bookings in 24 hours</span></div>
          <div className="px-5 pb-4">
            <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
              <li>Open <strong>Review by Day</strong> report in PriceLabs</li>
              <li>Compare your <strong>Final Price vs Market Price</strong> for periods with no pickup</li>
              <li>Compare your price against the <strong>Comp Set</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Price above market/comp — adjust down to competitive level</li>
                  <li>Already at or below market — flag to Senior RM. Price may not be the issue.</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <h3 className="text-[15px] font-bold text-blue-600 mt-6 mb-3">Daily Checklist</h3>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3">
        <CheckItem>Open PriceLabs dashboard — check 24-hour pickup across your portfolio</CheckItem>
        <CheckItem>Did bookings come in? Note ADR, LOS, and platform for each</CheckItem>
        <CheckItem>Is ADR on new bookings where it should be? If low — adjust prices up</CheckItem>
        <CheckItem>No bookings — open Review by Day, compare Final Price vs Market Price and Comp Set</CheckItem>
        <CheckItem>Micro-adjust if data supports it — otherwise observe and close</CheckItem>
        <CheckItem>Log any notable observations for this week&apos;s Day 1 review</CheckItem>
      </div>

      <Callout type="danger" title="When to Escalate — Daily">
        No bookings for 3+ consecutive days on a period that should be filling &bull; ADR on incoming bookings is consistently 15%+ below target &bull; Price already below market and pickup still not moving &bull; You are considering moving a price by more than 15% in either direction
      </Callout>
    </>
  );
}

function MonthlyPanel() {
  return (
    <>
      <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 pb-2 border-b-[3px] border-blue-600">Monthly Cycle — Review, Reflect, Report</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-purple-800 overflow-hidden">
          <div className="px-5 pt-4 pb-2"><span className="text-[15px] font-bold text-purple-900">Part 1 — Review Last Month</span></div>
          <div className="px-5 pb-4">
            <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
              <li>Open <strong>Overview by Month</strong> in PriceLabs</li>
              <li>Check Pacing vs Last Year &amp; Market KPIs</li>
              <li>Check Pickup: last 7 and last 30 days</li>
              <li>Did you hit your revenue goal?</li>
              <li>What specific changes moved revenue forward per property?</li>
              <li>Document: what changed, when, what happened</li>
            </ul>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-blue-600 overflow-hidden">
          <div className="px-5 pt-4 pb-2"><span className="text-[15px] font-bold text-blue-700">Part 2 — Forward Adjustments</span></div>
          <div className="px-5 pb-4">
            <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
              <li>Adjust seasonality for next 60–90 days</li>
              <li>Set up promotions for weak months</li>
              <li>Review min stay profiles — recalibrate?</li>
              <li>Address strong/weak months ahead</li>
              <li>Document all changes with rationale</li>
            </ul>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-t-4 border-emerald-600 overflow-hidden">
          <div className="px-5 pt-4 pb-2"><span className="text-[15px] font-bold text-emerald-700">Part 3 — Owner Report</span></div>
          <div className="px-5 pb-4">
            <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
              <li>What was done, why, and results</li>
              <li>KPIs vs target</li>
              <li>Wins and underperforming periods</li>
              <li>Plain language — not a data dump</li>
              <li>Send before end of first week of new month</li>
            </ul>
          </div>
        </div>
      </div>

      <Callout type="purple" title="Documentation Rule">Do not write &quot;I raised prices in July.&quot; Write: &quot;Raised prices 8% on 14–21 July after OCC pacing showed +7% ahead with consistent 7-day pickup. ADR improved from &pound;142 to &pound;155.&quot; That is documentation.</Callout>

      <Callout type="danger" title="When to Escalate — Monthly">
        Property missed revenue goal by more than 10% and you cannot identify the cause &bull; You are considering a seasonality change affecting more than 4 weeks of pricing &bull; An owner is asking questions you cannot answer from your data &bull; A promotion would drop prices more than 15% below market
      </Callout>

      <h3 className="text-[15px] font-bold text-blue-600 mt-6 mb-3">Monthly Checklist</h3>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3">
        <CheckItem>Open Overview by Month — check pacing vs Last Year and Market</CheckItem>
        <CheckItem>Check pickup: last 7 days and last 30 days</CheckItem>
        <CheckItem>Revenue goal check: hit / missed / exceeded — by how much?</CheckItem>
        <CheckItem>Document what specific actions moved revenue forward per property</CheckItem>
        <CheckItem>Adjust seasonality settings for next 60–90 days</CheckItem>
        <CheckItem>Set up promotions for weak periods ahead</CheckItem>
        <CheckItem>Recalibrate minimum stay profiles if needed</CheckItem>
        <CheckItem>Write and send owner report</CheckItem>
      </div>
    </>
  );
}

function GlossaryPanel() {
  const terms = [
    { term: 'Pacing', def: 'How your bookings compare to the same point last year or to the market. If you are pacing ahead, you are booked further ahead than expected. If behind, you are lagging.' },
    { term: 'Pickup', def: 'How many bookings came in over a specific window — last 3, 7, or 30 days — and at what ADR. Fast pickup = demand is there. Slow pickup = may need a price response.' },
    { term: 'ADR', def: 'Average Daily Rate. The average price per night actually booked. Not your listed price — what guests paid.' },
    { term: 'LOS', def: 'Length of Stay. How many nights per booking. A 2-night LOS means guests are booking short stays.' },
    { term: 'OCC / Occupancy', def: 'Percentage of your available nights that are booked. 80% occupancy means 80% of your calendar is filled.' },
    { term: 'Booking Window', def: 'How far in advance guests are booking. A 30-day booking window means most bookings come in within 30 days of the stay. Focus your pricing decisions here.' },
    { term: 'Comp Set', def: 'The competitor properties PriceLabs uses to benchmark your pricing. Your price vs comp set tells you whether you are positioned above, at, or below the competition.' },
    { term: 'Final Price vs Market Price', def: 'The actual price PriceLabs has set for a date (Final Price) vs what the market average is (Market Price). The gap tells you your positioning.' },
    { term: 'Minimum Stay', def: 'The minimum number of nights a guest must book. Raising this protects high ADR periods. Lowering it helps fill gaps during low demand.' },
    { term: 'Revenue Goal', def: 'The monthly revenue target set for each property. Every decision you make should connect back to whether it helps you hit this number.' },
  ];
  return (
    <>
      <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 pb-2 border-b-[3px] border-blue-600">Key Terms</h2>
      <Callout type="info" title="Who is this for?">If you are 6–12 months in, you likely know most of these. Use this as a reference if you need to clarify a term before making a decision — not guessing is always the right call.</Callout>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4">
        {terms.map(t => (
          <div key={t.term} className="bg-white rounded-lg px-4 py-3.5 shadow-sm border border-gray-100">
            <div className="text-sm font-bold text-[#1B3A5C] mb-1">{t.term}</div>
            <div className="text-xs text-gray-500 leading-relaxed">{t.def}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── Reference table (always visible) ─── */

const refRows = [
  { cycle: 'Daily Check', when: 'Every morning', what: 'Bookings in? Check ADR/LOS/platform. No bookings? Compare vs market & comp set. Micro-adjust if needed.' },
  { cycle: 'Day 1', when: 'Weekly', what: 'Full pacing + pickup review in PriceLabs. Identify strong/weak weeks & days. Apply IF/THEN rules. Set prices. Document.' },
  { cycle: 'Day 4', when: 'Weekly (mid-week)', what: 'Mid-cycle correction based on 3 days of pickup data since Day 1. Same decision rules apply.' },
  { cycle: 'Days 2,3,5,6,7', when: 'Weekly (obs. days)', what: 'Observe pickup only. Micro-adjustments if data demands it. No major restructuring.' },
  { cycle: 'Monthly Review', when: 'Monthly', what: 'Past month pacing, pickup, goal check. Document what worked per property.' },
  { cycle: 'Forward Adjustments', when: 'Monthly', what: 'Seasonality, promotions, min stay recalibration for next 60–90 days.' },
  { cycle: 'Owner Report', when: 'Monthly', what: 'Written summary to portfolio owner. Send before end of first week of new month.' },
];

/* ─── Main page ─── */

export default function WorkflowsPage() {
  const [active, setActive] = useState<Panel>('weekly');

  return (
    <div>
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1B3A5C] to-[#2E6DA4] text-white px-6 md:px-10 py-8 mb-6">
        <h1 className="text-2xl md:text-[30px] font-bold mb-1">Junior Revenue Manager — Workflow V2</h1>
        <p className="text-blue-200 text-sm mb-5">For RMs with 6–12 months STR experience. You know PriceLabs — this tells you what to do with it.</p>
        <div className="flex flex-wrap gap-2.5">
          {pills.map(p => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`px-5 py-1.5 rounded-full text-[13px] font-semibold cursor-pointer transition-all border-2 ${p.cls} ${active === p.id ? 'border-white scale-[1.04]' : 'border-transparent hover:border-white/60'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active panel */}
      <div className="mb-8">
        {active === 'weekly' && <WeeklyPanel />}
        {active === 'daily' && <DailyPanel />}
        {active === 'monthly' && <MonthlyPanel />}
        {active === 'glossary' && <GlossaryPanel />}
      </div>

      {/* Reference table — always visible */}
      <div>
        <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 pb-2 border-b-[3px] border-blue-600">Full Cycle at a Glance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-[#1B3A5C] text-white">
                <th className="text-left px-4 py-2.5 font-semibold">Cycle</th>
                <th className="text-left px-4 py-2.5 font-semibold">When</th>
                <th className="text-left px-4 py-2.5 font-semibold">What You Do</th>
              </tr>
            </thead>
            <tbody>
              {refRows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 even:bg-gray-50 hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-gray-900">{r.cycle}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.when}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-8 pt-4 border-t border-gray-200">
        Hostlyft Revenue Team &nbsp;|&nbsp; Internal Use Only &nbsp;|&nbsp; May 2026 &nbsp;|&nbsp; V2
      </p>
    </div>
  );
}
