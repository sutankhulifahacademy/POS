import { useState, useEffect, useCallback, useRef } from "react";
import api from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Play, CheckCircle, UtensilsCrossed, RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";

const COLUMNS = [
  { key: "new", label: "New Orders", color: "#F4C842" },
  { key: "preparing", label: "Preparing", color: "#C4A484" },
  { key: "ready", label: "Ready", color: "#22c55e" },
];

function getElapsedMin(createdAt) {
  if (!createdAt) return 0;
  const diff = (Date.now() - new Date(createdAt).getTime()) / 60000;
  return Math.max(0, Math.floor(diff));
}

function elapsedColor(min) {
  if (min < 5) return "text-green-400";
  if (min <= 10) return "text-yellow-400";
  return "text-red-400";
}

export default function KitchenDisplay() {
  const { outletIdForApi } = useOutlet();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      const q = params.toString();
      const [ordRes, statRes] = await Promise.all([
        api.get(`/kds/orders${q ? `?${q}` : ""}`),
        api.get(`/kds/stats${q ? `?${q}` : ""}`),
      ]);
      setOrders(ordRes.data || []);
      setStats(statRes.data);
    } catch (e) {
      // silent fail on auto-refresh
      if (loading) toast.error("Gagal memuat order KDS");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi, loading]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 10000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const changeStatus = async (id, status) => {
    try {
      await api.put(`/kds/orders/${id}/status`, { status });
      toast.success(`Order ${status}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengubah status");
    }
  };

  const ordersByStatus = (status) => orders.filter((o) => o.status === status);

  return (
    <div>
      <PageHeader
        title="Kitchen Display"
        subtitle="Antrian pesanan dapur - auto refresh 10 detik"
        actions={
          <button
            onClick={load}
            className="flex items-center gap-2 bg-[#2A1015] text-[#C4A484] px-3 py-2 rounded-md text-sm border border-[rgba(244,200,66,0.3)] hover:text-[#F4C842]"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Total Aktif</p>
              <p className="text-lg text-[#F4C842]">{stats.total_active ?? orders.length}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">New</p>
              <p className="text-lg text-[#F5F5F5]">{ordersByStatus("new").length}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Preparing</p>
              <p className="text-lg text-[#F5F5F5]">{ordersByStatus("preparing").length}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Ready</p>
              <p className="text-lg text-[#F5F5F5]">{ordersByStatus("ready").length}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COLUMNS.map((col) => {
              const list = ordersByStatus(col.key);
              return (
                <div key={col.key} className="bg-[#2A1015]/50 rounded-lg p-3 min-h-[200px]">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-[rgba(244,200,66,0.15)]">
                    <h3 className="font-serif-luxury text-base" style={{ color: col.color }}>{col.label}</h3>
                    <span className="text-xs text-[#C4A484] bg-[#331419] px-2 py-0.5 rounded">{list.length}</span>
                  </div>
                  <div className="space-y-3">
                    {list.length === 0 ? (
                      <p className="text-xs text-[#C4A484] text-center py-8 opacity-60">Tidak ada order</p>
                    ) : (
                      list.map((o) => {
                        const min = getElapsedMin(o.created_at);
                        return (
                          <div key={o.id} className="bg-[#331419] gold-border rounded-lg p-3 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-medium text-[#F5F5F5]">{o.invoice_no}</p>
                                <p className="text-xs text-[#C4A484]">Meja: {o.table_no || "-"}</p>
                              </div>
                              <div className={`flex items-center gap-1 text-xs ${elapsedColor(min)}`}>
                                <Clock size={12} /> {min}m
                              </div>
                            </div>
                            <div className="space-y-1 border-t border-[rgba(244,200,66,0.1)] pt-2">
                              {o.items?.map((it, i) => (
                                <div key={i} className="flex justify-between text-xs text-[#F5F5F5]">
                                  <span>{it.qty || it.quantity || 1}x {it.name || it.menu_name || it.item_name}</span>
                                  {it.notes && <span className="text-[#C4A484] italic">{it.notes}</span>}
                                </div>
                              )) || <p className="text-xs text-[#C4A484]">Tidak ada item</p>}
                            </div>
                            <div className="flex gap-2 pt-1">
                              {col.key === "new" && (
                                <button
                                  onClick={() => changeStatus(o.id, "preparing")}
                                  className="flex-1 flex items-center justify-center gap-1 bg-[#F4C842] text-[#1A0810] px-2 py-1.5 rounded text-xs font-medium hover:bg-[#E6B835]"
                                >
                                  <Play size={12} /> Start
                                </button>
                              )}
                              {col.key === "preparing" && (
                                <button
                                  onClick={() => changeStatus(o.id, "ready")}
                                  className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-green-500"
                                >
                                  <CheckCircle size={12} /> Complete
                                </button>
                              )}
                              {col.key === "ready" && (
                                <button
                                  onClick={() => changeStatus(o.id, "served")}
                                  className="flex-1 flex items-center justify-center gap-1 bg-[#C4A484] text-[#1A0810] px-2 py-1.5 rounded text-xs font-medium hover:bg-[#B4936F]"
                                >
                                  <UtensilsCrossed size={12} /> Serve
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
