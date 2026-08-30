import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Award, Star, Plus, Minus, Users } from "lucide-react";
import { toast } from "sonner";

const TIER_STYLES = {
  bronze: { color: "#CD7F32", label: "Bronze", icon: Award },
  silver: { color: "#C0C0C0", label: "Silver", icon: Award },
  gold: { color: "#F4C842", label: "Gold", icon: Star },
  platinum: { color: "#E5E4E2", label: "Platinum", icon: Star },
};

export default function Loyalty() {
  const { outletIdForApi } = useOutlet();
  const [tiers, setTiers] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ points: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      const [tierRes, memRes] = await Promise.all([
        api.get("/loyalty/tiers"),
        api.get(`/loyalty/memberships?${params}`),
      ]);
      setTiers(tierRes.data || []);
      setMemberships(memRes.data || []);
    } catch (e) {
      toast.error("Gagal memuat data loyalty");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  useEffect(() => { load(); }, [load]);

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const pts = parseInt(adjustForm.points, 10);
    if (!pts || pts === 0) {
      toast.error("Masukkan jumlah poin (bukan 0)");
      return;
    }
    try {
      await api.post("/loyalty/adjust-points", {
        membership_id: adjustTarget.id,
        points: pts,
        reason: adjustForm.reason,
      });
      toast.success("Poin disesuaikan");
      setAdjustTarget(null);
      setAdjustForm({ points: "", reason: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyesuaikan poin");
    }
  };

  const getTierStyle = (name) => TIER_STYLES[name?.toLowerCase()] || { color: "#C4A484", label: name, icon: Award };

  return (
    <div>
      <PageHeader title="Loyalty Program" subtitle="Program loyalitas pelanggan" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Tier Cards */}
        <div>
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5] mb-4">Tier Membership</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tiers.length === 0 ? (
              <div className="col-span-full bg-[#331419] gold-border rounded-lg p-6 text-center text-[#C4A484]">
                Belum ada tier
              </div>
            ) : (
              tiers.map((t) => {
                const style = getTierStyle(t.name);
                const Icon = style.icon;
                return (
                  <div key={t.id} className="bg-[#331419] gold-border rounded-lg p-5 text-center">
                    <div
                      className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3"
                      style={{ backgroundColor: `${style.color}22`, border: `1px solid ${style.color}` }}
                    >
                      <Icon size={24} style={{ color: style.color }} />
                    </div>
                    <p className="font-serif-luxury text-lg" style={{ color: style.color }}>{style.label}</p>
                    <p className="text-xs text-[#C4A484] mt-1">Min. Belanja</p>
                    <p className="text-sm text-[#F5F5F5]">{formatIDR(t.threshold)}</p>
                    {t.points_rate && (
                      <p className="text-xs text-[#C4A484] mt-2">Rate: {t.points_rate}x</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Memberships Table */}
        <div className="flex justify-between items-center">
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Daftar Member</h3>
        </div>

        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : memberships.length === 0 ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <Users size={32} className="mx-auto mb-3 opacity-50" />
            Belum ada member
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(244,200,66,0.2)]">
                  <th className="text-left py-3 px-4 text-[#C4A484]">Pelanggan</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Tier</th>
                  <th className="text-right py-3 px-4 text-[#C4A484]">Poin</th>
                  <th className="text-right py-3 px-4 text-[#C4A484]">Total Belanja</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => {
                  const style = getTierStyle(m.tier);
                  return (
                    <tr key={m.id} className="border-b border-[rgba(244,200,66,0.08)]">
                      <td className="py-3 px-4 text-[#F5F5F5]">{m.customer_name}</td>
                      <td className="py-3 px-4">
                        <span
                          className="text-xs uppercase px-2 py-0.5 rounded"
                          style={{ color: style.color, backgroundColor: `${style.color}22` }}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-[#F4C842] font-medium">{m.points}</td>
                      <td className="py-3 px-4 text-right text-[#F5F5F5]">{formatIDR(m.total_spent)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setAdjustTarget(m); setAdjustForm({ points: "", reason: "" }); }}
                            className="text-[#F4C842] hover:text-[#E6B835] text-xs px-2 py-1 rounded border border-[rgba(244,200,66,0.3)]"
                          >
                            Adjust Poin
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Adjust Points Modal */}
        {adjustTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setAdjustTarget(null)}>
            <form
              onSubmit={handleAdjust}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#331419] gold-border rounded-lg p-6 w-full max-w-md space-y-4"
            >
              <h3 className="font-serif-luxury text-lg text-[#F5F5F5]">
                Adjust Poin - {adjustTarget.customer_name}
              </h3>
              <p className="text-xs text-[#C4A484]">Poin saat ini: {adjustTarget.points}</p>
              <div>
                <label className="text-xs text-[#C4A484]">Jumlah Poin (+/-)</label>
                <input
                  type="number"
                  value={adjustForm.points}
                  onChange={(e) => setAdjustForm({ ...adjustForm, points: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  placeholder="contoh: 100 atau -50"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Alasan</label>
                <input
                  type="text"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  placeholder="Koreksi poin / bonus"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-[#F4C842] text-[#1A0810] px-6 py-2 rounded-md text-sm font-medium">Simpan</button>
                <button type="button" onClick={() => setAdjustTarget(null)} className="bg-[#2A1015] text-[#C4A484] px-6 py-2 rounded-md text-sm">Batal</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
