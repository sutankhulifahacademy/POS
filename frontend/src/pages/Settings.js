import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, Upload } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const DEFAULT_COLORS = {
  primary_color: "#F4C842",
  secondary_color: "#C4A484",
  bg_color: "#1A0810",
  card_bg_color: "#331419",
  sidebar_bg_color: "#2A1015",
};

export default function Settings() {
  const { refresh: refreshTheme } = useTheme();
  const [business, setBusiness] = useState({ name: "", business_type: "retail", currency: "IDR", tax_rate: 0, address: "", logo_url: "", ...DEFAULT_COLORS });
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const uploadLogo = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Ukuran file maksimal 5MB"); return; }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setBusiness({ ...business, logo_url: data.url });
      toast.success("Logo berhasil diupload");
    } catch (e) {
      toast.error("Gagal upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const loadAll = async () => {
    try {
      const [b, c] = await Promise.all([api.get("/business"), api.get("/categories")]);
      if (b.data) setBusiness({ ...DEFAULT_COLORS, ...b.data });
      setCategories(c.data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Gagal memuat data");
    }
  };
  useEffect(() => { loadAll(); }, []);

  const saveBusiness = async (e) => {
    e.preventDefault();
    try {
      await api.post("/business", { ...business, tax_rate: Number(business.tax_rate) });
      toast.success("Pengaturan bisnis disimpan");
      refreshTheme();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    try {
      await api.post("/categories", { name: newCat, color: "#F4C842" });
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

  const resetColors = () => {
    setBusiness({ ...business, ...DEFAULT_COLORS });
  };

  const colorFields = [
    { key: "primary_color", label: "Warna Utama" },
    { key: "secondary_color", label: "Warna Sekunder" },
    { key: "bg_color", label: "Warna Background" },
    { key: "card_bg_color", label: "Warna Kartu" },
    { key: "sidebar_bg_color", label: "Warna Sidebar" },
  ];

  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Kustomisasi bisnis, kategori, dan preferensi sistem" />
      <div className="p-4 md:p-6 lg:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <form action="javascript:void(0)" onSubmit={saveBusiness} className="bg-[#331419] gold-border rounded-lg p-6 space-y-4" data-testid="business-form">
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Profil Bisnis</h3>

          {/* Logo Upload */}
          <div>
            <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-2 block">Logo Usaha</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-[#2A1015] border border-[rgba(244,200,66,0.2)] flex items-center justify-center flex-shrink-0">
                {business.logo_url ? (
                  <img src={business.logo_url} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-[#C4A484] text-center px-2">No Logo</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="flex items-center justify-center gap-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2.5 text-sm text-[#F4C842] hover:bg-[#4A1A22] cursor-pointer transition-colors" data-testid="business-logo-upload">
                  <Upload size={16} />
                  {uploadingLogo ? "Uploading..." : "Pilih File Logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files[0])} disabled={uploadingLogo} />
                </label>
                {business.logo_url && (
                  <button type="button" onClick={() => setBusiness({ ...business, logo_url: "" })} className="text-xs text-[#C4A484] hover:text-[#8B0000]">Hapus logo</button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Nama Bisnis</label>
            <input required value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="business-name" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Jenis Usaha</label>
            <select value={business.business_type} onChange={(e) => setBusiness({ ...business, business_type: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="business-type">
              <option value="retail">Retail / Toko Umum</option>
              <option value="fnb">F&B / Restoran / Cafe</option>
              <option value="fashion">Fashion / Butik</option>
              <option value="general">Umum / Lainnya</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Mata Uang</label>
              <input value={business.currency} onChange={(e) => setBusiness({ ...business, currency: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Pajak (%)</label>
              <input type="number" step="0.1" value={business.tax_rate} onChange={(e) => setBusiness({ ...business, tax_rate: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Alamat</label>
            <textarea value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
          </div>
          <button type="submit" data-testid="business-save" className="w-full bg-[#F4C842] text-[#1A0810] py-3 rounded-md font-semibold uppercase tracking-widest text-sm hover:bg-[#FFDD5C] transition-colors">Simpan</button>
        </form>

        <div className="space-y-6">
          {/* Color Theme Section */}
          <div className="bg-[#331419] gold-border rounded-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Tema Warna</h3>
              <button type="button" onClick={resetColors} data-testid="reset-colors" className="flex items-center gap-1 text-xs uppercase tracking-widest text-[#C4A484] hover:text-[#F4C842] transition-colors">
                <RotateCcw size={16} /> Reset ke Default
              </button>
            </div>

            {colorFields.map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">{label}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={business[key] || DEFAULT_COLORS[key]}
                    onChange={(e) => setBusiness({ ...business, [key]: e.target.value })}
                    className="w-12 h-12 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] cursor-pointer p-1"
                    data-testid={`color-${key}`}
                  />
                  <input
                    type="text"
                    value={business[key] || ""}
                    onChange={(e) => setBusiness({ ...business, [key]: e.target.value })}
                    placeholder={DEFAULT_COLORS[key]}
                    className="flex-1 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5] font-mono text-sm"
                  />
                </div>
              </div>
            ))}

            {/* Live Preview */}
            <div>
              <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-2 block">Pratinjau</label>
              <div
                className="rounded-lg p-4 border"
                style={{ backgroundColor: business.bg_color || DEFAULT_COLORS.bg_color, borderColor: business.primary_color || DEFAULT_COLORS.primary_color }}
              >
                <div
                  className="rounded-md p-3 mb-2"
                  style={{ backgroundColor: business.card_bg_color || DEFAULT_COLORS.card_bg_color }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: business.primary_color || DEFAULT_COLORS.primary_color, color: business.bg_color || DEFAULT_COLORS.bg_color }}
                    >
                      L
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: business.primary_color || DEFAULT_COLORS.primary_color }}>
                        {business.name || "Nama Bisnis"}
                      </div>
                      <div className="text-xs" style={{ color: business.secondary_color || DEFAULT_COLORS.secondary_color }}>
                        Contoh kartu produk
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md text-xs font-semibold"
                    style={{ backgroundColor: business.primary_color || DEFAULT_COLORS.primary_color, color: business.bg_color || DEFAULT_COLORS.bg_color }}
                  >
                    Tombol Utama
                  </button>
                  <div
                    className="px-3 py-1.5 rounded-md text-xs"
                    style={{ backgroundColor: business.sidebar_bg_color || DEFAULT_COLORS.sidebar_bg_color, color: business.secondary_color || DEFAULT_COLORS.secondary_color }}
                  >
                    Sidebar
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Categories Section */}
          <div className="bg-[#331419] gold-border rounded-lg p-6">
            <h3 className="font-serif-luxury text-xl text-[#F5F5F5] mb-4">Kategori Produk</h3>
            <div className="flex gap-2 mb-4">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nama kategori baru" className="flex-1 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="new-category-input" />
              <button onClick={addCategory} data-testid="add-category-btn" className="bg-[#F4C842] text-[#1A0810] px-4 rounded-md font-semibold hover:bg-[#FFDD5C] transition-colors"><Plus size={16} /></button>
            </div>
            <div className="space-y-2">
              {categories.length === 0 && <p className="text-sm text-[#C4A484]">Belum ada kategori.</p>}
              {categories.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-2 px-3 bg-[#2A1015] rounded-md border border-[rgba(244,200,66,0.1)]">
                  <span className="text-sm text-[#F5F5F5]">{c.name}</span>
                  <button onClick={() => removeCat(c.id)} className="text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
