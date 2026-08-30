import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Plus, Check, X, Trash2, CalendarOff } from "lucide-react";
import { toast } from "sonner";

const LEAVE_TYPES = [
  { value: "cuti", label: "Cuti", color: "text-blue-400" },
  { value: "sakit", label: "Sakit", color: "text-red-400" },
  { value: "izin", label: "Izin", color: "text-yellow-400" },
  { value: "dinas_luar", label: "Dinas Luar", color: "text-green-400" },
];

const STATUS_COLORS = {
  pending: "text-yellow-400 bg-yellow-400/10",
  approved: "text-green-400 bg-green-400/10",
  rejected: "text-red-400 bg-red-400/10",
};

export default function LeaveRequests() {
  const { outletIdForApi } = useOutlet();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    leave_type: "izin",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      const { data } = await api.get(`/leave-requests?${params}`);
      setRequests(data);
    } catch (e) {
      toast.error("Gagal memuat pengajuan cuti");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date) {
      toast.error("Pilih tanggal mulai dan akhir");
      return;
    }
    try {
      await api.post("/leave-requests", { ...form, outlet_id: outletIdForApi || undefined });
      toast.success("Pengajuan cuti dikirim");
      setShowForm(false);
      setForm({ leave_type: "izin", start_date: "", end_date: "", reason: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengajukan");
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.put(`/leave-requests/${id}/approve?outlet_id=${outletIdForApi || ""}`, {});
      toast.success("Pengajuan disetujui");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyetujui");
    }
  };

  const handleReject = async (id) => {
    const reason = prompt("Alasan penolakan:");
    if (!reason) return;
    try {
      await api.put(`/leave-requests/${id}/reject?outlet_id=${outletIdForApi || ""}`, { reason });
      toast.success("Pengajuan ditolak");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menolak");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Hapus pengajuan ini?")) return;
    try {
      await api.delete(`/leave-requests/${id}?outlet_id=${outletIdForApi || ""}`);
      toast.success("Pengajuan dihapus");
      load();
    } catch (e) {
      toast.error("Gagal menghapus");
    }
  };

  const getTypeLabel = (t) => LEAVE_TYPES.find(l => l.value === t)?.label || t;

  return (
    <div>
      <PageHeader title="Cuti & Izin" subtitle="Pengajuan cuti dan izin karyawan" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Daftar Pengajuan</h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#E6B835]"
          >
            <Plus size={16} /> Ajukan Cuti
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-[#331419] gold-border rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#C4A484]">Jenis</label>
                <select
                  value={form.leave_type}
                  onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                >
                  {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div></div>
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
              <div className="md:col-span-2">
                <label className="text-xs text-[#C4A484]">Alasan</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-[#F4C842] text-[#1A0810] px-6 py-2 rounded-md text-sm font-medium">Kirim</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-[#2A1015] text-[#C4A484] px-6 py-2 rounded-md text-sm">Batal</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : requests.length === 0 ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <CalendarOff size={32} className="mx-auto mb-3 opacity-50" />
            Belum ada pengajuan cuti
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(244,200,66,0.2)]">
                  <th className="text-left py-3 px-4 text-[#C4A484]">Karyawan</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Jenis</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Mulai</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Akhir</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Alasan</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Status</th>
                  <th className="text-center py-3 px-4 text-[#C4A484]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-[rgba(244,200,66,0.08)]">
                    <td className="py-3 px-4 text-[#F5F5F5]">{r.user_name}</td>
                    <td className="py-3 px-4 text-[#F5F5F5]">{getTypeLabel(r.leave_type)}</td>
                    <td className="py-3 px-4 text-[#C4A484]">{r.start_date}</td>
                    <td className="py-3 px-4 text-[#C4A484]">{r.end_date}</td>
                    <td className="py-3 px-4 text-[#C4A484] max-w-xs truncate">{r.reason}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs uppercase px-2 py-0.5 rounded ${STATUS_COLORS[r.status] || "text-[#C4A484]"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {r.status === "pending" && (
                          <>
                            <button onClick={() => handleApprove(r.id)} className="text-green-400 hover:text-green-300" title="Setujui">
                              <Check size={16} />
                            </button>
                            <button onClick={() => handleReject(r.id)} className="text-red-400 hover:text-red-300" title="Tolak">
                              <X size={16} />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(r.id)} className="text-[#C4A484] hover:text-red-400" title="Hapus">
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
