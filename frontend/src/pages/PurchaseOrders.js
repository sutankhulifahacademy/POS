import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, X, PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const [o, s, p] = await Promise.all([api.get("/purchase-orders"), api.get("/suppliers"), api.get("/products")]);
    setOrders(o.data); setSuppliers(s.data); setProducts(p.data);
  };
  useEffect(() => { load(); }, []);

  const addLine = () => setItems([...items, { product_id: "", name: "", quantity: 1, cost: 0 }]);
  const updateLine = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeLine = (idx) => setItems(items.filter((_, i) => i !== idx));

  const total = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.cost)), 0);

  const submit = async (e) => {
    e.preventDefault();
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return toast.error("Pilih supplier");
    if (items.length === 0) return toast.error("Tambahkan item");
    for (const it of items) if (!it.product_id) return toast.error("Setiap item harus memilih produk");
    try {
      await api.post("/purchase-orders", {
        supplier_id: supplierId,
        supplier_name: supplier.name,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, quantity: Number(i.quantity), cost: Number(i.cost) })),
        note,
      });
      toast.success("PO dibuat");
      setShowForm(false); setSupplierId(""); setItems([]); setNote("");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const receive = async (id) => {
    if (!window.confirm("Terima barang & tambahkan stok?")) return;
    try {
      await api.post(`/purchase-orders/${id}/receive`);
      toast.success("Barang diterima, stok bertambah");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Hapus PO draft?")) return;
    try { await api.delete(`/purchase-orders/${id}`); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title="Purchase Order" subtitle="Buat pesanan ke supplier, terima barang, stok otomatis bertambah" actions={
        <button onClick={() => setShowForm(true)} data-testid="add-po-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
          <Plus size={16} /> Buat PO
        </button>
      } />
      <div className="p-8">
        <div className="bg-[#331419] gold-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                <th className="px-6 py-4">No. PO</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Tanggal</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-[#C4A484]">Belum ada PO</td></tr>}
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors" data-testid={`po-row-${o.id}`}>
                  <td className="px-6 py-3 text-sm text-[#F4C842] cursor-pointer" onClick={() => setDetail(o)}>{o.po_no}</td>
                  <td className="px-6 py-3 text-sm text-[#F5F5F5]">{o.supplier_name}</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(o.created_at).toLocaleString("id-ID")}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${o.status === "received" ? "bg-[#2E8B57]/20 text-[#2E8B57]" : "bg-[#F4C842]/20 text-[#F4C842]"}`}>{o.status}</span>
                  </td>
                  <td className="px-6 py-3 text-right text-sm text-[#F5F5F5]">{formatIDR(o.total)}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {o.status === "draft" && (
                        <>
                          <button onClick={() => receive(o.id)} data-testid={`po-receive-${o.id}`} className="flex items-center gap-1 text-xs text-[#2E8B57] hover:text-[#3EA867] transition-colors"><PackageCheck size={14} strokeWidth={1.5} /> Terima</button>
                          <button onClick={() => remove(o.id)} className="text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={14} strokeWidth={1.5} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">Buat Purchase Order</h2>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Supplier</label>
                <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="po-supplier">
                  <option value="">-- Pilih Supplier --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484]">Item Barang</label>
                  <button type="button" onClick={addLine} data-testid="po-add-line" className="text-xs text-[#F4C842] hover:text-[#FFDD5C] flex items-center gap-1"><Plus size={12} /> Tambah baris</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <select value={it.product_id} onChange={(e) => {
                        const p = products.find(pr => pr.id === e.target.value);
                        updateLine(idx, { product_id: e.target.value, name: p?.name || "", cost: p?.cost || 0 });
                      }} className="col-span-6 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]">
                        <option value="">Pilih produk</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="number" value={it.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} placeholder="Qty" className="col-span-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                      <input type="number" value={it.cost} onChange={(e) => updateLine(idx, { cost: e.target.value })} placeholder="Harga modal" className="col-span-3 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                      <button type="button" onClick={() => removeLine(idx)} className="col-span-1 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-[#C4A484] italic">Belum ada item. Klik "Tambah baris".</p>}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-[rgba(244,200,66,0.15)]">
                <p className="text-sm text-[#C4A484]">Total Estimasi</p>
                <p className="text-2xl font-serif-luxury text-[#F4C842]">{formatIDR(total)}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors">Batal</button>
                <button type="submit" data-testid="po-submit" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Simpan PO</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-lg w-full p-8">
            <h3 className="font-serif-luxury text-2xl text-[#F4C842]">{detail.po_no}</h3>
            <p className="text-xs text-[#C4A484] mb-4">{detail.supplier_name} · {new Date(detail.created_at).toLocaleString("id-ID")}</p>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-[#C4A484] text-xs uppercase border-b border-[rgba(244,200,66,0.15)]">
                  <th className="py-2 text-left">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Modal</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i, idx) => (
                  <tr key={idx} className="border-b border-[rgba(244,200,66,0.08)]">
                    <td className="py-2 text-[#F5F5F5]">{i.name}</td>
                    <td className="py-2 text-right text-[#C4A484]">{i.quantity}</td>
                    <td className="py-2 text-right text-[#C4A484]">{formatIDR(i.cost)}</td>
                    <td className="py-2 text-right text-[#F5F5F5]">{formatIDR(i.quantity * i.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between text-lg text-[#F4C842] font-semibold border-t border-dashed border-[rgba(244,200,66,0.2)] pt-3"><span>Total</span><span>{formatIDR(detail.total)}</span></div>
            <button onClick={() => setDetail(null)} className="mt-6 w-full bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
