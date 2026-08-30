import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, Edit3, Trash2, X, Search, Package, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", sku: "", barcode: "", category_id: "", price: 0, cost: 0, stock: 0, low_stock_threshold: 5, unit: "pcs", image_url: "", description: "", is_active: true, variants: [], product_type: "regular", bundle_items: [] };

export default function Products() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [expandedPaket, setExpandedPaket] = useState({});

  const load = async () => {
    const [p, c] = await Promise.all([api.get("/products"), api.get("/categories")]);
    setItems(p.data); setCategories(c.data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditing(null); setShowForm(true); };
  const openEdit = (p) => { setForm({ ...empty, ...p, variants: p.variants || [], product_type: p.product_type || "regular", bundle_items: p.bundle_items || [] }); setEditing(p.id); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price), cost: Number(form.cost), stock: Number(form.stock), low_stock_threshold: Number(form.low_stock_threshold),
      variants: (form.variants || []).map(v => ({ name: v.name, sku: v.sku || "", price: Number(v.price), stock: Number(v.stock) })),
      product_type: form.product_type || "regular",
      bundle_items: (form.bundle_items || []).map(b => ({ product_id: b.product_id, name: b.name, price: Number(b.price), quantity: Number(b.quantity) })),
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

  // Bundle helpers
  const addBundleItem = () => setForm({ ...form, bundle_items: [...(form.bundle_items || []), { product_id: "", name: "", price: 0, quantity: 1 }] });
  const updateBundleItem = (idx, patch) => setForm({ ...form, bundle_items: (form.bundle_items || []).map((b, i) => i === idx ? { ...b, ...patch } : b) });
  const removeBundleItem = (idx) => setForm({ ...form, bundle_items: (form.bundle_items || []).filter((_, i) => i !== idx) });
  const onBundleProductSelect = (idx, productId) => {
    const prod = items.find(p => p.id === productId);
    if (prod) updateBundleItem(idx, { product_id: productId, name: prod.name, price: prod.price });
  };
  const bundleTotal = (form.bundle_items || []).reduce((sum, b) => sum + (Number(b.price) * Number(b.quantity || 1)), 0);

  const filtered = items.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Produk"
        subtitle="Kelola katalog produk, varian, harga, dan stok"
        actions={
          <button onClick={openNew} data-testid="add-product-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
            <Plus size={16} strokeWidth={2} /> Tambah Produk
          </button>
        }
      />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mb-6 relative max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C4A484]" strokeWidth={1.5} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md pl-12 pr-4 py-3 text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#F4C842]" data-testid="products-search" />
        </div>

        <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                <th className="px-6 py-4">Produk</th>
                <th className="px-6 py-4">Tipe</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4">Varian</th>
                <th className="px-6 py-4 text-right">Harga</th>
                <th className="px-6 py-4 text-right">Stok</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-[#C4A484]">Belum ada produk. Tambahkan produk pertama Anda.</td></tr>}
              {filtered.map((p) => (
                <>
                  <tr key={p.id} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors" data-testid={`product-row-${p.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {p.product_type === "paket" && (
                          <button
                            onClick={() => setExpandedPaket({ ...expandedPaket, [p.id]: !expandedPaket[p.id] })}
                            className="text-[#F4C842] hover:text-[#FFDD5C] flex-shrink-0"
                            data-testid={`expand-paket-${p.id}`}
                          >
                            {expandedPaket[p.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                        {p.image_url ? <img src={p.image_url} alt="" className="w-10 h-10 rounded-md object-cover" /> : <div className="w-10 h-10 rounded-md bg-[#4A1A22]" />}
                        <div>
                          <p className="text-sm text-[#F5F5F5]">{p.name}</p>
                          <p className="text-xs text-[#C4A484]">{p.unit}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {p.product_type === "paket" ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-[rgba(244,200,66,0.15)] text-[#F4C842] px-2 py-1 rounded"><Package size={12} /> Paket</span>
                      ) : (
                        <span className="text-xs text-[#C4A484]">Reguler</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#C4A484]">{p.sku}</td>
                    <td className="px-6 py-4 text-sm text-[#C4A484]">
                      {p.product_type === "paket"
                        ? `${p.bundle_items?.length || 0} item`
                        : p.variants?.length ? `${p.variants.length} varian` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-[#F4C842]">{formatIDR(p.price)}</td>
                    <td className="px-6 py-4 text-right"><span className={`text-sm ${p.stock <= (p.low_stock_threshold || 5) ? 'text-[#8B0000]' : 'text-[#F5F5F5]'}`}>{p.stock}</span></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`} className="p-2.5 text-[#C4A484] hover:text-[#F4C842]"><Edit3 size={16} /></button>
                        <button onClick={() => remove(p.id)} data-testid={`delete-product-${p.id}`} className="p-2.5 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                  {p.product_type === "paket" && expandedPaket[p.id] && (p.bundle_items || []).length > 0 && (
                    <tr key={`${p.id}-bundle`} className="bg-[#1A0810]">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="ml-8 border-l-2 border-[rgba(244,200,66,0.3)] pl-4">
                          <p className="text-xs uppercase tracking-widest text-[#C4A484] mb-2">Komposisi Paket</p>
                          <div className="space-y-1">
                            {(p.bundle_items || []).map((b, i) => (
                              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-[rgba(244,200,66,0.05)] last:border-0">
                                <div className="flex items-center gap-3">
                                  <span className="text-[#F5F5F5]">{b.name}</span>
                                  <span className="text-xs text-[#C4A484]">@ {formatIDR(b.price)}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-xs text-[#C4A484]">Qty: <span className="text-[#F4C842] font-semibold">{b.quantity}</span></span>
                                  <span className="text-xs text-[#F4C842]">{formatIDR(Number(b.price) * Number(b.quantity))}</span>
                                </div>
                              </div>
                            ))}
                            <div className="flex justify-between pt-2 mt-1 border-t border-[rgba(244,200,66,0.15)]">
                              <span className="text-xs text-[#C4A484]">Total nilai item:</span>
                              <span className="text-sm text-[#F4C842] font-semibold">{formatIDR((p.bundle_items || []).reduce((s, b) => s + Number(b.price) * Number(b.quantity), 0))}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-3xl mx-4 w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">{editing ? "Edit Produk" : "Tambah Produk"}</h2>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form onSubmit={save} className="p-6 space-y-6" data-testid="product-form">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Nama Produk *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-name" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">SKU *</label>
                  <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-sku" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Barcode</label>
                  <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Kategori</label>
                  <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]">
                    <option value="">-- Tidak ada --</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Unit</label>
                  <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Harga Jual *</label>
                  <input required type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-price" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Harga Modal</label>
                  <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Stok Awal</label>
                  <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="form-stock" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Batas Stok Rendah</label>
                  <input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">URL Gambar</label>
                  <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
              </div>

              {/* Product Type Selector */}
              <div className="border-t border-[rgba(244,200,66,0.15)] pt-4">
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-2 block">Tipe Produk</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, product_type: "regular" })}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm transition-colors ${form.product_type !== "paket" ? "bg-[rgba(244,200,66,0.15)] text-[#F4C842] border border-[#F4C842]" : "bg-[#2A1015] text-[#C4A484] border border-[rgba(244,200,66,0.2)]"}`}
                    data-testid="type-regular"
                  >
                    Produk Reguler
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, product_type: "paket" })}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm transition-colors ${form.product_type === "paket" ? "bg-[rgba(244,200,66,0.15)] text-[#F4C842] border border-[#F4C842]" : "bg-[#2A1015] text-[#C4A484] border border-[rgba(244,200,66,0.2)]"}`}
                    data-testid="type-paket"
                  >
                    <Package size={16} /> Paket / Bundle
                  </button>
                </div>
              </div>

              {/* Bundle Items — only show when product_type is "paket" */}
              {form.product_type === "paket" && (
                <div className="border-t border-[rgba(244,200,66,0.15)] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-serif-luxury text-lg text-[#F5F5F5]">Komposisi Paket</h3>
                      <p className="text-xs text-[#C4A484]">Pilih produk yang menjadi campuran paket ini. Harga jual paket ditentukan di field "Harga Jual" di atas.</p>
                    </div>
                    <button type="button" onClick={addBundleItem} data-testid="add-bundle-btn" className="flex items-center gap-1 text-xs text-[#F4C842] hover:text-[#FFDD5C]"><Plus size={16} /> Tambah Item</button>
                  </div>
                  <div className="space-y-2">
                    {(form.bundle_items || []).map((b, i) => (
                      <div key={i} className="overflow-x-auto" data-testid={`bundle-row-${i}`}>
                        <div className="grid grid-cols-12 gap-2 items-center min-w-[700px]">
                          <select
                            value={b.product_id}
                            onChange={(e) => onBundleProductSelect(i, e.target.value)}
                            className="col-span-5 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]"
                            data-testid={`bundle-product-${i}`}
                          >
                            <option value="">-- Pilih Produk --</option>
                            {items.filter(p => p.id !== editing && p.product_type !== "paket").map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({formatIDR(p.price)})</option>
                            ))}
                          </select>
                          <input type="number" placeholder="Qty" value={b.quantity} onChange={(e) => updateBundleItem(i, { quantity: e.target.value })} className="col-span-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" data-testid={`bundle-qty-${i}`} />
                          <input type="number" placeholder="Harga Satuan" value={b.price} onChange={(e) => updateBundleItem(i, { price: e.target.value })} className="col-span-3 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                          <div className="col-span-1 text-xs text-[#C4A484] text-center">{formatIDR(Number(b.price) * Number(b.quantity || 1))}</div>
                          <button type="button" onClick={() => removeBundleItem(i)} className="col-span-1 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                    {(!form.bundle_items || form.bundle_items.length === 0) && <p className="text-xs text-[#C4A484] italic">Belum ada item dalam paket. Klik "Tambah Item" untuk memilih produk.</p>}
                    {(form.bundle_items || []).length > 0 && (
                      <div className="flex justify-between items-center pt-3 border-t border-[rgba(244,200,66,0.1)]">
                        <span className="text-xs text-[#C4A484]">Total nilai item (modal):</span>
                        <span className="text-sm text-[#F4C842] font-semibold">{formatIDR(bundleTotal)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Variants */}
              <div className="border-t border-[rgba(244,200,66,0.15)] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-serif-luxury text-lg text-[#F5F5F5]">Varian Produk</h3>
                    <p className="text-xs text-[#C4A484]">Opsional. Untuk fashion (S/M/L), F&B (rasa/topping), dll.</p>
                  </div>
                  <button type="button" onClick={addVariant} data-testid="add-variant-btn" className="flex items-center gap-1 text-xs text-[#F4C842] hover:text-[#FFDD5C]"><Plus size={16} /> Tambah Varian</button>
                </div>
                <div className="space-y-2">
                  {(form.variants || []).map((v, i) => (
                    <div key={i} className="overflow-x-auto" data-testid={`variant-row-${i}`}>
                      <div className="grid grid-cols-12 gap-2 items-center min-w-[700px]">
                        <input placeholder="Nama (e.g. Large / Red)" value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} className="col-span-4 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                        <input placeholder="SKU" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} className="col-span-3 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                        <input type="number" placeholder="Harga" value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} className="col-span-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                        <input type="number" placeholder="Stok" value={v.stock} onChange={(e) => updateVariant(i, { stock: e.target.value })} className="col-span-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                        <button type="button" onClick={() => removeVariant(i)} className="col-span-1 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {(!form.variants || form.variants.length === 0) && <p className="text-xs text-[#C4A484] italic">Tidak ada varian. Produk akan dijual sebagai item tunggal.</p>}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[rgba(244,200,66,0.15)]">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors">Batal</button>
                <button type="submit" data-testid="form-submit-btn" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
