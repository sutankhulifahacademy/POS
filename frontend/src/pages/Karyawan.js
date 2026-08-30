import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../components/PageHeader";
import { Plus, KeyRound, Trash2, X, UserCog, Shield, Upload, User, Store } from "lucide-react";
import { toast } from "sonner";

const empty = {
  email: "", name: "", role: "kasir", password: "",
  phone: "", address: "", job_title: "",
  photo: "", ktp_image: "", ktp_number: "",
  outlet_ids: [], primary_outlet_id: "",
};

// Read file as base64 data URI (compressed for KTP/photo)
async function fileToDataURI(file, maxDim = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = h * maxDim / w; w = maxDim; } else { w = w * maxDim / h; h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Karyawan() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [newPass, setNewPass] = useState("");
  const [detail, setDetail] = useState(null);

  const load = async () => {
    try {
      const [usersRes, outletsRes] = await Promise.all([
        api.get("/users"),
        api.get("/outlets"),
      ]);
      setUsers(usersRes.data);
      setOutlets(outletsRes.data);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat karyawan"); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ ...empty, outlet_ids: [], primary_outlet_id: "" }); setEditing(null); setShowForm(true); };
  const openEdit = async (u) => {
    try {
      const { data } = await api.get(`/users/${u.id}`);
      setForm({ ...empty, ...data, password: "",
        outlet_ids: data.outlet_ids || (data.primary_outlet_id ? [data.primary_outlet_id] : []),
        primary_outlet_id: data.primary_outlet_id || "",
      });
      setEditing(u);
      setShowForm(true);
    } catch (e) { toast.error("Gagal memuat detail"); }
  };

  const toggleOutlet = (oid) => {
    const current = form.outlet_ids || [];
    const next = current.includes(oid) ? current.filter(x => x !== oid) : [...current, oid];
    setForm({ ...form, outlet_ids: next,
      primary_outlet_id: next.length === 1 ? next[0] : (next.includes(form.primary_outlet_id) ? form.primary_outlet_id : ""),
    });
  };

  const uploadImage = async (file, field) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Ukuran file maksimal 5MB");
    try {
      const uri = await fileToDataURI(file, field === "photo" ? 600 : 1000);
      setForm(prev => ({ ...prev, [field]: uri }));
      toast.success(`${field === "photo" ? "Foto" : "KTP"} siap`);
    } catch { toast.error("Gagal memproses gambar"); }
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (editing) {
        delete payload.email; delete payload.password;
        await api.put(`/users/${editing.id}`, payload);
        toast.success("Karyawan diperbarui");
      } else {
        await api.post("/users", payload);
        toast.success("Karyawan ditambahkan (langsung bisa login)");
      }
      setShowForm(false); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const doReset = async (e) => {
    e.preventDefault();
    if (newPass.length < 6) return toast.error("Password minimal 6 karakter");
    try {
      await api.post(`/users/${resetting.id}/reset-password`, { new_password: newPass });
      toast.success(`Password ${resetting.name} direset`);
      setResetting(null); setNewPass("");
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`Hapus karyawan ${name}?`)) return;
    try { await api.delete(`/users/${id}`); toast.success("Dihapus"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const roleLabel = { owner: "OWNER", admin: "ADMIN", manager: "MANAGER", kasir: "KASIR", supervisor: "SUPERVISOR" };
  const roleColor = (r) => r === "owner" ? "text-[#F4C842] bg-[#F4C842]/20 border border-[#F4C842]/40" : r === "admin" ? "text-[#E6B835] bg-[#E6B835]/10" : r === "manager" ? "text-[#7FD68F] bg-[#7FD68F]/10" : r === "supervisor" ? "text-blue-400 bg-blue-400/10" : "text-[#C4A484] bg-[#C4A484]/10";

  return (
    <div>
      <PageHeader title="Karyawan" subtitle="Data pegawai lengkap dengan foto, KTP, jabatan — otomatis jadi akun pengguna" actions={
        <button onClick={openNew} data-testid="add-employee-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
          <Plus size={16} /> Tambah Karyawan
        </button>
      } />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.length === 0 && <div className="col-span-full text-center py-16 text-[#C4A484]">Belum ada karyawan</div>}
          {users.map((u) => (
            <div key={u.id} className="bg-[#331419] gold-border rounded-lg p-5 card-hover" data-testid={`employee-${u.id}`}>
              <div className="flex items-start gap-4">
                {u.photo ? (
                  <img src={u.photo} alt={u.name} className="w-16 h-16 rounded-full object-cover border-2 border-[rgba(244,200,66,0.4)]" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#4A1A22] flex items-center justify-center border-2 border-[rgba(244,200,66,0.2)]">
                    <User size={24} className="text-[#C4A484]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[#F5F5F5] font-semibold truncate">{u.name}</p>
                  <p className="text-xs text-[#C4A484] truncate">{u.job_title || "—"}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded ${roleColor(u.role)}`}>{roleLabel[u.role]}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[rgba(244,200,66,0.1)] space-y-1 text-xs text-[#C4A484]">
                <p className="truncate">📧 {u.email}</p>
                {u.phone && <p>📱 {u.phone}</p>}
                {u.primary_outlet && (
                  <p className="text-[#F4C842]">
                    🏪 {u.primary_outlet}
                    {u.outlets && u.outlets.length > 1 && ` (+${u.outlets.length - 1} lainnya)`}
                  </p>
                )}
                {u.address && <p className="truncate">📍 {u.address}</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setDetail(u)} className="flex-1 text-xs text-[#F4C842] border border-[rgba(244,200,66,0.3)] py-1.5 rounded hover:bg-[#F4C842]/10 transition-colors">Detail</button>
                <button onClick={() => openEdit(u)} data-testid={`edit-employee-${u.id}`} className="p-2.5 text-[#C4A484] hover:text-[#F4C842]"><UserCog size={16} /></button>
                <button onClick={() => setResetting(u)} data-testid={`reset-employee-${u.id}`} className="p-2.5 text-[#C4A484] hover:text-[#F4C842]"><KeyRound size={16} /></button>
                <button onClick={() => remove(u.id, u.name)} className="p-2.5 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-3xl mx-4 w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between sticky top-0 bg-[#2A1015]">
              <div className="flex items-center gap-2">
                <Shield size={18} strokeWidth={1.5} className="text-[#F4C842]" />
                <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">{editing ? "Edit Karyawan" : "Tambah Karyawan Baru"}</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="employee-form">
              {/* Photo & KTP uploads */}
              <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="text-center">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-2 block">Foto Karyawan</label>
                  <div className="relative inline-block">
                    {form.photo ? (
                      <img src={form.photo} className="w-24 h-24 rounded-full object-cover border-2 border-[#F4C842]" alt="preview" />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-[#1A0810] border-2 border-dashed border-[rgba(244,200,66,0.3)] flex items-center justify-center">
                        <User size={32} className="text-[#C4A484]" />
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files[0], "photo")} className="absolute inset-0 opacity-0 cursor-pointer" data-testid="upload-photo" />
                  </div>
                  <p className="text-[10px] text-[#C4A484] mt-2">Klik foto untuk upload</p>
                </div>
                <div className="text-center">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-2 block">Foto KTP</label>
                  <div className="relative inline-block">
                    {form.ktp_image ? (
                      <img src={form.ktp_image} className="w-40 h-24 rounded object-cover border-2 border-[#F4C842]" alt="ktp preview" />
                    ) : (
                      <div className="w-40 h-24 rounded bg-[#1A0810] border-2 border-dashed border-[rgba(244,200,66,0.3)] flex items-center justify-center">
                        <Upload size={20} className="text-[#C4A484]" />
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files[0], "ktp_image")} className="absolute inset-0 opacity-0 cursor-pointer" data-testid="upload-ktp" />
                  </div>
                  <p className="text-[10px] text-[#C4A484] mt-2">Klik untuk upload KTP</p>
                </div>
              </div>

              <div className="col-span-2">
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Nama Lengkap *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="emp-name" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Email *</label>
                <input required type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5] disabled:opacity-50" data-testid="emp-email" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">No. Telepon</label>
                <input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="emp-phone" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Jabatan</label>
                <input value={form.job_title || ""} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="Chef / Waiter / Kasir Senior" className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="emp-jobtitle" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Peran Sistem *</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="emp-role">
                  <option value="kasir">Kasir</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  {currentUser?.role === "owner" && <option value="owner">Owner</option>}
                </select>
                {form.role === "owner" && (
                  <p className="text-[10px] text-[#F4C842] mt-1">Owner memiliki akses penuh ke semua outlet & menu</p>
                )}
                {form.role === "admin" && (
                  <p className="text-[10px] text-[#C4A484] mt-1">Admin memiliki akses ke outlet yang diassign saja</p>
                )}
              </div>

              {/* Outlet Assignment */}
              <div className="col-span-2">
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-2 block flex items-center gap-1">
                  <Store size={12} /> Outlet Assignment *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {outlets.map((o) => {
                    const selected = (form.outlet_ids || []).includes(o.id);
                    const isPrimary = form.primary_outlet_id === o.id;
                    return (
                      <div
                        key={o.id}
                        onClick={() => toggleOutlet(o.id)}
                        className={`cursor-pointer rounded-md border p-3 transition-colors ${
                          selected
                            ? "border-[#F4C842] bg-[#F4C842]/10"
                            : "border-[rgba(244,200,66,0.2)] bg-[#1A0810] hover:border-[rgba(244,200,66,0.4)]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[#F5F5F5]">{o.name}</span>
                          {selected && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setForm({ ...form, primary_outlet_id: o.id }); }}
                              className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
                                isPrimary ? "bg-[#F4C842] text-[#1A0810]" : "border border-[rgba(244,200,66,0.3)] text-[#C4A484]"
                              }`}
                            >
                              {isPrimary ? "Utama" : "Set Utama"}
                            </button>
                          )}
                        </div>
                        {o.address && <p className="text-[10px] text-[#C4A484] mt-1 truncate">{o.address}</p>}
                      </div>
                    );
                  })}
                </div>
                {(form.outlet_ids || []).length === 0 && (
                  <p className="text-[10px] text-[#C4A484] mt-1">Pilih minimal 1 outlet untuk karyawan ini</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Alamat</label>
                <textarea value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} rows="2" className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">No. KTP</label>
                <input value={form.ktp_number || ""} onChange={(e) => setForm({ ...form, ktp_number: e.target.value })} placeholder="16 digit" className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
              </div>
              {!editing && (
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Password Awal *</label>
                  <input required type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 karakter" className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="emp-password" />
                </div>
              )}
              <div className="col-span-2 flex gap-3 pt-4 border-t border-[rgba(244,200,66,0.15)]">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest">Batal</button>
                <button type="submit" data-testid="emp-submit-btn" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">
                  {editing ? "Simpan Perubahan" : "Tambah & Buat Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetting && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setResetting(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-sm w-full p-6">
            <div className="flex items-center gap-2 mb-4"><KeyRound size={18} className="text-[#F4C842]" /><h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Reset Password</h3></div>
            <p className="text-sm text-[#C4A484] mb-4">Reset password untuk <span className="text-[#F5F5F5]">{resetting.name}</span></p>
            <form onSubmit={doReset} className="space-y-3">
              <input required type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Password baru (min. 6 karakter)" className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="reset-password-input" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetting(null)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2 rounded-md text-xs uppercase">Batal</button>
                <button type="submit" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2 rounded-md text-xs font-semibold uppercase">Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-lg mx-4 w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-luxury text-2xl text-[#F4C842]">Detail Karyawan</h3>
              <button onClick={() => setDetail(null)} className="text-[#C4A484]"><X size={20} /></button>
            </div>
            <div className="flex items-start gap-4 mb-4">
              {detail.photo ? <img src={detail.photo} className="w-24 h-24 rounded-full object-cover border-2 border-[#F4C842]" alt="" /> : <div className="w-24 h-24 rounded-full bg-[#4A1A22] flex items-center justify-center"><User size={32} className="text-[#C4A484]" /></div>}
              <div>
                <p className="font-serif-luxury text-2xl text-[#F5F5F5]">{detail.name}</p>
                <p className="text-sm text-[#F4C842]">{detail.job_title || "—"}</p>
                <p className="text-xs text-[#C4A484] uppercase tracking-widest mt-1">{roleLabel[detail.role]}</p>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2"><dt className="w-24 text-[#C4A484]">Email</dt><dd className="text-[#F5F5F5]">{detail.email}</dd></div>
              <div className="flex gap-2"><dt className="w-24 text-[#C4A484]">Telepon</dt><dd className="text-[#F5F5F5]">{detail.phone || "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-24 text-[#C4A484]">Alamat</dt><dd className="text-[#F5F5F5]">{detail.address || "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-24 text-[#C4A484]">No. KTP</dt><dd className="text-[#F5F5F5]">{detail.ktp_number || "—"}</dd></div>
            </dl>
            {detail.ktp_number && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-widest text-[#C4A484] mb-2">Foto KTP</p>
                <FullKTPImage userId={detail.id} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FullKTPImage({ userId }) {
  const [ktp, setKtp] = useState(null);
  useEffect(() => { api.get(`/users/${userId}`).then(r => setKtp(r.data.ktp_image)); }, [userId]);
  if (!ktp) return <p className="text-xs text-[#C4A484] italic">Tidak ada foto KTP</p>;
  return <img src={ktp} alt="KTP" className="w-full rounded border border-[rgba(244,200,66,0.3)]" />;
}
