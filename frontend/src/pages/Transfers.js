import { useEffect, useState } from "react";
import api from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, X, Trash2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { useOutlet } from "../context/OutletContext";

export default function Transfers() {
  const { outlets: globalOutlets, outletIdForApi } = useOutlet();
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [fromOutlet, setFromOutlet] = useState(outletIdForApi || "");
  const [toOutlet, setToOutlet] = useState("");
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const oParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
    const [t, p] = await Promise.all([
      api.get(`/stock-transfers${oParam}`),
      api.get(`/products${oParam}`),
    ]);
    setTransfers(t.data); setProducts(p.data);
  };
  useEffect(() => { load(); }, [outletIdForApi]);

  const addLine = () => setItems([...items, { product_id: "", name: "", quantity: 1 }]);
  const updateLine = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeLine = (idx) => setItems(items.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    if (!fromOutlet || !toOutlet) return toast.error("Pilih outlet sumber & tujuan");
    if (fromOutlet === toOutlet) return toast.error("Outlet sumber & tujuan tidak boleh sama");
    if (items.length === 0) return toast.error("Tambahkan minimal 1 item");
    for (const it of items) if (!it.product_id || it.quantity <= 0) return toast.error("Setiap item harus lengkap");
    const from = globalOutlets.find(o => o.id === fromOutlet);
    const to = globalOutlets.find(o => o.id === toOutlet);
    try {
      await api.post("/stock-transfers", {
        from_outlet_id: fromOutlet, to_outlet_id: toOutlet,
        from_outlet_name: from.name, to_outlet_name: to.name,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, quantity: Number(i.quantity) })),
        note,
      });
      toast.success("Transfer stok berhasil");
      setShowForm(false); setFromOutlet(""); setToOutlet(""); setItems([]); setNote("");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title="Transfer Antar Outlet" subtitle="Pindahkan stok dari satu outlet ke outlet lain tanpa buka PO" actions={
        <button onClick={() => setShowForm(true)} data-testid="add-transfer-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
          <Plus size={16} /> Buat Transfer
        </button>
      } />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                <th className="px-6 py-4">No. Transfer</th>
                <th className="px-6 py-4">Dari</th>
                <th className="px-6 py-4"></th>
                <th className="px-6 py-4">Ke</th>
                <th className="px-6 py-4">Item</th>
                <th className="px-6 py-4">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-[#C4A484]"><ArrowRightLeft size={40} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />Belum ada transfer</td></tr>}
              {transfers.map((t) => (
                <tr key={t.id} onClick={() => setDetail(t)} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors cursor-pointer" data-testid={`transfer-row-${t.id}`}>
                  <td className="px-6 py-3 text-sm text-[#F4C842]">{t.transfer_no}</td>
                  <td className="px-6 py-3 text-sm text-[#F5F5F5]">{t.from_outlet_name}</td>
                  <td className="px-6 py-3 text-[#F4C842]"><ArrowRightLeft size={16} /></td>
                  <td className="px-6 py-3 text-sm text-[#F5F5F5]">{t.to_outlet_name}</td>
                  <td className="px-6 py-3 text-sm text-[#C4A484]">{t.total_quantity} unit ({t.items.length} produk)</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(t.created_at).toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-3xl mx-4 w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">Buat Transfer Stok</h2>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Dari Outlet</label>
                  <select required value={fromOutlet} onChange={(e) => setFromOutlet(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="transfer-from">
                    <option value="">Pilih outlet sumber</option>
                    {globalOutlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Ke Outlet</label>
                  <select required value={toOutlet} onChange={(e) => setToOutlet(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="transfer-to">
                    <option value="">Pilih outlet tujuan</option>
                    {globalOutlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484]">Item Transfer</label>
                  <button type="button" onClick={addLine} data-testid="transfer-add-line" className="text-xs text-[#F4C842] hover:text-[#FFDD5C] flex items-center gap-1"><Plus size={16} /> Tambah baris</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="overflow-x-auto">
                      <div className="grid grid-cols-12 gap-2 items-center min-w-[700px]">
                        <select value={it.product_id} onChange={(e) => {
                          const p = products.find(pr => pr.id === e.target.value);
                          updateLine(idx, { product_id: e.target.value, name: p?.name || "" });
                        }} className="col-span-8 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]">
                          <option value="">Pilih produk</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name} (stok: {p.stock})</option>)}
                        </select>
                        <input type="number" min="1" value={it.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} placeholder="Qty" className="col-span-3 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                        <button type="button" onClick={() => removeLine(idx)} className="col-span-1 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-[#C4A484] italic">Belum ada item. Klik "Tambah baris".</p>}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" placeholder="Alasan transfer, dll." />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors">Batal</button>
                <button type="submit" data-testid="transfer-submit" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Konfirmasi Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-lg mx-4 w-full p-8">
            <h3 className="font-serif-luxury text-2xl text-[#F4C842] text-center">{detail.transfer_no}</h3>
            <div className="flex items-center justify-center gap-3 text-sm text-[#C4A484] my-3">
              <span className="text-[#F5F5F5]">{detail.from_outlet_name}</span>
              <ArrowRightLeft size={16} className="text-[#F4C842]" />
              <span className="text-[#F5F5F5]">{detail.to_outlet_name}</span>
            </div>
            <p className="text-xs text-[#C4A484] text-center mb-4">{new Date(detail.created_at).toLocaleString("id-ID")} · oleh {detail.created_by_name}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#C4A484] text-xs uppercase border-b border-[rgba(244,200,66,0.15)]">
                  <th className="py-2 text-left">Item</th>
                  <th className="py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i, idx) => (
                  <tr key={idx} className="border-b border-[rgba(244,200,66,0.08)]">
                    <td className="py-2 text-[#F5F5F5]">{i.name}</td>
                    <td className="py-2 text-right text-[#F4C842]">{i.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.note && <p className="text-xs text-[#C4A484] italic mt-3">"{detail.note}"</p>}
            <button onClick={() => setDetail(null)} className="mt-6 w-full bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
