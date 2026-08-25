import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Receipt } from "lucide-react";

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => { api.get("/sales").then(r => setSales(r.data)); }, []);

  return (
    <div>
      <PageHeader title="Laporan Penjualan" subtitle="Riwayat transaksi dan detail invoice" />
      <div className="p-8">
        <div className="bg-[#111] gold-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#A39B8B] border-b border-[rgba(212,175,55,0.15)]">
                <th className="px-6 py-4">Invoice</th>
                <th className="px-6 py-4">Waktu</th>
                <th className="px-6 py-4">Kasir</th>
                <th className="px-6 py-4">Metode</th>
                <th className="px-6 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-[#A39B8B]"><Receipt size={40} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />Belum ada transaksi</td></tr>}
              {sales.map((s) => (
                <tr key={s.id} onClick={() => setSelected(s)} className="border-b border-[rgba(212,175,55,0.08)] last:border-0 hover:bg-[#1A1A1A] transition-colors cursor-pointer" data-testid={`sale-row-${s.id}`}>
                  <td className="px-6 py-3 text-sm text-[#D4AF37]">{s.invoice_no}</td>
                  <td className="px-6 py-3 text-xs text-[#A39B8B]">{new Date(s.created_at).toLocaleString("id-ID")}</td>
                  <td className="px-6 py-3 text-sm text-[#FDFBF7]">{s.cashier_name}</td>
                  <td className="px-6 py-3 text-xs uppercase text-[#A39B8B]">{s.payment_method}</td>
                  <td className="px-6 py-3 text-right text-sm text-[#FDFBF7] font-semibold">{formatIDR(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-[#0A0A0A] gold-border rounded-lg max-w-md w-full p-8">
              <h3 className="font-serif-luxury text-2xl text-[#D4AF37] text-center">{selected.invoice_no}</h3>
              <p className="text-xs text-[#A39B8B] text-center mb-6">{new Date(selected.created_at).toLocaleString("id-ID")}</p>
              <div className="space-y-2 border-t border-dashed border-[rgba(212,175,55,0.2)] pt-4">
                {selected.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-[#FDFBF7]">{i.name} × {i.quantity}</span>
                    <span className="text-[#A39B8B]">{formatIDR(i.price * i.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-[rgba(212,175,55,0.2)] mt-4 pt-4 space-y-1">
                <div className="flex justify-between text-xs text-[#A39B8B]"><span>Subtotal</span><span>{formatIDR(selected.subtotal)}</span></div>
                <div className="flex justify-between text-xs text-[#A39B8B]"><span>Diskon</span><span>- {formatIDR(selected.discount)}</span></div>
                <div className="flex justify-between text-lg text-[#D4AF37] font-semibold pt-2"><span>Total</span><span>{formatIDR(selected.total)}</span></div>
              </div>
              <button onClick={() => setSelected(null)} className="mt-6 w-full bg-[#D4AF37] text-[#050505] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFD700] transition-colors">Tutup</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
