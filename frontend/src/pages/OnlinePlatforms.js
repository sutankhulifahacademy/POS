import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Plus, Trash, Edit, X, Smartphone, Save } from "lucide-react";
import { toast } from "sonner";

const FEE_CALC_BASES = [
  { value: "gross", label: "Gross Sales" },
  { value: "after_merchant_discount", label: "After Merchant Discount" },
  { value: "net", label: "Net Sales" },
  { value: "settlement_defined", label: "Settlement Defined" },
];

const emptyConfig = {
  outlet_id: "",
  commission_pct: 0,
  fixed_fee: 0,
  tax_on_fee_pct: 0,
  promo_merchant_pct: 0,
  promo_platform_pct: 0,
  advertising_fee: 0,
  other_fee_pct: 0,
  other_fixed_fee: 0,
  fee_calc_base: "gross",
  effective_date: new Date().toISOString().split("T")[0],
  note: "",
};

export default function OnlinePlatforms() {
  const { outlets, outletIdForApi, allAccess } = useOutlet();
  const [platforms, setPlatforms] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [configForm, setConfigForm] = useState(emptyConfig);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/online-platforms");
      setPlatforms(res.data);
      if (res.data.length > 0 && !selectedPlatform) {
        setSelectedPlatform(res.data[0]);
      }
    } catch (e) {
      toast.error("Gagal memuat platform");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfigs = useCallback(async () => {
    if (!selectedPlatform) return;
    try {
      const res = await api.get(`/online-platforms/${selectedPlatform.id}/fee-configs`);
      setConfigs(res.data);
    } catch (e) {
      toast.error("Gagal memuat fee config");
    }
  }, [selectedPlatform]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const openCreateConfig = () => {
    setConfigForm({ ...emptyConfig, outlet_id: outletIdForApi || "" });
    setEditingConfig(null);
    setShowConfigForm(true);
  };

  const openEditConfig = (c) => {
    setConfigForm({ ...c, outlet_id: c.outlet_id || "" });
    setEditingConfig(c);
    setShowConfigForm(true);
  };

  const saveConfig = async (e) => {
    e.preventDefault();
    const payload = { ...configForm, outlet_id: configForm.outlet_id || null };
    try {
      if (editingConfig) {
        await api.put(`/online-platforms/${selectedPlatform.id}/fee-configs/${editingConfig.id}`, payload);
        toast.success("Fee config diperbarui");
      } else {
        await api.post(`/online-platforms/${selectedPlatform.id}/fee-configs`, payload);
        toast.success("Fee config ditambahkan");
      }
      setShowConfigForm(false);
      loadConfigs();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan");
    }
  };

  const deleteConfig = async (id) => {
    if (!confirm("Hapus fee config ini?")) return;
    try {
      await api.delete(`/online-platforms/${selectedPlatform.id}/fee-configs/${id}`);
      toast.success("Fee config dihapus");
      loadConfigs();
    } catch (e) {
      toast.error("Gagal menghapus");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Online Platform" subtitle="Konfigurasi fee platform online (GrabFood, GoFood, ShopeeFood)" icon={Smartphone} />

      {/* Platform tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {platforms.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedPlatform(p)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border whitespace-nowrap transition-all ${selectedPlatform?.id === p.id ? "border-[#F4C842] bg-[rgba(244,200,66,0.1)]" : "border-[rgba(244,200,66,0.15)] hover:border-[rgba(244,200,66,0.3)]"}`}
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-sm text-[#F5F5F5]">{p.name}</span>
            {!p.is_active && <span className="text-xs text-[#8B0000]">Inactive</span>}
          </button>
        ))}
      </div>

      {selectedPlatform && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif-luxury text-xl text-[#F5F5F5]">Fee Configuration — {selectedPlatform.name}</h2>
            <button onClick={openCreateConfig} className="flex items-center gap-2 bg-[#F4C842] text-[#1A0A0F] px-4 py-2 rounded-md text-sm font-semibold hover:bg-[#E6B830]">
              <Plus size={16} /> New Fee Config
            </button>
          </div>

          {/* Config list */}
          <div className="space-y-3">
            {configs.length === 0 && <p className="text-[#C4A484] italic">Belum ada fee config.</p>}
            {configs.map(c => {
              const outletName = c.outlet_id ? (outlets.find(o => o.id === c.outlet_id)?.name || "Outlet") : "Global Default";
              return (
                <div key={c.id} className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${c.outlet_id ? "bg-[rgba(244,200,66,0.2)] text-[#F4C842]" : "bg-[rgba(196,164,132,0.2)] text-[#C4A484]"}`}>{outletName}</span>
                        <span className="text-xs text-[#C4A484]">Effective: {c.effective_date}{c.end_date ? ` → ${c.end_date}` : " → Active"}</span>
                        {!c.is_active && <span className="text-xs text-[#8B0000]">Inactive</span>}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        <div><span className="text-[#C4A484] text-xs">Commission</span><br /><span className="text-[#F5F5F5]">{c.commission_pct}%</span></div>
                        <div><span className="text-[#C4A484] text-xs">Fixed Fee</span><br /><span className="text-[#F5F5F5]">{Number(c.fixed_fee).toLocaleString("id-ID")}</span></div>
                        <div><span className="text-[#C4A484] text-xs">Tax on Fee</span><br /><span className="text-[#F5F5F5]">{c.tax_on_fee_pct}%</span></div>
                        <div><span className="text-[#C4A484] text-xs">Calc Base</span><br /><span className="text-[#F5F5F5]">{c.fee_calc_base}</span></div>
                        <div><span className="text-[#C4A484] text-xs">Merchant Promo</span><br /><span className="text-[#F5F5F5]">{c.promo_merchant_pct}%</span></div>
                        <div><span className="text-[#C4A484] text-xs">Platform Promo</span><br /><span className="text-[#F5F5F5]">{c.promo_platform_pct}%</span></div>
                        <div><span className="text-[#C4A484] text-xs">Advertising</span><br /><span className="text-[#F5F5F5]">{Number(c.advertising_fee).toLocaleString("id-ID")}</span></div>
                        <div><span className="text-[#C4A484] text-xs">Other Fee</span><br /><span className="text-[#F5F5F5]">{c.other_fee_pct}% + {Number(c.other_fixed_fee).toLocaleString("id-ID")}</span></div>
                      </div>
                      {c.note && <p className="text-xs text-[#C4A484] mt-2 italic">{c.note}</p>}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button onClick={() => openEditConfig(c)} className="text-[#C4A484] hover:text-[#F4C842]"><Edit size={16} /></button>
                      <button onClick={() => deleteConfig(c.id)} className="text-[#C4A484] hover:text-[#8B0000]"><Trash size={16} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Config Form Modal */}
      {showConfigForm && selectedPlatform && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowConfigForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={saveConfig} className="bg-[#1A0A0F] gold-border rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" data-testid="config-form">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">{editingConfig ? "Edit Fee Config" : "New Fee Config"} — {selectedPlatform.name}</h3>
              <button type="button" onClick={() => setShowConfigForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Outlet Scope</label>
                <select value={configForm.outlet_id} onChange={(e) => setConfigForm({ ...configForm, outlet_id: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" disabled={!!editingConfig}>
                  <option value="">Global Default</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Effective Date</label>
                <input type="date" value={configForm.effective_date} onChange={(e) => setConfigForm({ ...configForm, effective_date: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" disabled={!!editingConfig} required />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Commission %</label>
                <input type="number" step="0.01" value={configForm.commission_pct} onChange={(e) => setConfigForm({ ...configForm, commission_pct: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Fixed Fee</label>
                <input type="number" value={configForm.fixed_fee} onChange={(e) => setConfigForm({ ...configForm, fixed_fee: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Tax on Fee %</label>
                <input type="number" step="0.01" value={configForm.tax_on_fee_pct} onChange={(e) => setConfigForm({ ...configForm, tax_on_fee_pct: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Fee Calc Base</label>
                <select value={configForm.fee_calc_base} onChange={(e) => setConfigForm({ ...configForm, fee_calc_base: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]">
                  {FEE_CALC_BASES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Merchant Promo %</label>
                <input type="number" step="0.01" value={configForm.promo_merchant_pct} onChange={(e) => setConfigForm({ ...configForm, promo_merchant_pct: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Platform Promo %</label>
                <input type="number" step="0.01" value={configForm.promo_platform_pct} onChange={(e) => setConfigForm({ ...configForm, promo_platform_pct: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Advertising Fee</label>
                <input type="number" value={configForm.advertising_fee} onChange={(e) => setConfigForm({ ...configForm, advertising_fee: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Other Fee %</label>
                <input type="number" step="0.01" value={configForm.other_fee_pct} onChange={(e) => setConfigForm({ ...configForm, other_fee_pct: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Other Fixed Fee</label>
                <input type="number" value={configForm.other_fixed_fee} onChange={(e) => setConfigForm({ ...configForm, other_fixed_fee: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Note</label>
                <input type="text" value={configForm.note} onChange={(e) => setConfigForm({ ...configForm, note: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button type="submit" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0A0F] px-4 py-2 rounded-md text-sm font-semibold hover:bg-[#E6B830]">
                <Save size={16} /> {editingConfig ? "Update" : "Create"}
              </button>
              <button type="button" onClick={() => setShowConfigForm(false)} className="border border-[rgba(244,200,66,0.3)] text-[#F4C842] px-4 py-2 rounded-md text-sm">Batal</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
