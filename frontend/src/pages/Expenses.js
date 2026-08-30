import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Plus, Wallet, TrendingDown, Trash, Edit, X } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "rent", label: "Sewa" },
  { value: "utilities", label: "Utilitas (Listrik, Air)" },
  { value: "salary", label: "Gaji" },
  { value: "supplies", label: "Supplies" },
  { value: "maintenance", label: "Maintenance" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Lainnya" },
];

export default function Expenses() {
  const { outlets, outletIdForApi, allAccess } = useOutlet();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    outlet_id: outletIdForApi || "",
    category: "utilities",
    description: "",
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    payment_method: "cash",
    vendor: "",
    receipt_no: "",
  });

  // Sync form.outlet_id when global outlet changes
  useEffect(() => {
    setForm(f => ({ ...f, outlet_id: outletIdForApi || f.outlet_id }));
  }, [outletIdForApi]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const oParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
      const [listRes, sumRes] = await Promise.all([
        api.get(`/expenses${oParam}`),
        api.get(`/expenses/summary${oParam}`),
      ]);
      setExpenses(listRes.data);
      setSummary(sumRes.data);
    } catch (e) {
      toast.error("Gagal memuat pengeluaran");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.outlet_id) {
      toast.error("Pilih outlet terlebih dahulu");
      return;
    }
    try {
      await api.post("/expenses", { ...form, amount: parseFloat(form.amount) });
      toast.success("Pengeluaran ditambahkan");
      setShowForm(false);
      setForm({ ...form, description: "", amount: "", vendor: "", receipt_no: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menambah pengeluaran");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Hapus pengeluaran ini?")) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success("Pengeluaran dihapus");
      load();
    } catch (e) {
      toast.error("Gagal menghapus");
    }
  };

  const getCategoryLabel = (cat) => CATEGORIES.find(c => c.value === cat)?.label || cat;

  return (
    <div>
      <PageHeader title="Pengeluaran" subtitle="Tracking pengeluaran operasional per outlet" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Total Pengeluaran</p>
              <p className="text-lg text-[#F4C842]">{formatIDR(summary.total)}</p>
            </div>
            <div className="bg-[#331419] gold-border rounded-lg p-4">
              <p className="text-xs text-[#C4A484]">Jumlah Transaksi</p>
              <p className="text-lg text-[#F5F5F5]">{summary.count}</p>
            </div>
            {summary.by_category?.slice(0, 2).map((c, i) => (
              <div key={i} className="bg-[#331419] gold-border rounded-lg p-4">
                <p className="text-xs text-[#C4A484]">{getCategoryLabel(c.category)}</p>
                <p className="text-lg text-[#F5F5F5]">{formatIDR(c.total)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add Button */}
        <div className="flex justify-between items-center">
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Daftar Pengeluaran</h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#E6B835]"
          >
            <Plus size={16} /> Tambah
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-[#331419] gold-border rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#C4A484]">Outlet</label>
                <select
                  value={form.outlet_id}
                  onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                >
                  <option value="">Pilih Outlet</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Kategori</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Jumlah</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Tanggal</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Metode Bayar</label>
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                >
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Vendor</label>
                <input
                  type="text"
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-[#C4A484]">Deskripsi</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-[#F4C842] text-[#1A0810] px-6 py-2 rounded-md text-sm font-medium">Simpan</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-[#2A1015] text-[#C4A484] px-6 py-2 rounded-md text-sm">Batal</button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : expenses.length === 0 ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <Wallet size={32} className="mx-auto mb-3 opacity-50" />
            Belum ada pengeluaran tercatat
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(244,200,66,0.2)]">
                  <th className="text-left py-3 px-4 text-[#C4A484]">Tanggal</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Outlet</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Kategori</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Deskripsi</th>
                  <th className="text-right py-3 px-4 text-[#C4A484]">Jumlah</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-[rgba(244,200,66,0.08)]">
                    <td className="py-3 px-4 text-[#C4A484]">{e.expense_date}</td>
                    <td className="py-3 px-4 text-[#F5F5F5]">{e.outlet_name}</td>
                    <td className="py-3 px-4 text-[#F5F5F5]">{getCategoryLabel(e.category)}</td>
                    <td className="py-3 px-4 text-[#C4A484]">{e.description}</td>
                    <td className="py-3 px-4 text-right text-[#F4C842]">{formatIDR(e.amount)}</td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-300">
                        <Trash size={16} />
                      </button>
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
