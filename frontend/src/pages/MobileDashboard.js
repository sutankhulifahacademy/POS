import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { LayoutDashboard, TrendingUp, Bell, User, Store, ShoppingCart, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "sales", label: "Sales", icon: TrendingUp },
  { key: "alerts", label: "Alerts", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
];

export default function MobileDashboard() {
  const { outletIdForApi, outlets, selectedOutlet, setSelectedOutlet, allAccess } = useOutlet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      const { data: res } = await api.get(`/reports/dashboard?${params}`);
      setData(res);
    } catch (e) {
      toast.error("Gagal memuat dashboard");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = data?.total_revenue ?? data?.revenue ?? 0;
  const transactions = data?.total_transactions ?? data?.transactions ?? 0;
  const topOutlet = data?.top_outlet;
  const topProducts = data?.top_products || data?.top_items || [];
  const recentSales = data?.recent_sales || data?.recent_transactions || [];
  const alerts = data?.alerts || [];

  return (
    <div className="min-h-screen bg-[#1A0810] pb-24">
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan bisnis Anda"
        actions={
          <button
            onClick={load}
            className="flex items-center gap-2 bg-[#2A1015] text-[#C4A484] px-3 py-2 rounded-md text-sm border border-[rgba(244,200,66,0.3)]"
          >
            <RefreshCw size={16} />
          </button>
        }
      />

      <div className="p-4 space-y-5">
        {/* Outlet Selector */}
        {allAccess && (
          <select
            value={selectedOutlet || ""}
            onChange={(e) => setSelectedOutlet(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-lg px-4 py-3 text-[#F5F5F5] text-base"
          >
            <option value="">Semua Outlet</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}

        {loading ? (
          <div className="text-[#C4A484] text-lg py-10 text-center">Memuat...</div>
        ) : tab === "dashboard" ? (
          <>
            {/* Big Cards */}
            <div className="space-y-4">
              <div className="bg-[#331419] gold-border rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-full bg-[#F4C842]/15 flex items-center justify-center">
                    <TrendingUp size={24} className="text-[#F4C842]" />
                  </div>
                  <div>
                    <p className="text-sm text-[#C4A484]">Total Revenue</p>
                  </div>
                </div>
                <p className="text-3xl font-serif-luxury text-[#F4C842]">{formatIDR(totalRevenue)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#331419] gold-border rounded-2xl p-5">
                  <div className="w-10 h-10 rounded-full bg-[#F4C842]/15 flex items-center justify-center mb-2">
                    <ShoppingCart size={20} className="text-[#F4C842]" />
                  </div>
                  <p className="text-xs text-[#C4A484]">Transaksi</p>
                  <p className="text-2xl font-serif-luxury text-[#F5F5F5]">{transactions}</p>
                </div>
                <div className="bg-[#331419] gold-border rounded-2xl p-5">
                  <div className="w-10 h-10 rounded-full bg-[#F4C842]/15 flex items-center justify-center mb-2">
                    <Store size={20} className="text-[#F4C842]" />
                  </div>
                  <p className="text-xs text-[#C4A484]">Top Outlet</p>
                  <p className="text-base font-medium text-[#F5F5F5] truncate">{topOutlet?.name || topOutlet || "-"}</p>
                </div>
              </div>
            </div>

            {/* Top Products */}
            {topProducts.length > 0 && (
              <div className="bg-[#331419] gold-border rounded-2xl p-5">
                <h3 className="font-serif-luxury text-lg text-[#F5F5F5] mb-3">Produk Terlaris</h3>
                <div className="space-y-3">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-base text-[#F5F5F5]">{p.name || p.product_name}</span>
                      <span className="text-sm text-[#F4C842]">{p.qty || p.quantity || 0}x</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : tab === "sales" ? (
          <div className="bg-[#331419] gold-border rounded-2xl p-5">
            <h3 className="font-serif-luxury text-lg text-[#F5F5F5] mb-4">Penjualan Terbaru</h3>
            {recentSales.length === 0 ? (
              <p className="text-[#C4A484] text-center py-6">Belum ada transaksi</p>
            ) : (
              <div className="space-y-3">
                {recentSales.slice(0, 10).map((s, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-[rgba(244,200,66,0.08)] pb-3">
                    <div>
                      <p className="text-base text-[#F5F5F5]">{s.invoice_no || s.id}</p>
                      <p className="text-xs text-[#C4A484]">{s.outlet_name || s.date || ""}</p>
                    </div>
                    <span className="text-base text-[#F4C842]">{formatIDR(s.total || s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === "alerts" ? (
          <div className="bg-[#331419] gold-border rounded-2xl p-5">
            <h3 className="font-serif-luxury text-lg text-[#F5F5F5] mb-4">Notifikasi</h3>
            {alerts.length === 0 ? (
              <div className="text-center py-8">
                <Bell size={32} className="mx-auto mb-3 text-[#C4A484] opacity-50" />
                <p className="text-[#C4A484]">Tidak ada notifikasi</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((a, i) => (
                  <div key={i} className="bg-[#2A1015] rounded-lg p-4 border border-[rgba(244,200,66,0.15)]">
                    <p className="text-base text-[#F5F5F5]">{a.title || a.message}</p>
                    {a.detail && <p className="text-sm text-[#C4A484] mt-1">{a.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-2xl p-5">
            <h3 className="font-serif-luxury text-lg text-[#F5F5F5] mb-4">Profil</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#F4C842]/15 flex items-center justify-center">
                  <User size={32} className="text-[#F4C842]" />
                </div>
                <div>
                  <p className="text-lg text-[#F5F5F5]">Owner</p>
                  <p className="text-sm text-[#C4A484]">Multi-Outlet POS</p>
                </div>
              </div>
              <div className="bg-[#2A1015] rounded-lg p-4 border border-[rgba(244,200,66,0.15)]">
                <p className="text-sm text-[#C4A484]">Jumlah Outlet</p>
                <p className="text-xl text-[#F4C842]">{outlets.length}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2A1015] border-t border-[rgba(244,200,66,0.2)] z-20">
        <div className="grid grid-cols-4 max-w-md mx-auto">
          {NAV_ITEMS.map((n) => {
            const Icon = n.icon;
            const active = tab === n.key;
            return (
              <button
                key={n.key}
                onClick={() => setTab(n.key)}
                className={`flex flex-col items-center gap-1 py-3 transition-colors ${active ? "text-[#F4C842]" : "text-[#C4A484]"}`}
              >
                <Icon size={24} />
                <span className="text-xs">{n.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
