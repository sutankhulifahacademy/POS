import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Plus, Wallet, Play, X, FileText } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  draft: "text-yellow-400 bg-yellow-400/10",
  processed: "text-green-400 bg-green-400/10",
};

const EMPTY_FORM = {
  start_date: "",
  end_date: "",
};

export default function Payroll() {
  const { outletIdForApi } = useOutlet();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      const { data } = await api.get(`/payroll/periods?${params}`);
      setPeriods(data || []);
    } catch (e) {
      toast.error("Gagal memuat periode payroll");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  useEffect(() => { load(); }, [load]);

  const loadItems = async (periodId) => {
    setLoadingItems(true);
    setItems([]);
    try {
      const { data } = await api.get(`/payroll/periods/${periodId}/items`);
      setItems(data || []);
    } catch (e) {
      toast.error("Gagal memuat detail payroll");
    } finally {
      setLoadingItems(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date) {
      toast.error("Pilih tanggal mulai dan akhir");
      return;
    }
    try {
      await api.post("/payroll/periods", { ...form, outlet_id: outletIdForApi });
      toast.success("Periode payroll dibuat");
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membuat periode");
    }
  };

  const handleProcess = async (id) => {
    if (!confirm("Proses payroll periode ini? Data akan dikunci.")) return;
    setProcessing(true);
    try {
      await api.post(`/payroll/periods/${id}/process`, {});
      toast.success("Payroll diproses");
      load();
      if (selectedPeriod?.id === id) {
        loadItems(id);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memproses payroll");
    } finally {
      setProcessing(false);
    }
  };

  const handleSelectPeriod = (p) => {
    setSelectedPeriod(p);
    loadItems(p.id);
  };

  const totalPay = items.reduce((sum, it) => sum + (it.net_pay || 0), 0);

  return (
    <div>
      <PageHeader title="Payroll" subtitle="Manajemen penggajian karyawan" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Periode Payroll</h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#E6B835]"
          >
            <Plus size={16} /> Periode Baru
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-[#331419] gold-border rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#C4A484]">Tanggal Mulai</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Tanggal Akhir</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-[#F4C842] text-[#1A0810] px-6 py-2 rounded-md text-sm font-medium">Buat</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-[#2A1015] text-[#C4A484] px-6 py-2 rounded-md text-sm">Batal</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : periods.length === 0 ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <Wallet size={32} className="mx-auto mb-3 opacity-50" />
            Belum ada periode payroll
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(244,200,66,0.2)]">
                  <th className="text-left py-3 px-4 text-[#C4A484]">Periode</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Status</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className={`border-b border-[rgba(244,200,66,0.08)] ${selectedPeriod?.id === p.id ? "bg-[#F4C842]/5" : ""}`}>
                    <td className="py-3 px-4 text-[#F5F5F5]">{p.start_date} → {p.end_date}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs uppercase px-2 py-0.5 rounded ${STATUS_COLORS[p.status] || "text-[#C4A484]"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleSelectPeriod(p)}
                          className="text-[#F4C842] hover:text-[#E6B835] text-xs px-2 py-1 rounded border border-[rgba(244,200,66,0.3)]"
                        >
                          Detail
                        </button>
                        {p.status === "draft" && (
                          <button
                            onClick={() => handleProcess(p.id)}
                            disabled={processing}
                            className="flex items-center gap-1 text-green-400 hover:text-green-300 text-xs px-2 py-1 rounded border border-green-400/30 disabled:opacity-50"
                          >
                            <Play size={12} /> Proses
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payroll Items */}
        {selectedPeriod && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">
                Detail Payroll: {selectedPeriod.start_date} → {selectedPeriod.end_date}
              </h3>
              <button onClick={() => setSelectedPeriod(null)} className="text-[#C4A484] hover:text-[#F5F5F5]">
                <X size={18} />
              </button>
            </div>

            {/* Summary */}
            <div className="bg-[#331419] gold-border rounded-lg p-5">
              <p className="text-xs text-[#C4A484]">Total Pembayaran</p>
              <p className="text-2xl text-[#F4C842] font-serif-luxury">{formatIDR(totalPay)}</p>
              <p className="text-xs text-[#C4A484] mt-1">{items.length} karyawan</p>
            </div>

            {loadingItems ? (
              <div className="text-[#C4A484]">Memuat detail...</div>
            ) : items.length === 0 ? (
              <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
                <FileText size={32} className="mx-auto mb-3 opacity-50" />
                Belum ada item payroll. Proses payroll untuk menghitung.
              </div>
            ) : (
              <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(244,200,66,0.2)]">
                      <th className="text-left py-3 px-4 text-[#C4A484]">Karyawan</th>
                      <th className="text-left py-3 px-4 text-[#C4A484]">Role</th>
                      <th className="text-right py-3 px-4 text-[#C4A484]">Gaji Pokok</th>
                      <th className="text-center py-3 px-4 text-[#C4A484]">Hadir</th>
                      <th className="text-right py-3 px-4 text-[#C4A484]">Bonus</th>
                      <th className="text-right py-3 px-4 text-[#C4A484]">Potongan</th>
                      <th className="text-right py-3 px-4 text-[#C4A484]">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b border-[rgba(244,200,66,0.08)]">
                        <td className="py-3 px-4 text-[#F5F5F5]">{it.user_name}</td>
                        <td className="py-3 px-4 text-[#C4A484]">{it.role || "-"}</td>
                        <td className="py-3 px-4 text-right text-[#F5F5F5]">{formatIDR(it.base_salary)}</td>
                        <td className="py-3 px-4 text-center text-[#F5F5F5]">{it.attendance_days ?? 0}</td>
                        <td className="py-3 px-4 text-right text-green-400">{formatIDR(it.attendance_bonus)}</td>
                        <td className="py-3 px-4 text-right text-red-400">{formatIDR(it.deductions)}</td>
                        <td className="py-3 px-4 text-right text-[#F4C842] font-medium">{formatIDR(it.net_pay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
