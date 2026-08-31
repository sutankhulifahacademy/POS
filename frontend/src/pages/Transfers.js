import { useEffect, useState } from "react";
import api from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, X, Trash2, ArrowRightLeft, CheckCircle, XCircle, Clock, Package, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { useOutlet } from "../context/OutletContext";
import { useAuth } from "../context/AuthContext";

const STATUS_COLORS = {
  pending: "text-[#F4C842] bg-[#F4C842]/10",
  checked: "text-blue-400 bg-blue-400/10",
  approved: "text-green-400 bg-green-400/10",
  rejected: "text-red-400 bg-red-400/10",
  completed: "text-green-400 bg-green-400/10",
  partially_processed: "text-[#F4C842] bg-[#F4C842]/10",
};

const STATUS_LABELS = {
  pending: "PENDING",
  checked: "CHECKED",
  approved: "APPROVED",
  rejected: "REJECTED",
  completed: "COMPLETED",
  partially_processed: "PARTIALLY PROCESSED",
};

export default function Transfers() {
  const { outlets: globalOutlets, outletIdForApi } = useOutlet();
  const { user } = useAuth();
  const [tab, setTab] = useState("list");
  const [transfers, setTransfers] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [fromOutlet, setFromOutlet] = useState(outletIdForApi || "");
  const [toOutlet, setToOutlet] = useState("");
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState(null);

  const canApprove = user && (user.role === "owner" || user.role === "manager");

  const load = async () => {
    const oParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
    const [t, p, pt] = await Promise.all([
      api.get(`/stock-transfers${oParam}`),
      api.get(`/products${oParam}`),
      api.get(`/stock-transfers/pending${oParam}`),
    ]);
    setTransfers(t.data);
    setProducts(p.data);
    setPendingTransfers(pt.data);
  };
  useEffect(() => { load(); }, [outletIdForApi]);

  const addLine = () => setItems([...items, { product_id: "", name: "", quantity: 1 }]);
  const updateLine = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeLine = (idx) => setItems(items.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    if (!fromOutlet || !toOutlet) return toast.error("Pilih outlet sumber & tujuan");
    if (fromOutlet === toOutlet) return toast.error("Outlet sumber & tujuan tidak boleh sama");
    if (items.length === 0) return toast.error("Tambahkan minimal 1 item");
    for (const it of items) if (!it.product_id || it.quantity <= 0) return toast.error("Setiap item harus lengkap");
    const from = globalOutlets.find(o => o.id === fromOutlet);
    const to = globalOutlets.find(o => o.id === toOutlet);
    try {
      await api.post("/stock-transfers", {
        from_outlet_id: fromOutlet, to_outlet_id: toOutlet,
        from_outlet_name: from.name, to_outlet_name: to.name,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, quantity: Number(i.quantity) })),
        note,
      });
      toast.success("Transfer stok dibuat — menunggu approval di outlet tujuan");
      setShowForm(false); setFromOutlet(""); setToOutlet(""); setItems([]); setNote("");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const openDetail = async (t) => {
    try {
      const { data } = await api.get(`/stock-transfers/${t.id}`);
      setDetail(data);
    } catch (err) { toast.error("Gagal memuat detail"); }
  };

  const checkItem = async (item, qtyReceived, noteText) => {
    try {
      await api.put(`/stock-transfers/items/${item.id}/check`, { qty_received: Number(qtyReceived), note: noteText });
      toast.success("Item di-check");
      if (detail) openDetail(detail);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const approveItem = async (item) => {
    try {
      await api.post(`/stock-transfers/items/${item.id}/approve`);
      toast.success(`Item ${item.product_name} di-approve — stok bertambah ${item.qty_received}`);
      if (detail) openDetail(detail);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const rejectItem = async (item, noteText) => {
    try {
      await api.post(`/stock-transfers/items/${item.id}/reject`, { note: noteText });
      toast.success(`Item ${item.product_name} di-reject — tidak ada stok masuk`);
      if (detail) openDetail(detail);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title="Transfer Antar Outlet" subtitle="Pindahkan stok antar outlet dengan approval per item" actions={
        <button onClick={() => setShowForm(true)} data-testid="add-transfer-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
          <Plus size={16} /> Buat Transfer
        </button>
      } />

      {/* Tabs */}
      <div className="px-4 md:px-6 lg:px-8 flex gap-2 mb-4">
        <button onClick={() => setTab("list")} className={`px-5 py-2 rounded-md text-sm uppercase tracking-wider transition-colors ${tab === "list" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}>
          Semua Transfer
        </button>
        <button onClick={() => setTab("pending")} className={`px-5 py-2 rounded-md text-sm uppercase tracking-wider transition-colors flex items-center gap-2 ${tab === "pending" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`} data-testid="tab-pending">
          <ClipboardCheck size={16} /> Pending Task
          {pendingTransfers.length > 0 && <span className="bg-[#8B0000] text-white text-xs px-2 py-0.5 rounded-full">{pendingTransfers.length}</span>}
        </button>
      </div>

      {/* === LIST TAB === */}
      {tab === "list" && (
        <div className="p-4 md:p-6 lg:p-8">
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                  <th className="px-6 py-4">No. Transfer</th>
                  <th className="px-6 py-4">Dari</th>
                  <th className="px-6 py-4"></th>
                  <th className="px-6 py-4">Ke</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Item</th>
                  <th className="px-6 py-4">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-[#C4A484]"><ArrowRightLeft size={40} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />Belum ada transfer</td></tr>}
                {transfers.map((t) => (
                  <tr key={t.id} onClick={() => openDetail(t)} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors cursor-pointer" data-testid={`transfer-row-${t.id}`}>
                    <td className="px-6 py-3 text-sm text-[#F4C842]">{t.transfer_no}</td>
                    <td className="px-6 py-3 text-sm text-[#F5F5F5]">{t.from_outlet_name}</td>
                    <td className="px-6 py-3 text-[#F4C842]"><ArrowRightLeft size={16} /></td>
                    <td className="px-6 py-3 text-sm text-[#F5F5F5]">{t.to_outlet_name}</td>
                    <td className="px-6 py-3"><span className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${STATUS_COLORS[t.status] || ""}`}>{STATUS_LABELS[t.status] || t.status}</span></td>
                    <td className="px-6 py-3 text-sm text-[#C4A484]">{t.item_count || (t.items?.length || 0)} item</td>
                    <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(t.created_at).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === PENDING TASK TAB === */}
      {tab === "pending" && (
        <div className="p-4 md:p-6 lg:p-8">
          {pendingTransfers.length === 0 ? (
            <div className="bg-[#331419] gold-border rounded-lg p-12 text-center">
              <ClipboardCheck size={48} strokeWidth={1.2} className="mx-auto mb-4 text-[#C4A484] opacity-40" />
              <p className="text-[#C4A484]">Tidak ada pending task</p>
              <p className="text-xs text-[#C4A484] mt-2">Semua transfer sudah diproses</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {pendingTransfers.map((t) => (
                <div key={t.id} className="bg-[#331419] gold-border rounded-lg p-6 flex items-center gap-4 hover:bg-[#4A1A22] transition-colors cursor-pointer" onClick={() => openDetail(t)} data-testid={`pending-transfer-${t.id}`}>
                  <div className="w-12 h-12 rounded-full bg-[#F4C842]/10 flex items-center justify-center">
                    <Package size={24} className="text-[#F4C842]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[#F4C842] font-semibold">{t.transfer_no}</span>
                      <span className="text-xs text-[#C4A484]">{t.from_outlet_name} → {t.to_outlet_name}</span>
                    </div>
                    <p className="text-sm text-[#F5F5F5]">{t.pending_count || 0} item menunggu pemeriksaan</p>
                    <p className="text-xs text-[#C4A484] mt-1">{new Date(t.created_at).toLocaleString("id-ID")} · oleh {t.created_by_name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-wider px-3 py-1 rounded bg-[#F4C842]/10 text-[#F4C842] flex items-center gap-1">
                      <Clock size={14} /> PENDING
                    </span>
                    <button className="bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">Review Transfer</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === CREATE FORM === */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-3xl mx-4 w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">Buat Transfer Stok</h2>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form action="javascript:void(0)" onSubmit={submit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Dari Outlet</label>
                  <select required value={fromOutlet} onChange={(e) => setFromOutlet(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="transfer-from">
                    <option value="">Pilih outlet sumber</option>
                    {globalOutlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Ke Outlet</label>
                  <select required value={toOutlet} onChange={(e) => setToOutlet(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="transfer-to">
                    <option value="">Pilih outlet tujuan</option>
                    {globalOutlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484]">Item Transfer</label>
                  <button type="button" onClick={addLine} data-testid="transfer-add-line" className="text-xs text-[#F4C842] hover:text-[#FFDD5C] flex items-center gap-1"><Plus size={16} /> Tambah baris</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="overflow-x-auto">
                      <div className="grid grid-cols-12 gap-2 items-center min-w-[700px]">
                        <select value={it.product_id} onChange={(e) => {
                          const p = products.find(pr => pr.id === e.target.value);
                          updateLine(idx, { product_id: e.target.value, name: p?.name || "" });
                        }} className="col-span-8 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]">
                          <option value="">Pilih produk</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name} (stok: {p.stock})</option>)}
                        </select>
                        <input type="number" min="1" value={it.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} placeholder="Qty" className="col-span-3 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                        <button type="button" onClick={() => removeLine(idx)} className="col-span-1 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-[#C4A484] italic">Belum ada item. Klik "Tambah baris".</p>}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" placeholder="Alasan transfer, dll." />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors">Batal</button>
                <button type="submit" data-testid="transfer-submit" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Konfirmasi Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === DETAIL MODAL with Item Approval === */}
      {detail && (
        <TransferDetail
          detail={detail}
          canApprove={canApprove}
          onClose={() => setDetail(null)}
          onCheck={checkItem}
          onApprove={approveItem}
          onReject={rejectItem}
          onRefresh={() => openDetail(detail)}
        />
      )}
    </div>
  );
}

// ============ TRANSFER DETAIL with Item-Level Approval ============
function TransferDetail({ detail, canApprove, onClose, onCheck, onApprove, onReject, onRefresh }) {
  const items = detail.items || [];
  const allProcessed = items.length > 0 && items.every(i => i.status === "approved" || i.status === "rejected");

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-2xl mx-4 w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-[rgba(244,200,66,0.15)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif-luxury text-2xl text-[#F4C842]">Transfer Stok Masuk</h3>
            <button onClick={onClose} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
          </div>
          <div className="text-center">
            <p className="text-[#F4C842] font-semibold text-lg">{detail.transfer_no}</p>
            <div className="flex items-center justify-center gap-3 text-sm text-[#C4A484] my-2">
              <span className="text-[#F5F5F5]">{detail.from_outlet_name}</span>
              <ArrowRightLeft size={16} className="text-[#F4C842]" />
              <span className="text-[#F5F5F5]">{detail.to_outlet_name}</span>
            </div>
            <p className="text-xs text-[#C4A484]">{new Date(detail.created_at).toLocaleString("id-ID")} · oleh {detail.created_by_name}</p>
            <div className="mt-2">
              <span className={`text-xs uppercase tracking-wider px-3 py-1 rounded ${STATUS_COLORS[detail.status] || ""}`}>
                {STATUS_LABELS[detail.status] || detail.status}
              </span>
            </div>
          </div>
          {detail.note && <p className="text-xs text-[#C4A484] italic mt-3 text-center">"{detail.note}"</p>}
        </div>

        {/* Items */}
        <div className="p-6 space-y-4">
          <h4 className="text-sm uppercase tracking-widest text-[#C4A484]">Daftar Item ({items.length})</h4>
          {items.map((item, idx) => (
            <TransferItemCard
              key={item.id || idx}
              item={item}
              canApprove={canApprove}
              onCheck={onCheck}
              onApprove={onApprove}
              onReject={onReject}
              onRefresh={onRefresh}
            />
          ))}
          {items.length === 0 && <p className="text-[#C4A484] text-sm text-center py-4">Tidak ada item</p>}
        </div>

        <div className="p-6 border-t border-[rgba(244,200,66,0.15)]">
          <button onClick={onClose} className="w-full bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Tutup</button>
        </div>
      </div>
    </div>
  );
}

// ============ TRANSFER ITEM CARD ============
function TransferItemCard({ item, canApprove, onCheck, onApprove, onReject, onRefresh }) {
  const [qtyReceived, setQtyReceived] = useState(item.qty_received ?? item.qty_sent ?? 0);
  const [note, setNote] = useState(item.note || "");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isMatch = Number(qtyReceived) === item.qty_sent;
  const difference = Number(qtyReceived) - item.qty_sent;
  const status = item.status;

  const handleCheck = () => {
    onCheck(item, qtyReceived, note);
  };

  const handleApprove = () => {
    onApprove(item);
  };

  const handleReject = () => {
    if (!note.trim()) {
      toast.error("Note wajib diisi untuk item yang direject");
      return;
    }
    onReject(item, note);
  };

  return (
    <div className={`bg-[#331419] border rounded-lg p-4 ${status === "approved" ? "border-green-400/30" : status === "rejected" ? "border-red-400/30" : "border-[rgba(244,200,66,0.15)]"}`} data-testid={`transfer-item-${item.id}`}>
      {/* Item header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${status === "approved" ? "bg-green-400 border-green-400" : status === "rejected" ? "bg-red-400 border-red-400" : status === "checked" ? "bg-blue-400 border-blue-400" : "border-[rgba(244,200,66,0.3)]"}`}>
          {status === "approved" && <CheckCircle size={16} className="text-[#1A0810]" />}
          {status === "rejected" && <XCircle size={16} className="text-[#1A0810]" />}
          {status === "checked" && <CheckCircle size={16} className="text-[#1A0810]" />}
        </div>
        <span className="text-[#F5F5F5] font-medium flex-1">{item.product_name}</span>
        <span className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${STATUS_COLORS[status] || ""}`}>{STATUS_LABELS[status] || status}</span>
      </div>

      {/* Qty info */}
      <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
        <div>
          <p className="text-xs text-[#C4A484] uppercase tracking-wider">Dikirim</p>
          <p className="text-[#F5F5F5] font-semibold">{item.qty_sent} pcs</p>
        </div>
        <div>
          <p className="text-xs text-[#C4A484] uppercase tracking-wider">Diterima</p>
          {status === "pending" ? (
            <input type="number" min="0" value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-1 text-[#F5F5F5] text-sm" data-testid={`qty-received-${item.id}`} />
          ) : (
            <p className={`font-semibold ${item.qty_received != null && item.qty_received !== item.qty_sent ? "text-red-400" : "text-[#F5F5F5]"}`}>{item.qty_received ?? "-"} pcs</p>
          )}
        </div>
        <div>
          <p className="text-xs text-[#C4A484] uppercase tracking-wider">Selisih</p>
          <p className={`font-semibold ${status === "pending" ? (isMatch ? "text-green-400" : "text-red-400") : (item.qty_received != null && item.qty_received === item.qty_sent ? "text-green-400" : "text-red-400")}`}>
            {status === "pending" ? (isMatch ? "0 (MATCH)" : `${difference} (MISMATCH)`) : (item.qty_received != null ? (item.qty_received - item.qty_sent) : "-")}
          </p>
        </div>
      </div>

      {/* Note */}
      {(status === "pending" || showRejectInput || (status === "rejected" && item.note)) && (
        <div className="mb-3">
          <label className="text-xs text-[#C4A484] uppercase tracking-wider mb-1 block">Note</label>
          {status === "pending" || showRejectInput ? (
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keterangan (wajib untuk mismatch)" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm" data-testid={`item-note-${item.id}`} />
          ) : (
            <p className="text-xs text-[#C4A484] italic">"{item.note}"</p>
          )}
        </div>
      )}

      {/* Approval info */}
      {status === "approved" && (
        <div className="text-xs text-green-400 flex items-center gap-2">
          <CheckCircle size={14} /> Approved by {item.approved_by_name} · {item.approved_at ? new Date(item.approved_at).toLocaleString("id-ID") : ""}
          <span className="ml-auto text-[#C4A484]">+{item.qty_received} ke inventory</span>
        </div>
      )}
      {status === "rejected" && (
        <div className="text-xs text-red-400 flex items-center gap-2">
          <XCircle size={14} /> Rejected by {item.approved_by_name} · {item.approved_at ? new Date(item.approved_at).toLocaleString("id-ID") : ""}
          <span className="ml-auto text-[#C4A484]">+0 ke inventory</span>
        </div>
      )}
      {status === "checked" && (
        <div className="text-xs text-blue-400 flex items-center gap-2">
          <ClipboardCheck size={14} /> Checked by {item.checked_by_name} · {item.checked_at ? new Date(item.checked_at).toLocaleString("id-ID") : ""}
        </div>
      )}

      {/* Action buttons */}
      {canApprove && status === "pending" && (
        <div className="flex gap-2 mt-3">
          <button onClick={handleCheck} className="flex-1 bg-blue-500/20 border border-blue-400/30 text-blue-400 py-2 rounded-md text-xs uppercase tracking-wider hover:bg-blue-500/30 transition-colors" data-testid={`check-item-${item.id}`}>
            <ClipboardCheck size={14} className="inline mr-1" /> Check Item
          </button>
        </div>
      )}
      {canApprove && status === "checked" && isMatch && (
        <div className="flex gap-2 mt-3">
          <button onClick={handleApprove} className="flex-1 bg-green-500/20 border border-green-400/30 text-green-400 py-2 rounded-md text-xs uppercase tracking-wider hover:bg-green-500/30 transition-colors" data-testid={`approve-item-${item.id}`}>
            <CheckCircle size={14} className="inline mr-1" /> Approve Item (+{item.qty_received})
          </button>
          <button onClick={() => setShowRejectInput(true)} className="flex-1 bg-red-500/20 border border-red-400/30 text-red-400 py-2 rounded-md text-xs uppercase tracking-wider hover:bg-red-500/30 transition-colors" data-testid={`reject-item-${item.id}`}>
            <XCircle size={14} className="inline mr-1" /> Reject
          </button>
        </div>
      )}
      {canApprove && status === "checked" && !isMatch && (
        <div className="flex gap-2 mt-3">
          <div className="flex-1 text-xs text-red-400 flex items-center gap-2">
            <XCircle size={14} /> MISMATCH — Qty tidak sesuai, item harus direject
          </div>
          <button onClick={handleReject} className="flex-1 bg-red-500/20 border border-red-400/30 text-red-400 py-2 rounded-md text-xs uppercase tracking-wider hover:bg-red-500/30 transition-colors" data-testid={`reject-item-${item.id}`}>
            <XCircle size={14} className="inline mr-1" /> Reject Item
          </button>
        </div>
      )}
      {canApprove && status === "checked" && !isMatch && showRejectInput && (
        <div className="flex gap-2 mt-2">
          <button onClick={handleReject} className="flex-1 bg-red-500/20 border border-red-400/30 text-red-400 py-2 rounded-md text-xs uppercase tracking-wider hover:bg-red-500/30 transition-colors">
            Konfirmasi Reject
          </button>
        </div>
      )}
      {!canApprove && status === "pending" && (
        <p className="text-xs text-[#C4A484] italic mt-2">Hanya Manager/Owner yang dapat approve/reject</p>
      )}
    </div>
  );
}
