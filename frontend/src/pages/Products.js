import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, Edit3, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", sku: "", barcode: "", category_id: "", price: 0, cost: 0, stock: 0, low_stock_threshold: 5, unit: "pcs", image_url: "", description: "", is_active: true, variants: [] };

export default function Products() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");

  const load = async () => {
    const [p, c] = await Promise.all([api.get("/products"), api.get("/categories")]);
    setItems(p.data); setCategories(c.data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditing(null); setShowForm(true); };
  const openEdit = (p) => { setForm({ ...empty, ...p, variants: p.variants || [] }); setEditing(p.id); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price), cost: Number(form.cost), stock: Number(form.stock), low_stock_threshold: Number(form.low_stock_threshold),
      variants: (form.variants || []).map(v => ({ name: v.name, sku: v.sku || "", price: Number(v.price), stock: Number(v.stock) })),
    };
    try {
      if (editing) await api.put(`/products/${editing}`, payload);
      else await api.post("/products", payload);
      toast.success(editing ? "Produk diperbarui" : "Produk ditambahkan");
      setShowForm(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Hapus produk ini?")) return;
    try { await api.delete(`/products/${id}`); toast.success("Produk dihapus"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal menghapus"); }
  };

  const addVariant = () => setForm({ ...form, variants: [...(form.variants || []), { name: "", sku: "", price: form.price || 0, stock: 0 }] });
  const updateVariant = (idx, patch) => setForm({ ...form, variants: form.variants.map((v, i) => i === idx ? { ...v, ...patch } : v) });
  const removeVariant = (idx) => setForm({ ...form, variants: form.variants.filter((_, i) => i !== idx) });

  const filtered = items.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Produk"
        subtitle="Kelola katalog produk, varian, harga, dan stok"
        actions={
          <button onClick={openNew} data-testid="add-product-btn" className="flex items-center gap-2 bg-[#D4AF37] text-[#0A1128] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFD700] transition-colors">
            <Plus size={16} strokeWidth={2} /> Tambah Produk
          </button>
        }
      />
      <div className="p-8">
        <div className="mb-6 relative max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" strokeWidth={1.5} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk..." className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md pl-12 pr-4 py-3 text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]" data-testid="products-search" />
        </div>

        <div className="bg-[#14213D] gold-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#94A3B8] border-b border-[rgba(212,175,55,0.15)]">
                <th className="px-6 py-4">Produk</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4">Varian</th>
                <th className="px-6 py-4 text-right">Harga</th>
                <th className="px-6 py-4 text-right">Stok</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-[#94A3B8]">Belum ada produk. Tambahkan produk pertama Anda.</td></tr>}
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-[rgba(212,175,55,0.08)] last:border-0 hover:bg-[#1E2A4A] transition-colors" data-testid={`product-row-${p.id}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {p.image_url ? <img src={p.image_url} alt="" className="w-10 h-10 rounded-md object-cover" /> : <div className="w-10 h-10 rounded-md bg-[#1E2A4A]" />}
                      <div>
                        <p className="text-sm text-[#F5F5F5]">{p.name}</p>
                        <p className="text-xs text-[#94A3B8]">{p.unit}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#94A3B8]">{p.sku}</td>
                  <td className="px-6 py-4 text-sm text-[#94A3B8]">{p.variants?.length ? `${p.variants.length} varian` : "—"}</td>
                  <td className="px-6 py-4 text-right text-sm text-[#D4AF37]">{formatIDR(p.price)}</td>
                  <td className="px-6 py-4 text-right"><span className={`text-sm ${p.stock <= (p.low_stock_threshold || 5) ? 'text-[#8B0000]' : 'text-[#F5F5F5]'}`}>{p.stock}</span></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`} className="p-2 text-[#94A3B8] hover:text-[#D4AF37]"><Edit3 size={15} /></button>
                      <button onClick={() => remove(p.id)} data-testid={`delete-product-${p.id}`} className="p-2 text-[#94A3B8] hover:text-[#8B0000]"><Trash2 size={15} /></button>
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
          <div onClick={(e) => e.stopPropagation()} className="bg-[#0F1A3A] gold-border rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgba(212,175,55,0.15)] flex items-center justify-between">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">{editing ? "Edit Produk" : "Tambah Produk"}</h2>
              <button onClick={() => setShowForm(false)} className="text-[#94A3B8] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form onSubmit={save} className="p-6 space-y-6" data-testid="product-form">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Nama Produk *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-name" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">SKU *</label>
                  <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-sku" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Barcode</label>
                  <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Kategori</label>
                  <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]">
                    <option value="">-- Tidak ada --</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Unit</label>
                  <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Harga Jual *</label>
                  <input required type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-price" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Harga Modal</label>
                  <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Stok Awal</label>
                  <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-stock" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">Batas Stok Rendah</label>
                  <input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs uppercase tracking-widest text-[#94A3B8] mb-1 block">URL Gambar</label>
                  <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." className="w-full bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
              </div>

              {/* Variants */}
              <div className="border-t border-[rgba(212,175,55,0.15)] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-serif-luxury text-lg text-[#F5F5F5]">Varian Produk</h3>
                    <p className="text-xs text-[#94A3B8]">Opsional. Untuk fashion (S/M/L), F&B (rasa/topping), dll.</p>
                  </div>
                  <button type="button" onClick={addVariant} data-testid="add-variant-btn" className="flex items-center gap-1 text-xs text-[#D4AF37] hover:text-[#FFD700]"><Plus size={12} /> Tambah Varian</button>
                </div>
                <div className="space-y-2">
                  {(form.variants || []).map((v, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`variant-row-${i}`}>
                      <input placeholder="Nama (e.g. Large / Red)" value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} className="col-span-4 bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                      <input placeholder="SKU" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} className="col-span-3 bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                      <input type="number" placeholder="Harga" value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} className="col-span-2 bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                      <input type="number" placeholder="Stok" value={v.stock} onChange={(e) => updateVariant(i, { stock: e.target.value })} className="col-span-2 bg-[#0F1A3A] border border-[rgba(212,175,55,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                      <button type="button" onClick={() => removeVariant(i)} className="col-span-1 text-[#94A3B8] hover:text-[#8B0000]"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {(!form.variants || form.variants.length === 0) && <p className="text-xs text-[#94A3B8] italic">Tidak ada varian. Produk akan dijual sebagai item tunggal.</p>}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[rgba(212,175,55,0.15)]">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(212,175,55,0.3)] text-[#D4AF37] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#14213D] transition-colors">Batal</button>
                <button type="submit" data-testid="form-submit-btn" className="flex-1 bg-[#D4AF37] text-[#0A1128] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFD700] transition-colors">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
