import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import { TrendingUp, ShoppingBag, Users, AlertTriangle, DollarSign, Package } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import PageHeader from "../components/PageHeader";

function MetricCard({ icon: Icon, label, value, sublabel, testId }) {
  return (
    <div className="bg-[#14213D] gold-border rounded-lg p-6 card-hover" data-testid={testId}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-md bg-[rgba(212,175,55,0.1)] flex items-center justify-center">
          <Icon size={20} strokeWidth={1.5} className="text-[#D4AF37]" />
        </div>
      </div>
      <p className="text-xs uppercase tracking-widest text-[#94A3B8] mb-2">{label}</p>
      <p className="font-serif-luxury text-3xl text-[#F5F5F5]">{value}</p>
      {sublabel && <p className="text-xs text-[#94A3B8] mt-2">{sublabel}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/reports/dashboard");
        setData(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-10 text-[#94A3B8]">Memuat...</div>;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan performa bisnis Anda hari ini"
      />
      <div className="p-8 space-y-8">
        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard icon={DollarSign} label="Pendapatan Hari Ini" value={formatIDR(data.revenue_today)} sublabel={`${data.transactions_today} transaksi`} testId="metric-revenue-today" />
          <MetricCard icon={TrendingUp} label="Total Pendapatan" value={formatIDR(data.revenue_total)} sublabel={`${data.transactions_total} transaksi`} testId="metric-revenue-total" />
          <MetricCard icon={ShoppingBag} label="Item Terjual" value={data.items_sold_today} sublabel="hari ini" testId="metric-items-sold" />
          <MetricCard icon={Users} label="Pelanggan" value={data.customers_count} sublabel="terdaftar" testId="metric-customers" />
        </div>

        {/* Chart + Low Stock */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#14213D] gold-border rounded-lg p-6" data-testid="chart-revenue">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-widest text-[#94A3B8]">Tren 7 Hari</p>
              <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mt-1">Pendapatan Harian</h3>
            </div>
            <div className="h-64">
              {data.daily_revenue.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[#94A3B8] text-sm">Belum ada data penjualan</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily_revenue}>
                    <CartesianGrid stroke="rgba(212,175,55,0.1)" vertical={false} />
                    <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} />
                    <YAxis stroke="#94A3B8" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ background: '#0F1A3A', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 6, color: '#F5F5F5' }} formatter={(v) => formatIDR(v)} />
                    <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} dot={{ fill: '#D4AF37', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-[#14213D] gold-border rounded-lg p-6" data-testid="low-stock-panel">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} strokeWidth={1.5} className="text-[#D4AF37]" />
              <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Stok Menipis</h3>
            </div>
            {data.low_stock_items.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">Semua stok aman.</p>
            ) : (
              <ul className="space-y-3">
                {data.low_stock_items.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 border-b border-[rgba(212,175,55,0.1)] last:border-0">
                    <div>
                      <p className="text-sm text-[#F5F5F5]">{p.name}</p>
                      <p className="text-xs text-[#94A3B8]">{p.sku}</p>
                    </div>
                    <span className="text-sm text-[#8B0000] font-semibold">{p.stock} {p.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Top products */}
        <div className="bg-[#14213D] gold-border rounded-lg p-6" data-testid="top-products">
          <div className="mb-6 flex items-center gap-2">
            <Package size={18} strokeWidth={1.5} className="text-[#D4AF37]" />
            <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">Produk Terlaris</h3>
          </div>
          {data.top_products.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">Belum ada data.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[#94A3B8] border-b border-[rgba(212,175,55,0.15)]">
                  <th className="py-3">Produk</th>
                  <th className="py-3 text-right">Terjual</th>
                  <th className="py-3 text-right">Pendapatan</th>
                </tr>
              </thead>
              <tbody>
                {data.top_products.map((p, i) => (
                  <tr key={i} className="border-b border-[rgba(212,175,55,0.08)] last:border-0 hover:bg-[#1E2A4A] transition-colors">
                    <td className="py-3 text-[#F5F5F5]">{p.name}</td>
                    <td className="py-3 text-right text-[#94A3B8]">{p.quantity}</td>
                    <td className="py-3 text-right text-[#D4AF37]">{formatIDR(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
