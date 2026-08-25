import { useEffect, useState } from "react";
import api from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, KeyRound, Trash2, X, UserCog, Shield } from "lucide-react";
import { toast } from "sonner";

const empty = { email: "", name: "", role: "kasir", password: "" };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [newPass, setNewPass] = useState("");

  const load = async () => {
    try { const { data } = await api.get("/users"); setUsers(data); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat pengguna"); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditing(null); setShowForm(true); };
  const openEdit = (u) => { setForm({ email: u.email, name: u.name, role: u.role, password: "" }); setEditing(u); setShowForm(true); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, { name: form.name, role: form.role });
        toast.success("Pengguna diperbarui");
      } else {
        await api.post("/users", form);
        toast.success("Pengguna dibuat");
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
    if (!window.confirm(`Hapus akun ${name}?`)) return;
    try { await api.delete(`/users/${id}`); toast.success("Dihapus"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const roleColor = (r) => r === "admin" ? "text-[#D4AF37] bg-[#D4AF37]/10" : r === "manager" ? "text-[#2E8B57] bg-[#2E8B57]/10" : "text-[#A39B8B] bg-[#A39B8B]/10";

  return (
    <div>
      <PageHeader title="Manajemen Pengguna" subtitle="Undang kasir/manager, atur peran, dan reset password" actions={
        <button onClick={openNew} data-testid="add-user-btn" className="flex items-center gap-2 bg-[#D4AF37] text-[#050505] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFD700] transition-colors">
          <Plus size={16} /> Undang Pengguna
        </button>
      } />
      <div className="p-8">
        <div className="bg-[#111] gold-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#A39B8B] border-b border-[rgba(212,175,55,0.15)]">
                <th className="px-6 py-4">Nama</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Peran</th>
                <th className="px-6 py-4">Dibuat</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-[#A39B8B]">Belum ada pengguna</td></tr>}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[rgba(212,175,55,0.08)] last:border-0 hover:bg-[#1A1A1A] transition-colors" data-testid={`user-row-${u.id}`}>
                  <td className="px-6 py-3 text-sm text-[#FDFBF7]">{u.name}</td>
                  <td className="px-6 py-3 text-sm text-[#A39B8B]">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${roleColor(u.role)}`}>{u.role}</span>
                  </td>
                  <td className="px-6 py-3 text-xs text-[#A39B8B]">{new Date(u.created_at).toLocaleDateString("id-ID")}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`} className="p-2 text-[#A39B8B] hover:text-[#D4AF37] transition-colors" title="Edit peran"><UserCog size={15} strokeWidth={1.5} /></button>
                      <button onClick={() => setResetting(u)} data-testid={`reset-user-${u.id}`} className="p-2 text-[#A39B8B] hover:text-[#D4AF37] transition-colors" title="Reset password"><KeyRound size={15} strokeWidth={1.5} /></button>
                      <button onClick={() => remove(u.id, u.name)} data-testid={`delete-user-${u.id}`} className="p-2 text-[#A39B8B] hover:text-[#8B0000] transition-colors" title="Hapus"><Trash2 size={15} strokeWidth={1.5} /></button>
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
          <div onClick={(e) => e.stopPropagation()} className="bg-[#0A0A0A] gold-border rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-[rgba(212,175,55,0.15)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={18} strokeWidth={1.5} className="text-[#D4AF37]" />
                <h2 className="font-serif-luxury text-2xl text-[#FDFBF7]">{editing ? "Edit Pengguna" : "Undang Pengguna Baru"}</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="text-[#A39B8B] hover:text-[#FDFBF7]"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4" data-testid="user-form">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Nama</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" data-testid="user-name" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Email</label>
                <input required type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7] disabled:opacity-50" data-testid="user-email" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Peran</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" data-testid="user-role">
                  <option value="kasir">Kasir</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-[10px] text-[#A39B8B] mt-1">
                  Kasir: hanya POS & pelanggan · Manager: + produk, inventory, PO · Admin: full akses
                </p>
              </div>
              {!editing && (
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#A39B8B] mb-1 block">Password Awal</label>
                  <input required type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" placeholder="Min. 6 karakter" data-testid="user-password" />
                  <p className="text-[10px] text-[#A39B8B] mt-1">Bagikan password ini ke pengguna, mereka dapat mengganti saat login.</p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(212,175,55,0.3)] text-[#D4AF37] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#111] transition-colors">Batal</button>
                <button type="submit" data-testid="user-submit-btn" className="flex-1 bg-[#D4AF37] text-[#050505] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFD700] transition-colors">{editing ? "Simpan" : "Undang"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetting && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setResetting(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#0A0A0A] gold-border rounded-lg max-w-sm w-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound size={18} strokeWidth={1.5} className="text-[#D4AF37]" />
              <h3 className="font-serif-luxury text-xl text-[#FDFBF7]">Reset Password</h3>
            </div>
            <p className="text-sm text-[#A39B8B] mb-4">Reset password untuk <span className="text-[#FDFBF7]">{resetting.name}</span></p>
            <form onSubmit={doReset} className="space-y-3">
              <input required type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Password baru (min. 6 karakter)" className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-[#FDFBF7]" data-testid="reset-password-input" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetting(null)} className="flex-1 border border-[rgba(212,175,55,0.3)] text-[#D4AF37] py-2 rounded-md text-xs uppercase tracking-widest">Batal</button>
                <button type="submit" data-testid="reset-password-submit" className="flex-1 bg-[#D4AF37] text-[#050505] py-2 rounded-md text-xs font-semibold uppercase tracking-widest">Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
