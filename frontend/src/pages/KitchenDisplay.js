import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import { useAuth } from "../context/AuthContext";
import { Play, CheckCircle, UtensilsCrossed, RefreshCw, Clock, LogOut, LayoutDashboard, Store, Flame } from "lucide-react";
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
  const { outletIdForApi, outlets, selectedOutlet, setSelectedOutlet } = useOutlet();
  const { user, logout } = useAuth();
  const nav = useNavigate();
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
      await api.put(`/kds/orders/${id}/status?outlet_id=${outletIdForApi || ""}`, { status });
      toast.success(`Order ${status}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengubah status");
    }
  };

  const ordersByStatus = (status) => orders.filter((o) => o.status === status);
  const canSeeDashboard = user?.role === "owner" || user?.role === "admin" || user?.role === "manager" || user?.role === "supervisor";

  return (
    <div className="min-h-screen flex bg-[#1A0810]">
      <div className="flex-1 p-4 md:p-6 lg:p-8">
        {/* Header — same style as POS */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#F4C842] uppercase">Kitchen Display System</p>
            <h1 className="font-serif-luxury text-4xl text-[#F5F5F5]">Dapur</h1>
            <p className="text-xs text-[#C4A484] mt-1">Auto refresh 10 detik</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <button
              onClick={load}
              className="flex items-center gap-2 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#F4C842] hover:text-[#FFDD5C] px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors"
            >
              <RefreshCw size={14} strokeWidth={1.5} /> Refresh
            </button>
            <div className="flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
              <span className="text-[#C4A484]">{user?.name}</span>
              <span className="text-[10px] uppercase tracking-widest text-[#F4C842]">{user?.role}</span>
            </div>
            <div className="flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
              <Store size={14} className="text-[#F4C842]" />
              <span className="text-[#F5F5F5]">{outlets.find(o => o.id === selectedOutlet)?.name || "Pilih Outlet"}</span>
            </div>
            {canSeeDashboard && (
              <button
                onClick={() => nav("/dashboard")}
                data-testid="kds-dashboard-btn"
                className="flex items-center gap-2 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#F4C842] hover:text-[#FFDD5C] px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors"
              >
                <LayoutDashboard size={14} strokeWidth={1.5} /> Dashboard
              </button>
            )}
            <button
              onClick={async () => { await logout(); nav("/login"); }}
              className="flex items-center gap-2 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#C4A484] hover:text-[#F5F5F5] px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors"
            >
              <LogOut size={14} strokeWidth={1.5} /> Keluar
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Total Aktif</p>
              <p className="text-2xl text-[#F4C842] font-serif-luxury">{orders.length}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">New</p>
              <p className="text-2xl text-[#F5F5F5] font-serif-luxury">{ordersByStatus("new").length}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Preparing</p>
              <p className="text-2xl text-[#F5F5F5] font-serif-luxury">{ordersByStatus("preparing").length}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Ready</p>
              <p className="text-2xl text-[#F5F5F5] font-serif-luxury">{ordersByStatus("ready").length}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Avg Wait</p>
              <p className="text-2xl text-[#F4C842] font-serif-luxury">{stats.avg_wait || 0}s</p>
            </div>
          </div>
        )}

        {/* Kanban columns */}
        {loading ? (
          <div className="text-[#C4A484] text-center py-20">Memuat...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COLUMNS.map((col) => {
              const list = ordersByStatus(col.key);
              return (
                <div key={col.key} className="bg-[#2A1015]/50 rounded-lg p-3 min-h-[300px]">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-[rgba(244,200,66,0.15)]">
                    <h3 className="font-serif-luxury text-lg flex items-center gap-2" style={{ color: col.color }}>
                      {col.key === "new" && <Flame size={16} />}
                      {col.key === "preparing" && <Clock size={16} />}
                      {col.key === "ready" && <CheckCircle size={16} />}
                      {col.label}
                    </h3>
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
                                <p className="text-xs text-[#C4A484]">Meja: {o.table_no || "Takeaway"}</p>
                              </div>
                              <div className={`flex items-center gap-1 text-xs ${elapsedColor(min)}`}>
                                <Clock size={12} /> {min}m
                              </div>
                            </div>
                            <div className="space-y-1 border-t border-[rgba(244,200,66,0.1)] pt-2">
                              {o.items?.map((it, i) => (
                                <div key={i} className="flex justify-between text-xs text-[#F5F5F5]">
                                  <span>{it.qty || it.quantity || 1}x {it.name || it.menu_name || it.item_name}</span>
                                  {it.note && <span className="text-[#C4A484] italic block w-full">{it.note}</span>}
                                </div>
                              )) || <p className="text-xs text-[#C4A484]">Tidak ada item</p>}
                            </div>
                            <div className="flex gap-2 pt-1">
                              {col.key === "new" && (
                                <button
                                  onClick={() => changeStatus(o.id, "preparing")}
                                  className="flex-1 flex items-center justify-center gap-1 bg-[#F4C842] text-[#1A0810] px-2 py-2 rounded text-xs font-medium hover:bg-[#E6B835] transition-colors"
                                >
                                  <Play size={12} /> Start Masak
                                </button>
                              )}
                              {col.key === "preparing" && (
                                <button
                                  onClick={() => changeStatus(o.id, "ready")}
                                  className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white px-2 py-2 rounded text-xs font-medium hover:bg-green-500 transition-colors"
                                >
                                  <CheckCircle size={12} /> Selesai
                                </button>
                              )}
                              {col.key === "ready" && (
                                <button
                                  onClick={() => changeStatus(o.id, "served")}
                                  className="flex-1 flex items-center justify-center gap-1 bg-[#C4A484] text-[#1A0810] px-2 py-2 rounded text-xs font-medium hover:bg-[#B4936F] transition-colors"
                                >
                                  <UtensilsCrossed size={12} /> Sajikan
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
