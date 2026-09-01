import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { TrendingUp, AlertTriangle, CheckCircle, Lightbulb, Activity } from "lucide-react";
import { toast } from "sonner";

const GROUP_OPTIONS = [
  { value: "platform", label: "By Platform" },
  { value: "outlet", label: "By Outlet" },
  { value: "product", label: "By Product" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export default function OnlineProfit() {
  const { outlets, outletIdForApi, allAccess } = useOutlet();
  const [report, setReport] = useState(null);
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    date_from: "",
    date_to: "",
    outlet_id: outletIdForApi || "",
    platform_id: "",
    group_by: "platform",
  });
  const [platforms, setPlatforms] = useState([]);
  const [targetMargin, setTargetMargin] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      if (filters.outlet_id) params.append("outlet_id", filters.outlet_id);
      if (filters.platform_id) params.append("platform_id", filters.platform_id);
      params.append("group_by", filters.group_by);

      const [rRes, aiRes] = await Promise.all([
        api.get(`/online-profit/report?${params.toString()}`),
        api.get(`/ai/online-profit?target_margin=${targetMargin}${filters.outlet_id ? `&outlet_id=${filters.outlet_id}` : ""}`),
      ]);
      setReport(rRes.data);
      setAi(aiRes.data);
    } catch (e) {
      toast.error("Gagal memuat report");
    } finally {
      setLoading(false);
    }
  }, [filters, targetMargin]);

  useEffect(() => {
    api.get("/online-platforms").then(r => setPlatforms(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = report?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Online Profit" subtitle="Laporan profitabilitas online marketplace" icon={TrendingUp} />

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
        <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-xs text-[#F5F5F5]" />
        <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-xs text-[#F5F5F5]" />
        {allAccess && <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })} className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-xs text-[#F5F5F5]">
          <option value="">All Outlets</option>
          {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>}
        <select value={filters.platform_id} onChange={(e) => setFilters({ ...filters, platform_id: e.target.value })} className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-xs text-[#F5F5F5]">
          <option value="">All Platforms</option>
          {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filters.group_by} onChange={(e) => setFilters({ ...filters, group_by: e.target.value })} className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-xs text-[#F5F5F5]">
          {GROUP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </div>

      {s && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Total Online Sales" value={formatIDR(s.total_gross)} sub={`${s.order_count} orders`} />
            <SummaryCard label="Total Platform Cost" value={formatIDR(s.total_deduction)} sub={`${s.effective_fee_pct}% effective`} color="text-[#8B0000]" />
            <SummaryCard label="Total Settlement" value={formatIDR(s.total_expected_settlement)} sub={`Actual: ${formatIDR(s.total_actual_settlement)}`} />
            <SummaryCard label="Gross Profit After Platform" value={formatIDR(s.total_profit)} sub={`${s.profit_margin}% margin`} color={s.total_profit >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"} />
          </div>

          {/* Fee Breakdown */}
          <div className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4 mb-6">
            <h3 className="text-xs uppercase tracking-widest text-[#C4A484] mb-3">Platform Fee Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <FeeItem label="Commission" value={s.total_commission} />
              <FeeItem label="Fixed Fee" value={s.total_fixed_fee} />
              <FeeItem label="Tax on Fee" value={s.total_tax} />
              <FeeItem label="Merchant Promo" value={s.total_merchant_promo} />
              <FeeItem label="Advertising" value={s.total_advertising} />
              <FeeItem label="Other Fee" value={s.total_other_fee} />
              <FeeItem label="Total COGS" value={s.total_cogs} />
              <FeeItem label="Margin on Settlement" value={`${s.margin_on_settlement}%`} isText />
            </div>
          </div>

          {/* Breakdown Table */}
          {report.breakdown.length > 0 && (
            <div className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4 mb-6 overflow-x-auto">
              <h3 className="text-xs uppercase tracking-widest text-[#C4A484] mb-3">Breakdown — {GROUP_OPTIONS.find(g => g.value === filters.group_by)?.label}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#C4A484] text-xs uppercase tracking-wider border-b border-[rgba(244,200,66,0.1)]">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4 text-right">Orders</th>
                    <th className="py-2 pr-4 text-right">Gross</th>
                    <th className="py-2 pr-4 text-right">Eff. Fee</th>
                    <th className="py-2 pr-4 text-right">Settlement</th>
                    <th className="py-2 pr-4 text-right">COGS</th>
                    <th className="py-2 pr-4 text-right">Profit</th>
                    <th className="py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {report.breakdown.map((r, i) => (
                    <tr key={i} className="border-b border-[rgba(244,200,66,0.05)]">
                      <td className="py-2 pr-4 text-[#F5F5F5]">{r.name || r.platform_name || r.outlet_name || r.product_name || r.period}</td>
                      <td className="py-2 pr-4 text-right text-[#C4A484]">{r.order_count || r.total_qty || "—"}</td>
                      <td className="py-2 pr-4 text-right text-[#F5F5F5]">{formatIDR(r.total_gross)}</td>
                      <td className="py-2 pr-4 text-right text-[#C4A484]">{r.effective_fee_pct != null ? `${r.effective_fee_pct}%` : "—"}</td>
                      <td className="py-2 pr-4 text-right text-[#F5F5F5]">{formatIDR(r.total_settlement)}</td>
                      <td className="py-2 pr-4 text-right text-[#F5F5F5]">{formatIDR(r.total_cogs)}</td>
                      <td className={`py-2 pr-4 text-right ${r.total_profit >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"}`}>{formatIDR(r.total_profit)}</td>
                      <td className={`py-2 text-right ${r.profit_margin >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"}`}>{r.profit_margin}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* AI Analysis */}
      {ai && (
        <div className="space-y-4">
          <div className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="text-[#F4C842]" size={20} />
              <h3 className="font-serif-luxury text-lg text-[#F5F5F5]">AI Analysis</h3>
              <span className="text-xs text-[#C4A484] ml-auto">Target Margin: {targetMargin}%</span>
            </div>

            {/* Facts */}
            {ai.facts.length > 0 && (
              <div className="mb-3">
                <p className="text-xs uppercase tracking-widest text-[#C4A484] mb-1">Facts (ACTUAL DATA)</p>
                {ai.facts.map((f, i) => <p key={i} className="text-sm text-[#F5F5F5]">• {f}</p>)}
              </div>
            )}

            {/* Observations */}
            {ai.observations.length > 0 && (
              <div className="mb-3">
                <p className="text-xs uppercase tracking-widest text-[#C4A484] mb-1">Observations</p>
                {ai.observations.map((o, i) => <p key={i} className="text-sm text-[#F5F5F5]">{o}</p>)}
              </div>
            )}

            {/* Recommendations */}
            {ai.recommendations.length > 0 && (
              <div className="mb-3">
                <p className="text-xs uppercase tracking-widest text-[#F4C842] mb-1">Recommendations</p>
                {ai.recommendations.map((r, i) => <p key={i} className="text-sm text-[#F5F5F5]">→ {r}</p>)}
              </div>
            )}

            {/* Data labels */}
            <div className="text-xs text-[#C4A484] italic mt-3 border-t border-[rgba(244,200,66,0.1)] pt-2">
              <p>Platform Comparison: {ai.data_labels.platform_comparison}</p>
              <p>Market Benchmark: {ai.data_labels.market_benchmark}</p>
            </div>
          </div>

          {/* Platform Comparison */}
          {ai.platform_comparison.length > 0 && (
            <div className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-widest text-[#C4A484] mb-3">Platform Comparison (ACTUAL DATA)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[#C4A484] text-xs uppercase tracking-wider border-b border-[rgba(244,200,66,0.1)]">
                      <th className="py-2 pr-4">Platform</th>
                      <th className="py-2 pr-4 text-right">Gross</th>
                      <th className="py-2 pr-4 text-right">Eff. Fee</th>
                      <th className="py-2 pr-4 text-right">Benchmark</th>
                      <th className="py-2 pr-4 text-right">Settlement</th>
                      <th className="py-2 pr-4 text-right">COGS</th>
                      <th className="py-2 pr-4 text-right">Profit</th>
                      <th className="py-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.platform_comparison.map((p, i) => (
                      <tr key={i} className="border-b border-[rgba(244,200,66,0.05)]">
                        <td className="py-2 pr-4 text-[#F5F5F5]">{p.platform}</td>
                        <td className="py-2 pr-4 text-right text-[#F5F5F5]">{formatIDR(p.total_gross)}</td>
                        <td className="py-2 pr-4 text-right text-[#C4A484]">{p.effective_fee_pct}%</td>
                        <td className="py-2 pr-4 text-right text-xs text-[#C4A484]">{p.market_benchmark.min_pct}-{p.market_benchmark.max_pct}% <span className="italic">({p.market_benchmark.label})</span></td>
                        <td className="py-2 pr-4 text-right text-[#F5F5F5]">{formatIDR(p.total_settlement)}</td>
                        <td className="py-2 pr-4 text-right text-[#F5F5F5]">{formatIDR(p.total_cogs)}</td>
                        <td className={`py-2 pr-4 text-right ${p.total_profit >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"}`}>{formatIDR(p.total_profit)}</td>
                        <td className={`py-2 text-right ${p.profit_margin >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"}`}>{p.profit_margin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fee Trends */}
          {ai.fee_trends.length > 0 && (
            <div className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-widest text-[#C4A484] mb-3">Fee Trends (ACTUAL DATA)</h3>
              {ai.fee_trends.map((t, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b border-[rgba(244,200,66,0.05)] last:border-0">
                  <span className="text-sm text-[#F5F5F5] w-32">{t.platform}</span>
                  <span className="text-xs text-[#C4A484]">Avg: {t.average_fee}%</span>
                  <span className="text-xs text-[#C4A484]">Recent: {t.recent_fee}%</span>
                  <span className={`text-xs flex items-center gap-1 ${t.trend === "increasing" ? "text-[#8B0000]" : t.trend === "decreasing" ? "text-[#F4C842]" : "text-[#C4A484]"}`}>
                    {t.trend === "increasing" && <AlertTriangle size={12} />}
                    {t.trend === "decreasing" && <CheckCircle size={12} />}
                    {t.trend} ({t.change > 0 ? "+" : ""}{t.change}%)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Product Warnings */}
          {ai.product_warnings.length > 0 && (
            <div className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-widest text-[#8B0000] mb-3">Product Warnings — Margin Below Target</h3>
              {ai.product_warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 py-2 border-b border-[rgba(244,200,66,0.05)] last:border-0">
                  <AlertTriangle size={14} className={w.severity === "critical" ? "text-[#8B0000] mt-0.5" : "text-[#F4C842] mt-0.5"} />
                  <div>
                    <p className="text-sm text-[#F5F5F5]">{w.product} — {w.platform}</p>
                    <p className="text-xs text-[#C4A484]">{w.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-[#C4A484] text-center py-8">Loading...</p>}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4">
      <p className="text-xs uppercase tracking-widest text-[#C4A484] mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color || "text-[#F5F5F5]"}`}>{value}</p>
      {sub && <p className="text-xs text-[#C4A484] mt-1">{sub}</p>}
    </div>
  );
}

function FeeItem({ label, value, isText }) {
  return (
    <div>
      <p className="text-xs text-[#C4A484]">{label}</p>
      <p className="text-sm text-[#F5F5F5]">{isText ? value : formatIDR(value)}</p>
    </div>
  );
}
