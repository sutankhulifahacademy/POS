import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { PlayCircle, StopCircle, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { useOutlet } from "../context/OutletContext";

export default function Shifts() {
  const { outletIdForApi } = useOutlet();
  const [active, setActive] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openCash, setOpenCash] = useState(0);
  const [closeCash, setCloseCash] = useState(0);
  const [note, setNote] = useState("");
  const [closedResult, setClosedResult] = useState(null);

  const load = async () => {
    const oParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
    const [a, l] = await Promise.all([api.get(`/shifts/active${oParam}`), api.get(`/shifts${oParam}`)]);
    setActive(a.data); setShifts(l.data);
  };
  useEffect(() => { load(); }, [outletIdForApi]);

  const doOpen = async (e) => {
    e.preventDefault();
    try {
      await api.post("/shifts/open", { opening_cash: Number(openCash), note, outlet_id: outletIdForApi || undefined });
      toast.success("Shift dibuka");
      setShowOpen(false); setOpenCash(0); setNote(""); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const doClose = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/shifts/close", { actual_cash: Number(closeCash), note, outlet_id: outletIdForApi || undefined });
      setClosedResult(data);
      setShowClose(false); setCloseCash(0); setNote(""); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title="Manajemen Shift" subtitle="Buka & tutup shift kasir dengan rekonsiliasi kas" actions={
        active ? (
          <button onClick={() => setShowClose(true)} data-testid="close-shift-btn" className="flex items-center gap-2 bg-[#8B0000] text-[#F5F5F5] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#A00000] transition-colors">
            <StopCircle size={16} /> Tutup Shift
          </button>
        ) : (
          <button onClick={() => setShowOpen(true)} data-testid="open-shift-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
            <PlayCircle size={16} /> Buka Shift
          </button>
        )
      } />
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {active && (
          <div className="bg-gradient-to-r from-[#331419] to-[#4A1A22] gold-border-active rounded-lg p-6" data-testid="active-shift-card">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} strokeWidth={1.5} className="text-[#F4C842]" />
              <h3 className="font-serif-luxury text-xl text-[#F4C842]">Shift Aktif</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#C4A484]">Kasir</p>
                <p className="text-lg text-[#F5F5F5] mt-1">{active.cashier_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[#C4A484]">Dibuka</p>
                <p className="text-lg text-[#F5F5F5] mt-1">{new Date(active.opened_at).toLocaleString("id-ID")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[#C4A484]">Kas Awal</p>
                <p className="text-lg text-[#F4C842] mt-1">{formatIDR(active.opening_cash)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                <th className="px-6 py-4">Kasir</th>
                <th className="px-6 py-4">Dibuka</th>
                <th className="px-6 py-4">Ditutup</th>
                <th className="px-6 py-4 text-right">Kas Awal</th>
                <th className="px-6 py-4 text-right">Sales Tunai</th>
                <th className="px-6 py-4 text-right">Kas Aktual</th>
                <th className="px-6 py-4 text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-[#C4A484]">Belum ada shift</td></tr>}
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors">
                  <td className="px-6 py-3 text-sm text-[#F5F5F5]">{s.cashier_name}</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(s.opened_at).toLocaleString("id-ID")}</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{s.closed_at ? new Date(s.closed_at).toLocaleString("id-ID") : <span className="text-[#F4C842]">AKTIF</span>}</td>
                  <td className="px-6 py-3 text-right text-sm text-[#F5F5F5]">{formatIDR(s.opening_cash)}</td>
                  <td className="px-6 py-3 text-right text-sm text-[#F5F5F5]">{formatIDR(s.cash_sales || 0)}</td>
                  <td className="px-6 py-3 text-right text-sm text-[#F5F5F5]">{s.actual_cash != null ? formatIDR(s.actual_cash) : "—"}</td>
                  <td className={`px-6 py-3 text-right text-sm font-semibold ${(s.difference || 0) === 0 ? 'text-[#F5F5F5]' : (s.difference || 0) < 0 ? 'text-[#8B0000]' : 'text-[#2E8B57]'}`}>
                    {s.difference != null ? formatIDR(s.difference) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md mx-4 w-full p-6">
            <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mb-4">Buka Shift</h3>
            <form onSubmit={doOpen} className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Kas Awal (Modal Kembali)</label>
                <input required type="number" value={openCash} onChange={(e) => setOpenCash(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="opening-cash" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowOpen(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest">Batal</button>
                <button type="submit" data-testid="confirm-open-shift" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest">Buka</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClose && active && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowClose(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md mx-4 w-full p-6">
            <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mb-4">Tutup Shift</h3>
            <div className="text-sm text-[#C4A484] mb-4 border border-[rgba(244,200,66,0.15)] rounded-md p-3 bg-[#331419]">
              <div className="flex justify-between mb-1"><span>Kas Awal</span><span className="text-[#F5F5F5]">{formatIDR(active.opening_cash)}</span></div>
              <p className="text-xs italic mt-2">Sistem akan menghitung sales tunai dan selisih otomatis.</p>
            </div>
            <form onSubmit={doClose} className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Kas Aktual di Laci</label>
                <input required type="number" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="closing-cash" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowClose(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest">Batal</button>
                <button type="submit" data-testid="confirm-close-shift" className="flex-1 bg-[#8B0000] text-[#F5F5F5] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest">Tutup Shift</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {closedResult && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setClosedResult(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md mx-4 w-full p-6" data-testid="shift-summary">
            <h3 className="font-serif-luxury text-2xl text-[#F4C842] text-center">Ringkasan Shift</h3>
            <div className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[#C4A484]">Kasir</span><span className="text-[#F5F5F5]">{closedResult.cashier_name}</span></div>
              <div className="flex justify-between"><span className="text-[#C4A484]">Transaksi</span><span className="text-[#F5F5F5]">{closedResult.transaction_count}</span></div>
              <div className="border-t border-dashed border-[rgba(244,200,66,0.2)] pt-2 mt-2"></div>
              <div className="flex justify-between"><span className="text-[#C4A484]">Kas Awal</span><span className="text-[#F5F5F5]">{formatIDR(closedResult.opening_cash)}</span></div>
              <div className="flex justify-between"><span className="text-[#C4A484]">Sales Tunai</span><span className="text-[#F5F5F5]">{formatIDR(closedResult.cash_sales)}</span></div>
              <div className="flex justify-between"><span className="text-[#C4A484]">Sales Non-Tunai</span><span className="text-[#F5F5F5]">{formatIDR(closedResult.non_cash_sales)}</span></div>
              <div className="flex justify-between font-semibold"><span className="text-[#C4A484]">Kas Seharusnya</span><span className="text-[#F4C842]">{formatIDR(closedResult.expected_cash)}</span></div>
              <div className="flex justify-between font-semibold"><span className="text-[#C4A484]">Kas Aktual</span><span className="text-[#F5F5F5]">{formatIDR(closedResult.actual_cash)}</span></div>
              <div className={`flex justify-between text-lg font-bold pt-2 ${closedResult.difference === 0 ? 'text-[#F5F5F5]' : closedResult.difference < 0 ? 'text-[#8B0000]' : 'text-[#2E8B57]'}`}>
                <span>Selisih</span><span>{formatIDR(closedResult.difference)}</span>
              </div>
            </div>
            <button onClick={() => setClosedResult(null)} className="mt-6 w-full bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest">Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
