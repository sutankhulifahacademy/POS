import { useEffect, useState } from "react";
import api from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, X, Trash2, Package, CheckCircle, XCircle, Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useOutlet } from "../context/OutletContext";
import { useAuth } from "../context/AuthContext";

const STATUS_COLORS = {
  draft: "text-[#C4A484] bg-[#C4A484]/10",
  submitted: "text-[#F4C842] bg-[#F4C842]/10",
  approved: "text-green-400 bg-green-400/10",
  partially_approved: "text-blue-400 bg-blue-400/10",
  rejected: "text-red-400 bg-red-400/10",
  converted: "text-green-400 bg-green-400/10",
};

const STATUS_LABELS = {
  draft: "DRAFT",
  submitted: "PENDING REVIEW",
  approved: "APPROVED",
  partially_approved: "PARTIALLY APPROVED",
  rejected: "REJECTED",
  converted: "CONVERTED",
};

export default function StockRequests() {
  const { outlets: globalOutlets, outletIdForApi } = useOutlet();
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [items, setItems] = useState([]);
  const [priority, setPriority] = useState("normal");
  const [note, setNote] = useState("");
  const [selectedOutlet, setSelectedOutlet] = useState(outletIdForApi || "");

  const canApprove = user && (user.role === "owner" || user.role === "manager");

  const load = async () => {
    const oParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
    const [r, p] = await Promise.all([
      api.get(`/stock-requests${oParam}`),
      api.get(`/products`),
    ]);
    setRequests(r.data);
    setProducts(p.data);
  };
  useEffect(() => { load(); }, [outletIdForApi]);

  const addLine = () => setItems([...items, { product_id: "", name: "", qty_requested: 1, note: "" }]);
  const updateLine = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeLine = (idx) => setItems(items.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedOutlet) return toast.error("Pilih outlet");
    if (items.length === 0) return toast.error("Tambahkan minimal 1 item");
    for (const it of items) if (!it.product_id || it.qty_requested <= 0) return toast.error("Setiap item harus lengkap");
    try {
      await api.post("/stock-requests", {
        requesting_outlet_id: selectedOutlet,
        priority,
        note,
        items: items.map(i => ({ product_id: i.product_id, qty_requested: Number(i.qty_requested) })),
        status: "submitted",
      });
      toast.success("Request stok dibuat dan dikirim ke pusat");
      setShowForm(false); setItems([]); setNote(""); setPriority("normal");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const openDetail = async (r) => {
    try {
      const { data } = await api.get(`/stock-requests/${r.id}`);
      setDetail(data);
    } catch (err) { toast.error("Gagal memuat detail"); }
  };

  const approveRequest = async (reviewNote, itemApprovals) => {
    try {
      await api.post(`/stock-requests/${detail.id}/approve`, { review_note: reviewNote, items: itemApprovals });
      toast.success("Request di-approve");
      openDetail(detail);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const rejectRequest = async (reviewNote) => {
    try {
      await api.post(`/stock-requests/${detail.id}/reject`, { review_note: reviewNote });
      toast.success("Request di-reject");
      openDetail(detail);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const convertToTransfer = async () => {
    try {
      const { data } = await api.post(`/stock-requests/${detail.id}/convert-to-transfer`);
      toast.success(`Transfer ${data.transfer_no} dibuat — Surat Jalan ${data.delivery_no}`);
      openDetail(detail);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title="Request Stok" subtitle="Ajukan kebutuhan stok dari cabang ke pusat" actions={
        <button onClick={() => { setShowForm(true); setSelectedOutlet(outletIdForApi || ""); }} data-testid="add-request-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
          <Plus size={16} /> Buat Request
        </button>
      } />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                <th className="px-6 py-4">No. Request</th>
                <th className="px-6 py-4">Outlet</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Item</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-[#C4A484]"><Package size={40} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />Belum ada request</td></tr>}
              {requests.map((r) => (
                <tr key={r.id} onClick={() => openDetail(r)} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors cursor-pointer" data-testid={`request-row-${r.id}`}>
                  <td className="px-6 py-3 text-sm text-[#F4C842]">{r.request_no}</td>
                  <td className="px-6 py-3 text-sm text-[#F5F5F5]">{r.requesting_outlet_name}</td>
                  <td className="px-6 py-3"><span className={`text-xs uppercase ${r.priority === "urgent" ? "text-red-400" : "text-[#C4A484]"}`}>{r.priority}</span></td>
                  <td className="px-6 py-3"><span className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${STATUS_COLORS[r.status] || ""}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
                  <td className="px-6 py-3 text-sm text-[#C4A484]">{r.item_count || 0} item</td>
                  <td className="px-6 py-3 text-sm text-[#C4A484]">{r.total_qty_requested || 0}</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(r.created_at).toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === CREATE FORM === */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-3xl mx-4 w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">Buat Request Stok</h2>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <form action="javascript:void(0)" onSubmit={submit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Outlet Request</label>
                  <select required value={selectedOutlet} onChange={(e) => setSelectedOutlet(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]">
                    <option value="">Pilih outlet</option>
                    {globalOutlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]">
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484]">Item Request</label>
                  <button type="button" onClick={addLine} className="text-xs text-[#F4C842] hover:text-[#FFDD5C] flex items-center gap-1"><Plus size={16} /> Tambah baris</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <select value={it.product_id} onChange={(e) => {
                        const p = products.find(pr => pr.id === e.target.value);
                        updateLine(idx, { product_id: e.target.value, name: p?.name || "" });
                      }} className="col-span-8 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]">
                        <option value="">Pilih produk</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="number" min="1" value={it.qty_requested} onChange={(e) => updateLine(idx, { qty_requested: e.target.value })} placeholder="Qty" className="col-span-3 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-sm text-[#F5F5F5]" />
                      <button type="button" onClick={() => removeLine(idx)} className="col-span-1 text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-[#C4A484] italic">Belum ada item. Klik "Tambah baris".</p>}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" placeholder="Kebutuhan operasional, dll." />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419]">Batal</button>
                <button type="submit" data-testid="request-submit" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C]">Kirim Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === DETAIL MODAL === */}
      {detail && (
        <RequestDetail
          detail={detail}
          canApprove={canApprove}
          canConvert={user && (user.role === "owner" || user.role === "manager" || user.role === "admin")}
          onClose={() => setDetail(null)}
          onApprove={approveRequest}
          onReject={rejectRequest}
          onConvert={convertToTransfer}
          onRefresh={() => openDetail(detail)}
        />
      )}
    </div>
  );
}

// ============ REQUEST DETAIL ============
function RequestDetail({ detail, canApprove, canConvert, onClose, onApprove, onReject, onConvert, onRefresh }) {
  const [reviewNote, setReviewNote] = useState("");
  const [itemApprovals, setItemApprovals] = useState(
    (detail.items || []).map(i => ({ id: i.id, qty_approved: i.qty_requested, status: "approved", note: "" }))
  );
  const [showApproveForm, setShowApproveForm] = useState(false);

  const updateApproval = (idx, patch) => setItemApprovals(itemApprovals.map((a, i) => i === idx ? { ...a, ...patch } : a));

  const handleApprove = () => {
    onApprove(reviewNote, itemApprovals);
    setShowApproveForm(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-2xl mx-4 w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-[rgba(244,200,66,0.15)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif-luxury text-2xl text-[#F4C842]">Stock Request</h3>
            <button onClick={onClose} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
          </div>
          <div className="text-center">
            <p className="text-[#F4C842] font-semibold text-lg">{detail.request_no}</p>
            <p className="text-sm text-[#F5F5F5] mt-1">{detail.requesting_outlet_name}</p>
            <p className="text-xs text-[#C4A484] mt-1">{new Date(detail.created_at).toLocaleString("id-ID")} · oleh {detail.created_by_name}</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className={`text-xs uppercase tracking-wider px-3 py-1 rounded ${STATUS_COLORS[detail.status] || ""}`}>{STATUS_LABELS[detail.status] || detail.status}</span>
              <span className={`text-xs uppercase px-2 py-1 rounded ${detail.priority === "urgent" ? "text-red-400 bg-red-400/10" : "text-[#C4A484] bg-[#C4A484]/10"}`}>{detail.priority}</span>
            </div>
          </div>
          {detail.note && <p className="text-xs text-[#C4A484] italic mt-3 text-center">"{detail.note}"</p>}
          {detail.review_note && <p className="text-xs text-blue-400 italic mt-2 text-center">Review: "{detail.review_note}"</p>}
        </div>

        {/* Items */}
        <div className="p-6 space-y-3">
          <h4 className="text-sm uppercase tracking-widest text-[#C4A484]">Daftar Item ({detail.items?.length || 0})</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#C4A484] text-xs uppercase border-b border-[rgba(244,200,66,0.15)]">
                <th className="py-2 text-left">Item</th>
                <th className="py-2 text-right">Diminta</th>
                <th className="py-2 text-right">Disetujui</th>
                <th className="py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.items?.map((item, idx) => (
                <tr key={item.id} className="border-b border-[rgba(244,200,66,0.08)]">
                  <td className="py-2 text-[#F5F5F5]">{item.product_name}</td>
                  <td className="py-2 text-right text-[#F5F5F5]">{item.qty_requested}</td>
                  <td className="py-2 text-right text-[#F5F5F5]">{item.qty_approved ?? "-"}</td>
                  <td className="py-2 text-center"><span className={`text-xs uppercase px-2 py-0.5 rounded ${item.status === "approved" ? "text-green-400 bg-green-400/10" : item.status === "rejected" ? "text-red-400 bg-red-400/10" : "text-[#F4C842] bg-[#F4C842]/10"}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Approval form */}
          {canApprove && detail.status === "submitted" && !showApproveForm && (
            <div className="flex gap-2 pt-4">
              <button onClick={() => setShowApproveForm(true)} className="flex-1 bg-green-500/20 border border-green-400/30 text-green-400 py-2.5 rounded-md text-sm uppercase tracking-wider hover:bg-green-500/30">
                <CheckCircle size={14} className="inline mr-1" /> Approve Request
              </button>
              <button onClick={() => onReject(reviewNote)} className="flex-1 bg-red-500/20 border border-red-400/30 text-red-400 py-2.5 rounded-md text-sm uppercase tracking-wider hover:bg-red-500/30">
                <XCircle size={14} className="inline mr-1" /> Reject
              </button>
            </div>
          )}

          {showApproveForm && (
            <div className="bg-[#331419] border border-[rgba(244,200,66,0.15)] rounded-lg p-4 space-y-3">
              <h4 className="text-sm uppercase tracking-widest text-[#F4C842]">Approval per Item</h4>
              {detail.items?.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-5 text-sm text-[#F5F5F5]">{item.product_name}</span>
                  <span className="col-span-2 text-xs text-[#C4A484] text-right">Diminta: {item.qty_requested}</span>
                  <input type="number" min="0" max={item.qty_requested} value={itemApprovals[idx]?.qty_approved || 0} onChange={(e) => updateApproval(idx, { qty_approved: Number(e.target.value), status: Number(e.target.value) > 0 ? "approved" : "rejected" })} className="col-span-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-1 text-sm text-[#F5F5F5]" />
                  <select value={itemApprovals[idx]?.status || "approved"} onChange={(e) => updateApproval(idx, { status: e.target.value })} className="col-span-3 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-1 text-sm text-[#F5F5F5]">
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              ))}
              <div>
                <label className="text-xs text-[#C4A484] uppercase tracking-wider mb-1 block">Review Note</label>
                <input type="text" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Catatan review" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowApproveForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2 rounded-md text-xs uppercase">Batal</button>
                <button onClick={handleApprove} className="flex-1 bg-green-500/20 border border-green-400/30 text-green-400 py-2 rounded-md text-xs uppercase">Konfirmasi Approve</button>
              </div>
            </div>
          )}

          {/* Convert to Transfer */}
          {canConvert && (detail.status === "approved" || detail.status === "partially_approved") && !detail.converted_transfer_id && (
            <div className="pt-4">
              <button onClick={onConvert} className="w-full bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] flex items-center justify-center gap-2">
                <ArrowRight size={16} /> Convert ke Transfer Stok + Surat Jalan
              </button>
            </div>
          )}

          {/* Show transfer link if converted */}
          {detail.converted_transfer_id && (
            <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-3 text-sm text-green-400 flex items-center gap-2">
              <CheckCircle size={16} /> Dikonversi ke Transfer
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[rgba(244,200,66,0.15)]">
          <button onClick={onClose} className="w-full bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C]">Tutup</button>
        </div>
      </div>
    </div>
  );
}
