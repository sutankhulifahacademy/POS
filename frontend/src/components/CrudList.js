import { useEffect, useState } from "react";
import api from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, Edit3, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export default function CrudList({ title, subtitle, endpoint, fields, testPrefix }) {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const emptyForm = Object.fromEntries(fields.map(f => [f.key, f.default ?? ""]));
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const { data } = await api.get(`/${endpoint}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [endpoint]);

  const openNew = () => { setForm(emptyForm); setEditing(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...emptyForm, ...item }); setEditing(item.id); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/${endpoint}/${editing}`, form);
      else await api.post(`/${endpoint}`, form);
      toast.success(editing ? "Diperbarui" : "Ditambahkan");
      setShowForm(false); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Hapus data ini?")) return;
    try { await api.delete(`/${endpoint}/${id}`); toast.success("Dihapus"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={
        <button onClick={openNew} data-testid={`${testPrefix}-add-btn`} className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
          <Plus size={16} strokeWidth={2} /> Tambah
        </button>
      } />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                {fields.filter(f => f.showInList !== false).map((f) => <th key={f.key} className="px-6 py-4">{f.label}</th>)}
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={fields.length + 1} className="px-6 py-12 text-center text-[#C4A484]">Belum ada data.</td></tr>}
              {items.map((it) => (
                <tr key={it.id} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors">
                  {fields.filter(f => f.showInList !== false).map((f) => (
                    <td key={f.key} className="px-6 py-3 text-sm text-[#F5F5F5]">
                     {typeof it[f.key] === "boolean"
                        ? (it[f.key] ? "✓" : "—")
                        : (it[f.key] || (
                            <span className="text-[#C4A484]">—</span>
                          ))
                      }
                    </td>
                  ))}
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(it)} data-testid={`${testPrefix}-edit-${it.id}`} className="p-2 text-[#C4A484] hover:text-[#F4C842]"><Edit3 size={15} strokeWidth={1.5} /></button>
                      <button onClick={() => remove(it.id)} data-testid={`${testPrefix}-delete-${it.id}`} className="p-2 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={15} strokeWidth={1.5} /></button>
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
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-lg w-full max-h-[90vh] overflow-y-auto mx-4">
            <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">{editing ? "Edit" : "Tambah"} {title}</h2>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form onSubmit={save} className="p-6 space-y-4">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">{f.label} {f.required && "*"}</label>
                  {f.type === "textarea" ? (
                    <textarea value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                  ) : f.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm text-[#F5F5F5]">
                      <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} className="accent-[#F4C842]" /> {f.label}
                    </label>
                  ) : (
                    <input required={f.required} type={f.type || "text"} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid={`${testPrefix}-field-${f.key}`} />
                  )}
                </div>
              ))}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors">Batal</button>
                <button type="submit" data-testid={`${testPrefix}-form-submit`} className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
