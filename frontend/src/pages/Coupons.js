import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Plus, Tag, Trash2, Edit, X, Ticket, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const DISCOUNT_TYPES = [
  { value: "percentage", label: "Persentase (%)" },
  { value: "fixed", label: "Nominal Tetap" },
];

const EMPTY_FORM = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: "",
  start_date: "",
  end_date: "",
  usage_limit: "",
  is_active: true,
};

export default function Coupons() {
  const { outletIdForApi } = useOutlet();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [validate, setValidate] = useState({ code: "", amount: "" });
  const [validateResult, setValidateResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      const { data } = await api.get(`/coupons?${params}`);
      setCoupons(data);
    } catch (e) {
      toast.error("Gagal memuat kupon");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditing(null); setShowForm(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code || !form.discount_value) {
      toast.error("Kode dan nilai diskon wajib diisi");
      return;
    }
    try {
      const payload = {
        ...form,
        discount_value: parseFloat(form.discount_value),
        usage_limit: form.usage_limit ? parseInt(form.usage_limit, 10) : null,
        outlet_id: outletIdForApi,
      };
      if (editing) {
        await api.put(`/coupons/${editing}`, payload);
        toast.success("Kupon diperbarui");
      } else {
        await api.post("/coupons", payload);
        toast.success("Kupon dibuat");
      }
      resetForm();
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan kupon");
    }
  };

  const handleEdit = (c) => {
    setEditing(c.id);
    setForm({
      code: c.code,
      description: c.description || "",
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      start_date: c.start_date || "",
      end_date: c.end_date || "",
      usage_limit: c.usage_limit != null ? String(c.usage_limit) : "",
      is_active: c.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Hapus kupon ini?")) return;
    try {
      await api.delete(`/coupons/${id}`);
      toast.success("Kupon dihapus");
      load();
    } catch (e) {
      toast.error("Gagal menghapus");
    }
  };

  const handleValidate = async (e) => {
    e.preventDefault();
    if (!validate.code || !validate.amount) {
      toast.error("Masukkan kode dan jumlah transaksi");
      return;
    }
    try {
      const { data } = await api.post("/coupons/validate", {
        code: validate.code,
        amount: parseFloat(validate.amount),
        outlet_id: outletIdForApi,
      });
      setValidateResult(data);
    } catch (e) {
      setValidateResult(null);
      toast.error(e.response?.data?.detail || "Kupon tidak valid");
    }
  };

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div>
      <PageHeader title="Kupon" subtitle="Manajemen kupon diskon" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Daftar Kupon</h3>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#E6B835]"
          >
            <Plus size={16} /> {editing ? "Edit" : "Tambah"} Kupon
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-[#331419] gold-border rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#C4A484]">Kode Kupon</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Tipe Diskon</label>
                <select
                  value={form.discount_type}
                  onChange={(e) => set("discount_type", e.target.value)}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                >
                  {DISCOUNT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Nilai Diskon</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.discount_value}
                  onChange={(e) => set("discount_value", e.target.value)}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Batas Penggunaan</label>
                <input
                  type="number"
                  value={form.usage_limit}
                  onChange={(e) => set("usage_limit", e.target.value)}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  placeholder="Kosongkan = tanpa batas"
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Mulai</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Berakhir</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => set("end_date", e.target.value)}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-[#C4A484]">Deskripsi</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#F5F5F5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set("is_active", e.target.checked)}
                  className="accent-[#F4C842]"
                />
                Aktif
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-[#F4C842] text-[#1A0810] px-6 py-2 rounded-md text-sm font-medium">{editing ? "Update" : "Simpan"}</button>
              <button type="button" onClick={resetForm} className="bg-[#2A1015] text-[#C4A484] px-6 py-2 rounded-md text-sm">Batal</button>
            </div>
          </form>
        )}

        {/* Validate Widget */}
        <div className="bg-[#331419] gold-border rounded-lg p-6">
          <h4 className="font-serif-luxury text-base text-[#F5F5F5] mb-4 flex items-center gap-2">
            <Ticket size={18} className="text-[#F4C842]" /> Validasi Kupon
          </h4>
          <form onSubmit={handleValidate} className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <label className="text-xs text-[#C4A484]">Kode</label>
              <input
                type="text"
                value={validate.code}
                onChange={(e) => setValidate({ ...validate, code: e.target.value.toUpperCase() })}
                className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="text-xs text-[#C4A484]">Jumlah Transaksi</label>
              <input
                type="number"
                value={validate.amount}
                onChange={(e) => setValidate({ ...validate, amount: e.target.value })}
                className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
              />
            </div>
            <button type="submit" className="bg-[#C4A484] text-[#1A0810] px-5 py-2 rounded-md text-sm font-medium">Cek</button>
          </form>
          {validateResult && (
            <div className="mt-4 flex items-center gap-2 text-sm text-green-400 bg-green-400/10 rounded-md p-3">
              <CheckCircle size={16} />
              Diskon: {validateResult.discount_type === "percentage" ? `${validateResult.discount_value}%` : formatIDR(validateResult.discount_value)}
              {validateResult.discount_amount != null && <> - Hemat {formatIDR(validateResult.discount_amount)}</>}
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : coupons.length === 0 ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <Tag size={32} className="mx-auto mb-3 opacity-50" />
            Belum ada kupon
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(244,200,66,0.2)]">
                  <th className="text-left py-3 px-4 text-[#C4A484]">Kode</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Deskripsi</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Tipe</th>
                  <th className="text-right py-3 px-4 text-[#C4A484]">Nilai</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Periode</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Pakai</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Status</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-b border-[rgba(244,200,66,0.08)]">
                    <td className="py-3 px-4 text-[#F4C842] font-medium">{c.code}</td>
                    <td className="py-3 px-4 text-[#F5F5F5] max-w-xs truncate">{c.description || "-"}</td>
                    <td className="py-3 px-4 text-[#C4A484]">{c.discount_type === "percentage" ? "%" : "Fixed"}</td>
                    <td className="py-3 px-4 text-right text-[#F5F5F5]">
                      {c.discount_type === "percentage" ? `${c.discount_value}%` : formatIDR(c.discount_value)}
                    </td>
                    <td className="py-3 px-4 text-[#C4A484] text-xs">{c.start_date || "-"} → {c.end_date || "-"}</td>
                    <td className="py-3 px-4 text-center text-[#F5F5F5]">{c.usage_count || 0}{c.usage_limit != null ? `/${c.usage_limit}` : ""}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs uppercase px-2 py-0.5 rounded ${c.is_active ? "text-green-400 bg-green-400/10" : "text-[#C4A484] bg-[#2A1015]"}`}>
                        {c.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleEdit(c)} className="text-[#F4C842] hover:text-[#E6B835]" title="Edit">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="text-[#C4A484] hover:text-red-400" title="Hapus">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
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
