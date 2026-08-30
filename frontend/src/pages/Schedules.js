import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Plus, Calendar, Trash2, X, Clock } from "lucide-react";
import { toast } from "sonner";

const DAYS = [
  { value: 0, label: "Senin" },
  { value: 1, label: "Selasa" },
  { value: 2, label: "Rabu" },
  { value: 3, label: "Kamis" },
  { value: 4, label: "Jumat" },
  { value: 5, label: "Sabtu" },
  { value: 6, label: "Minggu" },
];

const EMPTY_FORM = {
  user_id: "",
  day_of_week: 0,
  start_time: "09:00",
  end_time: "17:00",
};

export default function Schedules() {
  const { outletIdForApi } = useOutlet();
  const [schedules, setSchedules] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [cellTarget, setCellTarget] = useState(null); // { user_id, day }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      const q = params.toString();
      const [schRes, usrRes] = await Promise.all([
        api.get(`/schedules${q ? `?${q}` : ""}`),
        api.get(`/users${q ? `?${q}` : ""}`),
      ]);
      setSchedules(schRes.data || []);
      setUsers(usrRes.data || []);
    } catch (e) {
      toast.error("Gagal memuat jadwal");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditing(null); setShowForm(false); setCellTarget(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.user_id) {
      toast.error("Pilih karyawan");
      return;
    }
    if (form.start_time >= form.end_time) {
      toast.error("Jam mulai harus sebelum jam selesai");
      return;
    }
    try {
      const payload = { ...form, user_id: parseInt(form.user_id, 10), outlet_id: outletIdForApi };
      if (editing) {
        await api.put(`/schedules/${editing}`, payload);
        toast.success("Jadwal diperbarui");
      } else {
        await api.post("/schedules", payload);
        toast.success("Jadwal ditambahkan");
      }
      resetForm();
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan jadwal");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Hapus jadwal ini?")) return;
    try {
      await api.delete(`/schedules/${id}?outlet_id=${outletIdForApi || ""}`);
      toast.success("Jadwal dihapus");
      load();
    } catch (e) {
      toast.error("Gagal menghapus");
    }
  };

  const openCell = (userId, day, existing) => {
    setCellTarget({ user_id: userId, day });
    if (existing) {
      setEditing(existing.id);
      setForm({
        user_id: String(existing.user_id),
        day_of_week: existing.day_of_week,
        start_time: existing.start_time,
        end_time: existing.end_time,
      });
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM, user_id: String(userId), day_of_week: day });
    }
    setShowForm(true);
  };

  // Build lookup: key `${user_id}-${day}` -> schedule
  const lookup = {};
  schedules.forEach((s) => { lookup[`${s.user_id}-${s.day_of_week}`] = s; });

  const getUserName = (id) => users.find((u) => u.id === id)?.name || `User #${id}`;

  return (
    <div>
      <PageHeader title="Jadwal Karyawan" subtitle="Jadwal shift mingguan per outlet" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Grid Mingguan</h3>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#E6B835]"
          >
            <Plus size={16} /> Tambah Shift
          </button>
        </div>

        {showForm && (
          <form action="javascript:void(0)" onSubmit={handleSubmit} className="bg-[#331419] gold-border rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#C4A484]">Karyawan</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                >
                  <option value="">Pilih Karyawan</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Hari</label>
                <select
                  value={form.day_of_week}
                  onChange={(e) => setForm({ ...form, day_of_week: parseInt(e.target.value, 10) })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                >
                  {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Jam Mulai</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-[#C4A484]">Jam Selesai</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-[#F4C842] text-[#1A0810] px-6 py-2 rounded-md text-sm font-medium">{editing ? "Update" : "Simpan"}</button>
              <button type="button" onClick={resetForm} className="bg-[#2A1015] text-[#C4A484] px-6 py-2 rounded-md text-sm">Batal</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : users.length === 0 ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <Calendar size={32} className="mx-auto mb-3 opacity-50" />
            Belum ada karyawan
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(244,200,66,0.2)]">
                  <th className="text-left py-3 px-4 text-[#C4A484] sticky left-0 bg-[#331419]">Karyawan</th>
                  {DAYS.map((d) => (
                    <th key={d.value} className="text-center py-3 px-2 text-[#C4A484] min-w-[110px]">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[rgba(244,200,66,0.08)]">
                    <td className="py-3 px-4 text-[#F5F5F5] font-medium sticky left-0 bg-[#331419]">{u.name}</td>
                    {DAYS.map((d) => {
                      const sch = lookup[`${u.id}-${d.value}`];
                      return (
                        <td key={d.value} className="py-2 px-2 text-center">
                          <button
                            onClick={() => openCell(u.id, d.value, sch)}
                            className={`w-full min-h-[44px] rounded px-2 py-1 text-xs ${
                              sch
                                ? "bg-[#F4C842]/15 text-[#F4C842] border border-[rgba(244,200,66,0.3)] hover:bg-[#F4C842]/25"
                                : "bg-[#2A1015] text-[#C4A484] border border-dashed border-[rgba(244,200,66,0.15)] hover:border-[rgba(244,200,66,0.4)]"
                            }`}
                          >
                            {sch ? (
                              <span className="flex flex-col items-center gap-0.5">
                                <span className="flex items-center gap-1"><Clock size={10} /> {sch.start_time}-{sch.end_time}</span>
                                <span
                                  onClick={(e) => { e.stopPropagation(); handleDelete(sch.id); }}
                                  className="text-red-400 hover:text-red-300"
                                  title="Hapus shift"
                                >
                                  <Trash2 size={11} />
                                </span>
                              </span>
                            ) : (
                              <Plus size={14} className="mx-auto opacity-50" />
                            )}
                          </button>
                        </td>
                      );
                    })}
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
