import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, Minus, History } from "lucide-react";
import { toast } from "sonner";
import { useOutlet } from "../context/OutletContext";

export default function Inventory() {
  const { outletIdForApi } = useOutlet();
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("restock");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("adjust");

  const load = useCallback(async () => {
    try {
      const oParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
      const [p, m] = await Promise.all([
        api.get(`/products${oParam}`),
        api.get(`/inventory/movements${oParam}`),
      ]);
      setProducts(p.data);
      setMovements(m.data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Gagal memuat data");
    }
  }, [outletIdForApi]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return toast.error("Pilih produk");
    try {
      await api.post("/inventory/adjust", { product_id: selected, delta: Number(delta), reason, note, outlet_id: outletIdForApi || undefined });
      toast.success("Stok berhasil disesuaikan");
      setSelected(null); setDelta(0); setNote("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal");
    }
  };

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Sesuaikan stok, lihat riwayat pergerakan, dan pantau stok rendah" />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex gap-3 mb-6">
          <button onClick={() => setTab("adjust")} data-testid="tab-adjust" className={`px-5 py-2 rounded-md text-sm uppercase tracking-wider transition-colors ${tab === "adjust" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}>Penyesuaian</button>
          <button onClick={() => setTab("history")} data-testid="tab-history" className={`px-5 py-2 rounded-md text-sm uppercase tracking-wider transition-colors ${tab === "history" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}>Riwayat</button>
        </div>

        {tab === "adjust" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            <form action="javascript:void(0)" onSubmit={submit} className="bg-[#331419] gold-border rounded-lg p-6 space-y-4" data-testid="adjust-form">
              <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Sesuaikan Stok</h3>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Produk</label>
                <select value={selected || ""} onChange={(e) => setSelected(e.target.value)} required className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="adjust-product">
                  <option value="">-- Pilih Produk --</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stok: {p.stock})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Perubahan Stok (+/-)</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setDelta(Number(delta) - 1)} className="w-10 h-10 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Minus size={16} className="mx-auto" /></button>
                  <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="flex-1 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5] text-center" data-testid="adjust-delta" />
                  <button type="button" onClick={() => setDelta(Number(delta) + 1)} className="w-10 h-10 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Plus size={16} className="mx-auto" /></button>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Alasan</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="adjust-reason">
                  <option value="restock">Restock (barang masuk)</option>
                  <option value="adjustment">Penyesuaian</option>
                  <option value="return">Retur</option>
                  <option value="damage">Rusak/Hilang</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
              </div>
              <button type="submit" data-testid="adjust-submit" className="w-full bg-[#F4C842] text-[#1A0810] py-3 rounded-md font-semibold uppercase tracking-widest text-sm hover:bg-[#FFDD5C] transition-colors">Simpan Penyesuaian</button>
            </form>

            <div className="bg-[#331419] gold-border rounded-lg p-6">
              <h3 className="font-serif-luxury text-xl text-[#F5F5F5] mb-4">Ringkasan Stok</h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {products.map((p) => (
                  <div key={p.id} className="flex justify-between py-2 border-b border-[rgba(244,200,66,0.08)] last:border-0">
                    <div>
                      <p className="text-sm text-[#F5F5F5]">{p.name}</p>
                      <p className="text-xs text-[#C4A484]">{p.sku}</p>
                    </div>
                    <span className={`text-sm font-semibold ${p.stock <= (p.low_stock_threshold || 5) ? 'text-[#8B0000]' : 'text-[#F4C842]'}`}>{p.stock} {p.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                  <th className="px-6 py-4">Waktu</th>
                  <th className="px-6 py-4">Produk</th>
                  <th className="px-6 py-4">Alasan</th>
                  <th className="px-6 py-4 text-right">Perubahan</th>
                  <th className="px-6 py-4">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-[#C4A484]"><History size={40} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />Belum ada pergerakan stok</td></tr>}
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors">
                    <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(m.created_at).toLocaleString("id-ID")}</td>
                    <td className="px-6 py-3 text-sm text-[#F5F5F5]">{m.product_name}</td>
                    <td className="px-6 py-3 text-xs text-[#C4A484] uppercase">{m.reason}</td>
                    <td className={`px-6 py-3 text-right text-sm font-semibold ${m.delta > 0 ? 'text-[#2E8B57]' : 'text-[#8B0000]'}`}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                    <td className="px-6 py-3 text-xs text-[#C4A484]">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
