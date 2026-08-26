import { useEffect, useState, useMemo } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Receipt as ReceiptIcon, Printer, FileSpreadsheet, FileText, Calendar } from "lucide-react";
import Receipt, { printReceipt } from "../components/Receipt";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { api.get("/sales").then(r => setSales(r.data)); }, []);

  const filtered = useMemo(() => sales.filter(s => {
    const d = s.created_at.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  }), [sales, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, x) => s + x.total, 0);
    const itemsCount = filtered.reduce((s, x) => s + x.items.reduce((a, b) => a + b.quantity, 0), 0);
    return { total, itemsCount, txCount: filtered.length };
  }, [filtered]);

  const exportExcel = () => {
    if (filtered.length === 0) return toast.error("Tidak ada data untuk diekspor");
    const rows = filtered.map(s => ({
      "Invoice": s.invoice_no,
      "Waktu": new Date(s.created_at).toLocaleString("id-ID"),
      "Kasir": s.cashier_name,
      "Metode": s.payment_method.toUpperCase(),
      "Jumlah Item": s.items.reduce((a, b) => a + b.quantity, 0),
      "Subtotal": s.subtotal,
      "Diskon": s.discount,
      "Total": s.total,
    }));
    const summary = [
      { "Invoice": "", "Waktu": "", "Kasir": "", "Metode": "", "Jumlah Item": "", "Subtotal": "", "Diskon": "TOTAL", "Total": totals.total },
    ];
    const ws = XLSX.utils.json_to_sheet([...rows, ...summary]);
    ws["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Penjualan");
    const fname = `laporan-penjualan-${dateFrom || "all"}-${dateTo || "all"}.xlsx`;
    XLSX.writeFile(wb, fname);
    toast.success("Excel berhasil diunduh");
  };

  const exportPDF = () => {
    if (filtered.length === 0) return toast.error("Tidak ada data untuk diekspor");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(212, 175, 55);
    doc.text("Sutan Khulifah Academy", 14, 15);
    doc.setFontSize(12);
    doc.setTextColor(50);
    doc.text("Laporan Penjualan", 14, 22);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const range = `${dateFrom || "Awal"} s/d ${dateTo || "Sekarang"}`;
    doc.text(`Periode: ${range}`, 14, 28);
    doc.text(`Total Transaksi: ${totals.txCount}  |  Item Terjual: ${totals.itemsCount}  |  Total Pendapatan: ${formatIDR(totals.total)}`, 14, 33);

    autoTable(doc, {
      startY: 40,
      head: [["Invoice", "Waktu", "Kasir", "Metode", "Item", "Subtotal", "Diskon", "Total"]],
      body: filtered.map(s => [
        s.invoice_no,
        new Date(s.created_at).toLocaleString("id-ID"),
        s.cashier_name,
        s.payment_method.toUpperCase(),
        s.items.reduce((a, b) => a + b.quantity, 0),
        formatIDR(s.subtotal),
        formatIDR(s.discount),
        formatIDR(s.total),
      ]),
      headStyles: { fillColor: [10, 10, 10], textColor: [212, 175, 55], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 244, 232] },
      foot: [["", "", "", "", "TOTAL", "", "", formatIDR(totals.total)]],
      footStyles: { fillColor: [212, 175, 55], textColor: [5, 5, 5], fontStyle: "bold" },
    });

    const fname = `laporan-penjualan-${dateFrom || "all"}-${dateTo || "all"}.pdf`;
    doc.save(fname);
    toast.success("PDF berhasil diunduh");
  };

  return (
    <div>
      <PageHeader title="Laporan Penjualan" subtitle="Riwayat transaksi dengan filter periode dan ekspor PDF/Excel" />
      <div className="p-8 space-y-6">
        {/* Filter + Export Bar */}
        <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block flex items-center gap-1"><Calendar size={12} /> Dari</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="report-from" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block flex items-center gap-1"><Calendar size={12} /> Sampai</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="report-to" />
          </div>
          <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-[#C4A484] hover:text-[#F5F5F5] px-3 py-2">Reset</button>
          <div className="flex-1"></div>
          <div className="flex gap-2">
            <button onClick={exportExcel} data-testid="export-excel-btn" className="flex items-center gap-2 bg-[#331419] border border-[#2E8B57] text-[#2E8B57] hover:bg-[#2E8B57]/10 px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold transition-colors">
              <FileSpreadsheet size={14} strokeWidth={1.8} /> Excel
            </button>
            <button onClick={exportPDF} data-testid="export-pdf-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] hover:bg-[#FFDD5C] px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold transition-colors">
              <FileText size={14} strokeWidth={1.8} /> PDF
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#331419] gold-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-widest text-[#C4A484]">Transaksi</p>
            <p className="font-serif-luxury text-2xl text-[#F5F5F5] mt-1">{totals.txCount}</p>
          </div>
          <div className="bg-[#331419] gold-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-widest text-[#C4A484]">Item Terjual</p>
            <p className="font-serif-luxury text-2xl text-[#F5F5F5] mt-1">{totals.itemsCount}</p>
          </div>
          <div className="bg-[#331419] gold-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-widest text-[#C4A484]">Total Pendapatan</p>
            <p className="font-serif-luxury text-2xl text-[#F4C842] mt-1">{formatIDR(totals.total)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#331419] gold-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                <th className="px-6 py-4">Invoice</th>
                <th className="px-6 py-4">Waktu</th>
                <th className="px-6 py-4">Kasir</th>
                <th className="px-6 py-4">Metode</th>
                <th className="px-6 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-[#C4A484]"><ReceiptIcon size={40} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />Tidak ada transaksi pada periode ini</td></tr>}
              {filtered.map((s) => (
                <tr key={s.id} onClick={() => setSelected(s)} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors cursor-pointer" data-testid={`sale-row-${s.id}`}>
                  <td className="px-6 py-3 text-sm text-[#F4C842]">{s.invoice_no}</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(s.created_at).toLocaleString("id-ID")}</td>
                  <td className="px-6 py-3 text-sm text-[#F5F5F5]">{s.cashier_name}</td>
                  <td className="px-6 py-3 text-xs uppercase text-[#C4A484]">{s.payment_method}</td>
                  <td className="px-6 py-3 text-right text-sm text-[#F5F5F5] font-semibold">{formatIDR(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <>
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 no-print" onClick={() => setSelected(null)}>
              <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-md w-full p-8">
                <h3 className="font-serif-luxury text-2xl text-[#F4C842] text-center">{selected.invoice_no}</h3>
                <p className="text-xs text-[#C4A484] text-center mb-6">{new Date(selected.created_at).toLocaleString("id-ID")}</p>
                <div className="space-y-2 border-t border-dashed border-[rgba(244,200,66,0.2)] pt-4">
                  {selected.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between text-sm"><span className="text-[#F5F5F5]">{i.name} × {i.quantity}</span><span className="text-[#C4A484]">{formatIDR(i.price * i.quantity)}</span></div>
                  ))}
                </div>
                <div className="border-t border-dashed border-[rgba(244,200,66,0.2)] mt-4 pt-4 space-y-1">
                  <div className="flex justify-between text-xs text-[#C4A484]"><span>Subtotal</span><span>{formatIDR(selected.subtotal)}</span></div>
                  <div className="flex justify-between text-xs text-[#C4A484]"><span>Diskon</span><span>- {formatIDR(selected.discount)}</span></div>
                  <div className="flex justify-between text-lg text-[#F4C842] font-semibold pt-2"><span>Total</span><span>{formatIDR(selected.total)}</span></div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button onClick={printReceipt} data-testid="reprint-receipt-btn" className="flex-1 border border-[#F4C842] text-[#F4C842] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#F4C842]/10 transition-colors flex items-center justify-center gap-2"><Printer size={14} /> Cetak Ulang</button>
                  <button onClick={() => setSelected(null)} className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors">Tutup</button>
                </div>
              </div>
            </div>
            <Receipt sale={selected} />
          </>
        )}
      </div>
    </div>
  );
}
