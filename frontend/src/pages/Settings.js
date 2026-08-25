import { useEffect, useState } from "react";
import api from "../lib/api";
import PageHeader from "../components/PageHeader";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function Settings() {
  const [business, setBusiness] = useState({ name: "", business_type: "retail", currency: "IDR", tax_rate: 0, address: "" });
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");

  const loadAll = async () => {
    const [b, c] = await Promise.all([api.get("/business"), api.get("/categories")]);
    if (b.data) setBusiness(b.data);
    setCategories(c.data);
  };
  useEffect(() => { loadAll(); }, []);

  const saveBusiness = async (e) => {
    e.preventDefault();
    try {
      await api.post("/business", { ...business, tax_rate: Number(business.tax_rate) });
      toast.success("Pengaturan bisnis disimpan");
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    try {
      await api.post("/categories", { name: newCat, color: "#D4AF37" });
      setNewCat("");
      loadAll();
      toast.success("Kategori ditambahkan");
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const removeCat = async (id) => {
    if (!window.confirm("Hapus kategori?")) return;
    try { await api.delete(`/categories/${id}`); loadAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Kustomisasi bisnis, kategori, dan preferensi sistem" />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={saveBusiness} className="bg-[#111] gold-border rounded-lg p-6 space-y-4" data-testid="business-form">
          <h3 className="font-serif-luxury text-xl text-[#FDFBF7]">Profil Bisnis</h3>
          <div>
            <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Nama Bisnis</label>
            <input required value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" data-testid="business-name" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Jenis Usaha</label>
            <select value={business.business_type} onChange={(e) => setBusiness({ ...business, business_type: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" data-testid="business-type">
              <option value="retail">Retail / Toko Umum</option>
              <option value="fnb">F&B / Restoran / Cafe</option>
              <option value="fashion">Fashion / Butik</option>
              <option value="general">Umum / Lainnya</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Mata Uang</label>
              <input value={business.currency} onChange={(e) => setBusiness({ ...business, currency: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Pajak (%)</label>
              <input type="number" step="0.1" value={business.tax_rate} onChange={(e) => setBusiness({ ...business, tax_rate: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Alamat</label>
            <textarea value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} rows="2" className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" />
          </div>
          <button type="submit" data-testid="business-save" className="w-full bg-[#D4AF37] text-[#050505] py-3 rounded-md font-semibold uppercase tracking-widest text-sm hover:bg-[#FFD700] transition-colors">Simpan</button>
        </form>

        <div className="bg-[#111] gold-border rounded-lg p-6">
          <h3 className="font-serif-luxury text-xl text-[#FDFBF7] mb-4">Kategori Produk</h3>
          <div className="flex gap-2 mb-4">
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nama kategori baru" className="flex-1 bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" data-testid="new-category-input" />
            <button onClick={addCategory} data-testid="add-category-btn" className="bg-[#D4AF37] text-[#050505] px-4 rounded-md font-semibold hover:bg-[#FFD700] transition-colors"><Plus size={16} /></button>
          </div>
          <div className="space-y-2">
            {categories.length === 0 && <p className="text-sm text-[#A39B8B]">Belum ada kategori.</p>}
            {categories.map((c) => (
              <div key={c.id} className="flex justify-between items-center py-2 px-3 bg-[#0A0A0A] rounded-md border border-[rgba(212,175,55,0.1)]">
                <span className="text-sm text-[#FDFBF7]">{c.name}</span>
                <button onClick={() => removeCat(c.id)} className="text-[#A39B8B] hover:text-[#8B0000]"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
