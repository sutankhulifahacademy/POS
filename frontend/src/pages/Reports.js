import { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import {
  LayoutDashboard,
  ShoppingCart,
  TrendingUp,
  Clock,
  Boxes,
  Wallet,
  Receipt as ReceiptIcon,
  Printer,
  FileSpreadsheet,
  FileText,
  Calendar,
  Package,
  Users,
  AlertTriangle,
  DollarSign,
  CreditCard,
  Banknote,
  QrCode,
  ArrowLeftRight,
  Loader2,
} from "lucide-react";
import Receipt, { printReceipt } from "../components/Receipt";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useOutlet } from "../context/OutletContext";

/* ============================================================
 *  CONSTANTS
 * ============================================================ */
const PERIODS = [
  { value: "daily", label: "Harian" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "yearly", label: "Tahunan" },
];

const PERIODS_WITH_CUSTOM = [
  ...PERIODS,
  { value: "custom", label: "Custom" },
];

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sales", label: "Penjualan", icon: ShoppingCart },
  { id: "profit-loss", label: "Laba Rugi", icon: TrendingUp },
  { id: "shifts", label: "Shift", icon: Clock },
  { id: "stock", label: "Stok", icon: Boxes },
  { id: "reconciliation", label: "Rekonsiliasi", icon: Wallet },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ============================================================
 *  REUSABLE UI PRIMITIVES
 * ============================================================ */

function PeriodSelector({ value, onChange, includeCustom = false }) {
  const options = includeCustom ? PERIODS_WITH_CUSTOM : PERIODS;
  return (
    <div className="flex gap-1 bg-[#2A1015] rounded-md p-1 border border-[rgba(244,200,66,0.15)]">
      {options.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1.5 rounded text-xs uppercase tracking-widest font-semibold transition-colors ${
            value === p.value
              ? "bg-[#F4C842] text-[#1A0810]"
              : "text-[#C4A484] hover:text-[#F5F5F5] hover:bg-[rgba(244,200,66,0.08)]"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function DateRangeInputs({ dateFrom, setDateFrom, dateTo, setDateTo, showReset = true }) {
  return (
    <>
      <div>
        <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block flex items-center gap-1">
          <Calendar size={12} /> Dari
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block flex items-center gap-1">
          <Calendar size={12} /> Sampai
        </label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
        />
      </div>
      {showReset && (
        <button
          onClick={() => {
            setDateFrom("");
            setDateTo("");
          }}
          className="text-xs text-[#C4A484] hover:text-[#F5F5F5] px-3 py-2"
        >
          Reset
        </button>
      )}
    </>
  );
}

function OutletSelect({ outlets, value, onChange }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block">
        Outlet
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5] min-w-[120px] md:min-w-[160px]"
      >
        <option value="">Semua Outlet</option>
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ExportButtons({ onExcel, onPDF }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onExcel}
        className="flex items-center gap-2 bg-[#331419] border border-[#2E8B57] text-[#2E8B57] hover:bg-[#2E8B57]/10 px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold transition-colors"
      >
        <FileSpreadsheet size={16} strokeWidth={1.8} /> Excel
      </button>
      <button
        onClick={onPDF}
        className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] hover:bg-[#FFDD5C] px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold transition-colors"
      >
        <FileText size={16} strokeWidth={1.8} /> PDF
      </button>
    </div>
  );
}

function Card({ label, value, icon: Icon, accent = "text-[#F4C842]" }) {
  return (
    <div className="bg-[#331419] gold-border rounded-lg p-4">
      {Icon && (
        <div className="w-9 h-9 rounded-md bg-[rgba(244,200,66,0.1)] flex items-center justify-center mb-3">
          <Icon size={18} strokeWidth={1.5} className="text-[#F4C842]" />
        </div>
      )}
      <p className="text-xs uppercase tracking-widest text-[#C4A484]">{label}</p>
      <p className={`font-serif-luxury text-2xl ${accent} mt-1`}>{value}</p>
    </div>
  );
}

function SectionCard({ title, children, action }) {
  return (
    <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(244,200,66,0.12)]">
        <h3 className="text-sm uppercase tracking-widest text-[#C4A484] font-semibold">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Table({ headers, rows, empty = "Tidak ada data" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.12)]">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-6 py-3 ${h.align === "right" ? "text-right" : ""}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={headers.length}
                className="px-6 py-12 text-center text-[#C4A484]"
              >
                <ReceiptIcon
                  size={36}
                  strokeWidth={1.2}
                  className="mx-auto mb-3 opacity-40"
                />
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[rgba(244,200,66,0.06)] last:border-0 hover:bg-[#4A1A22] transition-colors"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-6 py-3 text-sm ${
                    headers[j].align === "right" ? "text-right" : "text-[#F5F5F5]"
                  } ${cell.className || ""}`}
                >
                  {cell.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Simple CSS bar chart using divs */
function BarChart({ data, height = 180, color = "#F4C842" }) {
  const max = useMemo(
    () => Math.max(1, ...data.map((d) => d.value)),
    [data]
  );
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[#C4A484] text-sm py-12">
        Tidak ada data untuk ditampilkan
      </div>
    );
  }
  return (
    <div
      className="flex items-end gap-1 px-4 pb-2 pt-6"
      style={{ height }}
    >
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 40);
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end min-w-0 group"
            title={`${d.label}: ${formatIDR(d.value)}`}
          >
            <div
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{
                height: Math.max(2, h),
                backgroundColor: color,
                minHeight: "2px",
              }}
            />
            <span className="text-[9px] text-[#C4A484] mt-1 truncate w-full text-center">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* Multi-series bar chart (stacked groups) for reconciliation */
function MultiBarChart({ data, height = 200 }) {
  const series = [
    { key: "cash", color: "#2E8B57", label: "Cash" },
    { key: "card", color: "#F4C842", label: "Card" },
    { key: "qris", color: "#9B59B6", label: "QRIS" },
    { key: "transfer", color: "#3498DB", label: "Transfer" },
  ];
  const max = useMemo(
    () =>
      Math.max(
        1,
        ...data.map((d) =>
          series.reduce((s, sp) => s + (d[sp.key] || 0), 0)
        )
      ),
    [data]
  );
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[#C4A484] text-sm py-12">
        Tidak ada data untuk ditampilkan
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap gap-3 px-4 pt-4">
        {series.map((sp) => (
          <div key={sp.key} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: sp.color }}
            />
            <span className="text-[10px] text-[#C4A484] uppercase tracking-wider">
              {sp.label}
            </span>
          </div>
        ))}
      </div>
      <div
        className="flex items-end gap-2 px-4 pb-2 pt-6"
        style={{ height }}
      >
        {data.map((d, i) => {
          const total = series.reduce((s, sp) => s + (d[sp.key] || 0), 0);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end min-w-0"
              title={`${d.date}: ${formatIDR(total)}`}
            >
              <div
                className="w-full flex flex-col-reverse rounded-t overflow-hidden"
                style={{ height: Math.max(2, (total / max) * (height - 40)) }}
              >
                {series.map((sp) => {
                  const v = d[sp.key] || 0;
                  if (v === 0) return null;
                  const segH = (v / total) * 100;
                  return (
                    <div
                      key={sp.key}
                      style={{
                        backgroundColor: sp.color,
                        height: `${segH}%`,
                        minHeight: v > 0 ? "1px" : 0,
                      }}
                    />
                  );
                })}
              </div>
              <span className="text-[9px] text-[#C4A484] mt-1 truncate w-full text-center">
                {d.date.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="animate-spin text-[#F4C842]" size={32} />
    </div>
  );
}

/* ============================================================
 *  EXPORT HELPERS
 * ============================================================ */

function exportRowsToExcel(sheetName, rows, filename) {
  if (!rows || rows.length === 0)
    return toast.error("Tidak ada data untuk diekspor");
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
  toast.success("Excel berhasil diunduh");
}

function exportMultiSheetExcel(sheets, filename) {
  const hasData = sheets.some((s) => s.rows && s.rows.length > 0);
  if (!hasData) return toast.error("Tidak ada data untuk diekspor");
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  });
  XLSX.writeFile(wb, filename);
  toast.success("Excel berhasil diunduh");
}

function exportPDFReport(title, subtitle, head, body, filename, orientation = "landscape") {
  if (!body || body.length === 0)
    return toast.error("Tidak ada data untuk diekspor");
  const doc = new jsPDF({ orientation });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(212, 175, 55);
  doc.text("Sutan Khulifah Academy", 14, 15);
  doc.setFontSize(12);
  doc.setTextColor(50);
  doc.text(title, 14, 22);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 14, 28);
  autoTable(doc, {
    startY: 34,
    head,
    body,
    headStyles: {
      fillColor: [10, 10, 10],
      textColor: [212, 175, 55],
      fontStyle: "bold",
    },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [248, 244, 232] },
  });
  doc.save(filename);
  toast.success("PDF berhasil diunduh");
}

/* ============================================================
 *  RECEIPT POPUP
 * ============================================================ */

function ReceiptPopup({ saleId, onClose }) {
  const [sale, setSale] = useState(null);

  useEffect(() => {
    if (saleId) {
      api
        .get(`/sales/${saleId}`)
        .then((r) => setSale(r.data))
        .catch(() => {
          toast.error("Gagal memuat detail transaksi");
          onClose();
        });
    }
  }, [saleId, onClose]);

  if (!sale) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 no-print">
        <Loader2 className="animate-spin text-[#F4C842]" size={32} />
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 no-print"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md mx-4 w-full p-8"
        >
          <h3 className="font-serif-luxury text-2xl text-[#F4C842] text-center">
            {sale.invoice_no}
          </h3>
          <p className="text-xs text-[#C4A484] text-center mb-6">
            {new Date(sale.created_at).toLocaleString("id-ID")}
          </p>
          <div className="space-y-2 border-t border-dashed border-[rgba(244,200,66,0.2)] pt-4">
            {sale.items.map((i, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-[#F5F5F5]">
                  {i.name} × {i.quantity}
                </span>
                <span className="text-[#C4A484]">
                  {formatIDR(i.price * i.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-[rgba(244,200,66,0.2)] mt-4 pt-4 space-y-1">
            <div className="flex justify-between text-xs text-[#C4A484]">
              <span>Subtotal</span>
              <span>{formatIDR(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#C4A484]">
              <span>Diskon</span>
              <span>- {formatIDR(sale.discount)}</span>
            </div>
            <div className="flex justify-between text-lg text-[#F4C842] font-semibold pt-2">
              <span>Total</span>
              <span>{formatIDR(sale.total)}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              onClick={printReceipt}
              className="flex-1 border border-[#F4C842] text-[#F4C842] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#F4C842]/10 transition-colors flex items-center justify-center gap-2"
            >
              <Printer size={16} /> Cetak Ulang
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
      <Receipt sale={sale} />
    </>
  );
}

/* ============================================================
 *  TAB 1: DASHBOARD
 * ============================================================ */

function DashboardTab() {
  const [period, setPeriod] = useState("weekly");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/reports/dashboard", { params: { period } })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Gagal memuat dashboard"))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <Loading />;
  if (!data) return null;

  const chartData = (data.chart || []).map((c) => ({
    label: c.label,
    value: c.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap items-center gap-4">
        <span className="text-xs uppercase tracking-widest text-[#C4A484]">
          Periode:
        </span>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card label="Revenue" value={formatIDR(data.revenue)} icon={DollarSign} />
        <Card label="Transaksi" value={data.transactions} icon={ShoppingCart} accent="text-[#F5F5F5]" />
        <Card label="Item Terjual" value={data.items_sold} icon={Package} accent="text-[#F5F5F5]" />
        <Card label="Produk" value={data.products_count} icon={Boxes} accent="text-[#F5F5F5]" />
        <Card label="Pelanggan" value={data.customers_count} icon={Users} accent="text-[#F5F5F5]" />
        <Card label="Low Stock" value={data.low_stock_count} icon={AlertTriangle} accent={data.low_stock_count > 0 ? "text-red-400" : "text-[#F5F5F5]"} />
      </div>

      {/* Chart */}
      <SectionCard title="Grafik Pendapatan">
        <BarChart data={chartData} />
      </SectionCard>

      {/* Top products + Low stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Produk Terlaris">
          <Table
            headers={[
              { label: "Produk" },
              { label: "Qty", align: "right" },
              { label: "Revenue", align: "right" },
            ]}
            rows={(data.top_products || []).map((p) => [
              { value: p.name },
              { value: p.quantity },
              { value: formatIDR(p.revenue) },
            ])}
            empty="Tidak ada produk terlaris pada periode ini"
          />
        </SectionCard>
        <SectionCard title="Stok Menipis">
          <Table
            headers={[
              { label: "Produk" },
              { label: "SKU" },
              { label: "Stok", align: "right" },
            ]}
            rows={(data.low_stock_items || []).map((p) => [
              { value: p.name },
              { value: p.sku || "-", className: "text-[#C4A484]" },
              {
                value: `${p.stock} ${p.unit || ""}`,
                className: "text-red-400",
              },
            ])}
            empty="Semua stok aman"
          />
        </SectionCard>
      </div>
    </div>
  );
}

/* ============================================================
 *  TAB 2: PENJUALAN (SALES)
 * ============================================================ */

function SalesTab({ outlets, globalOutletId }) {
  const [period, setPeriod] = useState("weekly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [outletId, setOutletId] = useState(globalOutletId || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSaleId, setSelectedSaleId] = useState(null);

  // Sync with global outlet
  useEffect(() => { setOutletId(globalOutletId || ""); }, [globalOutletId]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = { period };
    if (period === "custom") {
      if (!dateFrom || !dateTo) {
        toast.error("Pilih tanggal mulai dan akhir untuk periode custom");
        setLoading(false);
        return;
      }
      params.date_from = dateFrom;
      params.date_to = dateTo;
    }
    if (outletId) params.outlet_id = outletId;
    api
      .get("/reports/sales", { params })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Gagal memuat laporan penjualan"))
      .finally(() => setLoading(false));
  }, [period, dateFrom, dateTo, outletId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rangeStr = `${data?.period_start?.slice(0, 10) || "Awal"} s/d ${
    data?.period_end?.slice(0, 10) || "Sekarang"
  }`;

  const exportExcel = () => {
    if (!data) return;
    const s = data.summary;
    exportMultiSheetExcel(
      [
        {
          name: "Summary",
          rows: [
            {
              Revenue: s.revenue,
              Transaksi: s.transactions,
              "Avg Transaction": s.avg_transaction,
              "Total Diskon": s.total_discount,
              "Total Pajak": s.total_tax,
              "Item Terjual": s.items_sold,
            },
          ],
        },
        {
          name: "By Payment",
          rows: data.by_payment_method.map((r) => ({
            Metode: r.method,
            Jumlah: r.count,
            Total: r.total,
          })),
        },
        {
          name: "By Source",
          rows: data.by_source.map((r) => ({
            Source: r.source,
            Jumlah: r.count,
            Total: r.total,
          })),
        },
        {
          name: "By Category",
          rows: data.by_category.map((r) => ({
            Kategori: r.category_name,
            Qty: r.quantity,
            Revenue: r.revenue,
          })),
        },
        {
          name: "Top Products",
          rows: data.by_product.map((r) => ({
            Produk: r.name,
            Qty: r.quantity,
            Revenue: r.revenue,
            Cost: r.cost,
            Profit: r.profit,
          })),
        },
        {
          name: "By Outlet",
          rows: data.by_outlet.map((r) => ({
            Outlet: r.outlet_name,
            Jumlah: r.count,
            Total: r.total,
          })),
        },
        {
          name: "By Cashier",
          rows: data.by_cashier.map((r) => ({
            Kasir: r.cashier_name,
            Jumlah: r.count,
            Total: r.total,
          })),
        },
        {
          name: "Recent Tx",
          rows: data.recent_transactions.map((r) => ({
            Invoice: r.invoice_no,
            Waktu: r.created_at,
            Kasir: r.cashier_name,
            Metode: r.payment_method,
            Source: r.source,
            Total: r.total,
          })),
        },
      ],
      `laporan-penjualan-${period}.xlsx`
    );
  };

  const exportPDF = () => {
    if (!data) return;
    const s = data.summary;
    exportPDFReport(
      "Laporan Penjualan",
      `Periode: ${rangeStr} | Tx: ${s.transactions} | Revenue: ${formatIDR(s.revenue)}`,
      [["Invoice", "Waktu", "Kasir", "Metode", "Source", "Total"]],
      data.recent_transactions.map((r) => [
        r.invoice_no,
        new Date(r.created_at).toLocaleString("id-ID"),
        r.cashier_name,
        r.payment_method,
        r.source,
        formatIDR(r.total),
      ]),
      `laporan-penjualan-${period}.pdf`
    );
  };

  if (loading) return <Loading />;
  if (!data) return null;
  const s = data.summary;
  const chartData = (data.chart || []).map((c) => ({
    label: c.label,
    value: c.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block">
            Periode
          </label>
          <PeriodSelector value={period} onChange={setPeriod} includeCustom />
        </div>
        {period === "custom" && (
          <DateRangeInputs
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
          />
        )}
        <OutletSelect
          outlets={outlets}
          value={outletId}
          onChange={setOutletId}
        />
        <button
          onClick={fetchData}
          className="bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold hover:bg-[#FFDD5C] transition-colors"
        >
          Terapkan
        </button>
        <div className="flex-1" />
        <ExportButtons onExcel={exportExcel} onPDF={exportPDF} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card label="Revenue" value={formatIDR(s.revenue)} icon={DollarSign} />
        <Card label="Transaksi" value={s.transactions} icon={ShoppingCart} accent="text-[#F5F5F5]" />
        <Card label="Avg Transaksi" value={formatIDR(s.avg_transaction)} icon={TrendingUp} />
        <Card label="Total Diskon" value={formatIDR(s.total_discount)} icon={DollarSign} accent="text-red-400" />
        <Card label="Total Pajak" value={formatIDR(s.total_tax)} icon={DollarSign} accent="text-[#F5F5F5]" />
        <Card label="Item Terjual" value={s.items_sold} icon={Package} accent="text-[#F5F5F5]" />
      </div>

      {/* Chart */}
      <SectionCard title="Grafik Pendapatan">
        <BarChart data={chartData} />
      </SectionCard>

      {/* Sub-sections grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Berdasarkan Metode Pembayaran">
          <Table
            headers={[
              { label: "Metode" },
              { label: "Jumlah", align: "right" },
              { label: "Total", align: "right" },
            ]}
            rows={data.by_payment_method.map((r) => [
              { value: r.method, className: "uppercase text-[#C4A484]" },
              { value: r.count },
              { value: formatIDR(r.total), className: "text-[#F4C842]" },
            ])}
          />
        </SectionCard>
        <SectionCard title="Berdasarkan Source">
          <Table
            headers={[
              { label: "Source" },
              { label: "Jumlah", align: "right" },
              { label: "Total", align: "right" },
            ]}
            rows={data.by_source.map((r) => [
              { value: r.source, className: "uppercase text-[#C4A484]" },
              { value: r.count },
              { value: formatIDR(r.total), className: "text-[#F4C842]" },
            ])}
          />
        </SectionCard>
        <SectionCard title="Berdasarkan Kategori">
          <Table
            headers={[
              { label: "Kategori" },
              { label: "Qty", align: "right" },
              { label: "Revenue", align: "right" },
            ]}
            rows={data.by_category.map((r) => [
              { value: r.category_name },
              { value: r.quantity },
              { value: formatIDR(r.revenue) },
            ])}
          />
        </SectionCard>
        <SectionCard title="Berdasarkan Outlet">
          <Table
            headers={[
              { label: "Outlet" },
              { label: "Jumlah", align: "right" },
              { label: "Total", align: "right" },
            ]}
            rows={data.by_outlet.map((r) => [
              { value: r.outlet_name },
              { value: r.count },
              { value: formatIDR(r.total), className: "text-[#F4C842]" },
            ])}
          />
        </SectionCard>
      </div>

      {/* Top products */}
      <SectionCard title="Produk Terlaris">
        <Table
          headers={[
            { label: "Produk" },
            { label: "Qty", align: "right" },
            { label: "Revenue", align: "right" },
            { label: "Cost", align: "right" },
            { label: "Profit", align: "right" },
          ]}
          rows={data.by_product.map((r) => [
            { value: r.name },
            { value: r.quantity },
            { value: formatIDR(r.revenue) },
            { value: formatIDR(r.cost), className: "text-red-400" },
            { value: formatIDR(r.profit), className: "text-[#2E8B57]" },
          ])}
          empty="Tidak ada produk terjual pada periode ini"
        />
      </SectionCard>

      {/* By cashier */}
      <SectionCard title="Berdasarkan Kasir">
        <Table
          headers={[
            { label: "Kasir" },
            { label: "Jumlah", align: "right" },
            { label: "Total", align: "right" },
          ]}
          rows={data.by_cashier.map((r) => [
            { value: r.cashier_name },
            { value: r.count },
            { value: formatIDR(r.total), className: "text-[#F4C842]" },
          ])}
        />
      </SectionCard>

      {/* Recent transactions */}
      <SectionCard title="Transaksi Terbaru">
        <Table
          headers={[
            { label: "Invoice" },
            { label: "Waktu" },
            { label: "Kasir" },
            { label: "Metode" },
            { label: "Source" },
            { label: "Total", align: "right" },
          ]}
          rows={data.recent_transactions.map((r) => [
            {
              value: r.invoice_no,
              className: "text-[#F4C842] cursor-pointer",
            },
            { value: new Date(r.created_at).toLocaleString("id-ID"), className: "text-xs text-[#C4A484]" },
            { value: r.cashier_name },
            { value: r.payment_method, className: "uppercase text-[#C4A484]" },
            { value: r.source, className: "uppercase text-[#C4A484]" },
            { value: formatIDR(r.total), className: "font-semibold" },
          ])}
          empty="Tidak ada transaksi pada periode ini"
        />
        <div className="px-6 py-3 text-xs text-[#C4A484] border-t border-[rgba(244,200,66,0.08)]">
          Klik baris untuk melihat detail struk
        </div>
      </SectionCard>

      {selectedSaleId && (
        <ReceiptPopup
          saleId={selectedSaleId}
          onClose={() => setSelectedSaleId(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
 *  TAB 3: LABA RUGI (PROFIT/LOSS)
 * ============================================================ */

function ProfitLossTab({ outlets, globalOutletId }) {
  const [period, setPeriod] = useState("weekly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [outletId, setOutletId] = useState(globalOutletId || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setOutletId(globalOutletId || ""); }, [globalOutletId]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = { period };
    if (period === "custom") {
      if (!dateFrom || !dateTo) {
        toast.error("Pilih tanggal mulai dan akhir untuk periode custom");
        setLoading(false);
        return;
      }
      params.date_from = dateFrom;
      params.date_to = dateTo;
    }
    if (outletId) params.outlet_id = outletId;
    api
      .get("/reports/profit-loss", { params })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Gagal memuat laporan laba rugi"))
      .finally(() => setLoading(false));
  }, [period, dateFrom, dateTo, outletId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rangeStr = `${data?.period_start?.slice(0, 10) || "Awal"} s/d ${
    data?.period_end?.slice(0, 10) || "Sekarang"
  }`;

  const exportExcel = () => {
    if (!data) return;
    exportMultiSheetExcel(
      [
        {
          name: "Summary",
          rows: [
            {
              Revenue: data.revenue,
              COGS: data.cogs,
              "Gross Profit": data.gross_profit,
              "Gross Margin %": data.gross_margin_pct,
              "Total Diskon": data.total_discount,
              "Net Profit": data.net_profit,
            },
          ],
        },
        {
          name: "By Product",
          rows: data.by_product.map((r) => ({
            Produk: r.name,
            Qty: r.quantity,
            Revenue: r.revenue,
            Cost: r.cost,
            Profit: r.profit,
            "Margin %": r.margin_pct,
          })),
        },
        {
          name: "By Category",
          rows: data.by_category.map((r) => ({
            Kategori: r.category_name,
            Revenue: r.revenue,
            Cost: r.cost,
            Profit: r.profit,
          })),
        },
        {
          name: "By Day",
          rows: data.by_day.map((r) => ({
            Tanggal: r.date,
            Revenue: r.revenue,
            COGS: r.cogs,
            Profit: r.profit,
          })),
        },
      ],
      `laporan-laba-rugi-${period}.xlsx`
    );
  };

  const exportPDF = () => {
    if (!data) return;
    exportPDFReport(
      "Laporan Laba Rugi",
      `Periode: ${rangeStr} | Revenue: ${formatIDR(data.revenue)} | Net Profit: ${formatIDR(data.net_profit)}`,
      [["Produk", "Qty", "Revenue", "Cost", "Profit", "Margin %"]],
      data.by_product.map((r) => [
        r.name,
        r.quantity,
        formatIDR(r.revenue),
        formatIDR(r.cost),
        formatIDR(r.profit),
        `${r.margin_pct}%`,
      ]),
      `laporan-laba-rugi-${period}.pdf`
    );
  };

  if (loading) return <Loading />;
  if (!data) return null;

  // Chart: revenue vs cogs vs profit (grouped)
  const chartData = (data.by_day || []).map((d) => ({
    label: d.date.slice(5),
    value: d.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block">
            Periode
          </label>
          <PeriodSelector value={period} onChange={setPeriod} includeCustom />
        </div>
        {period === "custom" && (
          <DateRangeInputs
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
          />
        )}
        <OutletSelect
          outlets={outlets}
          value={outletId}
          onChange={setOutletId}
        />
        <button
          onClick={fetchData}
          className="bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold hover:bg-[#FFDD5C] transition-colors"
        >
          Terapkan
        </button>
        <div className="flex-1" />
        <ExportButtons onExcel={exportExcel} onPDF={exportPDF} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card label="Revenue" value={formatIDR(data.revenue)} icon={DollarSign} />
        <Card label="COGS" value={formatIDR(data.cogs)} icon={DollarSign} accent="text-red-400" />
        <Card
          label="Gross Profit"
          value={formatIDR(data.gross_profit)}
          icon={TrendingUp}
          accent={data.gross_profit >= 0 ? "text-[#2E8B57]" : "text-red-400"}
        />
        <Card
          label="Gross Margin"
          value={`${data.gross_margin_pct}%`}
          icon={TrendingUp}
          accent="text-[#F5F5F5]"
        />
        <Card label="Total Diskon" value={formatIDR(data.total_discount)} icon={DollarSign} accent="text-red-400" />
        <Card
          label="Net Profit"
          value={formatIDR(data.net_profit)}
          icon={DollarSign}
          accent={data.net_profit >= 0 ? "text-[#2E8B57]" : "text-red-400"}
        />
      </div>

      {/* Chart */}
      <SectionCard title="Grafik Harian: Revenue vs COGS vs Profit">
        <BarChart data={chartData} />
      </SectionCard>

      {/* By product */}
      <SectionCard title="Laba Rugi per Produk">
        <Table
          headers={[
            { label: "Produk" },
            { label: "Qty", align: "right" },
            { label: "Revenue", align: "right" },
            { label: "Cost", align: "right" },
            { label: "Profit", align: "right" },
            { label: "Margin %", align: "right" },
          ]}
          rows={data.by_product.map((r) => [
            { value: r.name },
            { value: r.quantity },
            { value: formatIDR(r.revenue) },
            { value: formatIDR(r.cost), className: "text-red-400" },
            {
              value: formatIDR(r.profit),
              className: r.profit >= 0 ? "text-[#2E8B57]" : "text-red-400",
            },
            { value: `${r.margin_pct}%`, className: "text-[#C4A484]" },
          ])}
          empty="Tidak ada data produk pada periode ini"
        />
      </SectionCard>

      {/* By category */}
      <SectionCard title="Laba Rugi per Kategori">
        <Table
          headers={[
            { label: "Kategori" },
            { label: "Revenue", align: "right" },
            { label: "Cost", align: "right" },
            { label: "Profit", align: "right" },
          ]}
          rows={data.by_category.map((r) => [
            { value: r.category_name },
            { value: formatIDR(r.revenue) },
            { value: formatIDR(r.cost), className: "text-red-400" },
            {
              value: formatIDR(r.profit),
              className: r.profit >= 0 ? "text-[#2E8B57]" : "text-red-400",
            },
          ])}
          empty="Tidak ada data kategori pada periode ini"
        />
      </SectionCard>
    </div>
  );
}

/* ============================================================
 *  TAB 4: SHIFT
 * ============================================================ */

function ShiftsTab({ globalOutletId }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (globalOutletId) params.outlet_id = globalOutletId;
    api
      .get("/reports/shifts", { params })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Gagal memuat laporan shift"))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, globalOutletId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rangeStr = `${data?.period_start?.slice(0, 10) || "30 hari terakhir"} s/d ${
    data?.period_end?.slice(0, 10) || "Sekarang"
  }`;

  const exportExcel = () => {
    if (!data) return;
    const s = data.summary;
    exportMultiSheetExcel(
      [
        {
          name: "Summary",
          rows: [
            {
              "Total Cash Sales": s.total_cash_sales,
              "Total Non-Cash": s.total_non_cash_sales,
              "Total Expected": s.total_expected,
              "Total Actual": s.total_actual,
              "Total Difference": s.total_difference,
              "Total Transactions": s.total_transactions,
            },
          ],
        },
        {
          name: "Shifts",
          rows: data.shifts.map((r) => ({
            Kasir: r.cashier_name,
            Status: r.status,
            "Opened At": r.opened_at,
            "Closed At": r.closed_at,
            "Opening Cash": r.opening_cash,
            "Cash Sales": r.cash_sales,
            "Non-Cash Sales": r.non_cash_sales,
            "Expected Cash": r.expected_cash,
            "Actual Cash": r.actual_cash,
            Difference: r.difference,
            "Tx Count": r.transaction_count,
          })),
        },
      ],
      `laporan-shift-${todayISO()}.xlsx`
    );
  };

  const exportPDF = () => {
    if (!data) return;
    const s = data.summary;
    exportPDFReport(
      "Laporan Shift",
      `Periode: ${rangeStr} | Total Tx: ${s.total_transactions} | Selisih: ${formatIDR(s.total_difference)}`,
      [["Kasir", "Status", "Opened", "Closed", "Expected", "Actual", "Diff", "Tx"]],
      data.shifts.map((r) => [
        r.cashier_name,
        r.status,
        r.opened_at ? new Date(r.opened_at).toLocaleString("id-ID") : "-",
        r.closed_at ? new Date(r.closed_at).toLocaleString("id-ID") : "-",
        formatIDR(r.expected_cash),
        formatIDR(r.actual_cash),
        formatIDR(r.difference),
        r.transaction_count,
      ]),
      `laporan-shift-${todayISO()}.pdf`
    );
  };

  if (loading) return <Loading />;
  if (!data) return null;
  const s = data.summary;

  const diffColor = (diff) => {
    if (diff === 0) return "text-[#2E8B57]";
    if (diff < 0) return "text-red-400";
    return "text-yellow-400";
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap items-end gap-4">
        <DateRangeInputs
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
        />
        <button
          onClick={fetchData}
          className="bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold hover:bg-[#FFDD5C] transition-colors"
        >
          Terapkan
        </button>
        <div className="flex-1" />
        <ExportButtons onExcel={exportExcel} onPDF={exportPDF} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card label="Total Cash Sales" value={formatIDR(s.total_cash_sales)} icon={Banknote} />
        <Card label="Total Non-Cash" value={formatIDR(s.total_non_cash_sales)} icon={CreditCard} accent="text-[#F5F5F5]" />
        <Card label="Total Expected" value={formatIDR(s.total_expected)} icon={Wallet} accent="text-[#F5F5F5]" />
        <Card label="Total Actual" value={formatIDR(s.total_actual)} icon={Wallet} accent="text-[#F5F5F5]" />
        <Card
          label="Total Difference"
          value={formatIDR(s.total_difference)}
          icon={AlertTriangle}
          accent={diffColor(s.total_difference)}
        />
        <Card label="Total Transaksi" value={s.total_transactions} icon={ShoppingCart} accent="text-[#F5F5F5]" />
      </div>

      {/* Shifts table */}
      <SectionCard title="Daftar Shift">
        <Table
          headers={[
            { label: "Kasir" },
            { label: "Status" },
            { label: "Opened" },
            { label: "Closed" },
            { label: "Opening", align: "right" },
            { label: "Cash Sales", align: "right" },
            { label: "Non-Cash", align: "right" },
            { label: "Expected", align: "right" },
            { label: "Actual", align: "right" },
            { label: "Diff", align: "right" },
            { label: "Tx", align: "right" },
          ]}
          rows={data.shifts.map((r) => [
            { value: r.cashier_name },
            {
              value: r.status,
              className:
                r.status === "open"
                  ? "text-[#2E8B57] uppercase"
                  : "text-[#C4A484] uppercase",
            },
            {
              value: r.opened_at
                ? new Date(r.opened_at).toLocaleString("id-ID")
                : "-",
              className: "text-xs text-[#C4A484]",
            },
            {
              value: r.closed_at
                ? new Date(r.closed_at).toLocaleString("id-ID")
                : "-",
              className: "text-xs text-[#C4A484]",
            },
            { value: formatIDR(r.opening_cash) },
            { value: formatIDR(r.cash_sales) },
            { value: formatIDR(r.non_cash_sales) },
            { value: formatIDR(r.expected_cash) },
            { value: formatIDR(r.actual_cash) },
            {
              value: formatIDR(r.difference),
              className: diffColor(r.difference) + " font-semibold",
            },
            { value: r.transaction_count },
          ])}
          empty="Tidak ada shift pada periode ini"
        />
      </SectionCard>
    </div>
  );
}

/* ============================================================
 *  TAB 5: STOK (STOCK MOVEMENTS)
 * ============================================================ */

function StockTab({ outlets, globalOutletId }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [outletId, setOutletId] = useState(globalOutletId || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setOutletId(globalOutletId || ""); }, [globalOutletId]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (outletId) params.outlet_id = outletId;
    api
      .get("/reports/stock", { params })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Gagal memuat laporan stok"))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, outletId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportExcel = () => {
    if (!data) return;
    exportMultiSheetExcel(
      [
        {
          name: "Summary",
          rows: [
            {
              "Total In": data.summary.total_in,
              "Total Out": data.summary.total_out,
            },
          ],
        },
        {
          name: "By Reason",
          rows: data.summary.by_reason.map((r) => ({
            Reason: r.reason,
            Count: r.count,
            "Total Delta": r.total_delta,
          })),
        },
        {
          name: "By Product",
          rows: data.by_product.map((r) => ({
            Produk: r.product_name,
            "Total In": r.total_in,
            "Total Out": r.total_out,
            Net: r.net,
          })),
        },
        {
          name: "Low Stock",
          rows: data.low_stock.map((r) => ({
            Produk: r.name,
            SKU: r.sku,
            Stok: r.stock,
            Threshold: r.low_stock_threshold,
            Unit: r.unit,
          })),
        },
        {
          name: "Movements",
          rows: data.movements.map((r) => ({
            Produk: r.product_name,
            Delta: r.delta,
            Reason: r.reason,
            Note: r.note,
            "Created At": r.created_at,
          })),
        },
      ],
      `laporan-stok-${todayISO()}.xlsx`
    );
  };

  const exportPDF = () => {
    if (!data) return;
    exportPDFReport(
      "Laporan Pergerakan Stok",
      `Total In: ${data.summary.total_in} | Total Out: ${data.summary.total_out}`,
      [["Produk", "Delta", "Reason", "Note", "Waktu"]],
      data.movements.slice(0, 100).map((r) => [
        r.product_name,
        r.delta,
        r.reason,
        r.note || "-",
        new Date(r.created_at).toLocaleString("id-ID"),
      ]),
      `laporan-stok-${todayISO()}.pdf`
    );
  };

  if (loading) return <Loading />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap items-end gap-4">
        <DateRangeInputs
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
        />
        <OutletSelect
          outlets={outlets}
          value={outletId}
          onChange={setOutletId}
        />
        <button
          onClick={fetchData}
          className="bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold hover:bg-[#FFDD5C] transition-colors"
        >
          Terapkan
        </button>
        <div className="flex-1" />
        <ExportButtons onExcel={exportExcel} onPDF={exportPDF} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          label="Total Masuk"
          value={data.summary.total_in}
          icon={Package}
          accent="text-[#2E8B57]"
        />
        <Card
          label="Total Keluar"
          value={data.summary.total_out}
          icon={Package}
          accent="text-red-400"
        />
        <Card
          label="Stok Menipis"
          value={data.low_stock.length}
          icon={AlertTriangle}
          accent={data.low_stock.length > 0 ? "text-yellow-400" : "text-[#F5F5F5]"}
        />
      </div>

      {/* By reason + By product */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Berdasarkan Alasan">
          <Table
            headers={[
              { label: "Alasan" },
              { label: "Jumlah", align: "right" },
              { label: "Total Delta", align: "right" },
            ]}
            rows={data.summary.by_reason.map((r) => [
              { value: r.reason, className: "uppercase text-[#C4A484]" },
              { value: r.count },
              {
                value: r.total_delta,
                className:
                  r.total_delta >= 0 ? "text-[#2E8B57]" : "text-red-400",
              },
            ])}
          />
        </SectionCard>
        <SectionCard title="Berdasarkan Produk">
          <Table
            headers={[
              { label: "Produk" },
              { label: "Masuk", align: "right" },
              { label: "Keluar", align: "right" },
              { label: "Net", align: "right" },
            ]}
            rows={data.by_product.map((r) => [
              { value: r.product_name },
              { value: r.total_in, className: "text-[#2E8B57]" },
              { value: r.total_out, className: "text-red-400" },
              {
                value: r.net,
                className: r.net >= 0 ? "text-[#2E8B57]" : "text-red-400",
              },
            ])}
          />
        </SectionCard>
      </div>

      {/* Low stock */}
      <SectionCard title="Stok Menipis">
        <Table
          headers={[
            { label: "Produk" },
            { label: "SKU" },
            { label: "Stok", align: "right" },
            { label: "Threshold", align: "right" },
            { label: "Unit" },
          ]}
          rows={data.low_stock.map((r) => [
            { value: r.name },
            { value: r.sku || "-", className: "text-[#C4A484]" },
            { value: r.stock, className: "text-red-400 font-semibold" },
            { value: r.low_stock_threshold, className: "text-[#C4A484]" },
            { value: r.unit || "-", className: "text-[#C4A484]" },
          ])}
          empty="Semua stok aman"
        />
      </SectionCard>

      {/* Movements */}
      <SectionCard
        title="Riwayat Pergerakan Stok"
        action={
          <span className="text-[10px] text-[#C4A484]">Maks 500 baris</span>
        }
      >
        <Table
          headers={[
            { label: "Produk" },
            { label: "Delta", align: "right" },
            { label: "Alasan" },
            { label: "Catatan" },
            { label: "Waktu" },
          ]}
          rows={data.movements.map((r) => [
            { value: r.product_name },
            {
              value: r.delta > 0 ? `+${r.delta}` : `${r.delta}`,
              className: r.delta >= 0 ? "text-[#2E8B57] font-semibold" : "text-red-400 font-semibold",
            },
            { value: r.reason, className: "uppercase text-[#C4A484]" },
            { value: r.note || "-", className: "text-[#C4A484]" },
            {
              value: new Date(r.created_at).toLocaleString("id-ID"),
              className: "text-xs text-[#C4A484]",
            },
          ])}
          empty="Tidak ada pergerakan stok pada periode ini"
        />
      </SectionCard>
    </div>
  );
}

/* ============================================================
 *  TAB 6: REKONSILIASI (PAYMENT RECONCILIATION)
 * ============================================================ */

function ReconciliationTab({ outlets, globalOutletId }) {
  const [period, setPeriod] = useState("weekly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [outletId, setOutletId] = useState(globalOutletId || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setOutletId(globalOutletId || ""); }, [globalOutletId]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = { period };
    if (period === "custom") {
      if (!dateFrom || !dateTo) {
        toast.error("Pilih tanggal mulai dan akhir untuk periode custom");
        setLoading(false);
        return;
      }
      params.date_from = dateFrom;
      params.date_to = dateTo;
    }
    if (outletId) params.outlet_id = outletId;
    api
      .get("/reports/payment-reconciliation", { params })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Gagal memuat laporan rekonsiliasi"))
      .finally(() => setLoading(false));
  }, [period, dateFrom, dateTo, outletId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rangeStr = `${data?.period_start?.slice(0, 10) || "Awal"} s/d ${
    data?.period_end?.slice(0, 10) || "Sekarang"
  }`;

  const exportExcel = () => {
    if (!data) return;
    exportMultiSheetExcel(
      [
        {
          name: "By Method",
          rows: data.by_method.map((r) => ({
            Metode: r.method,
            Jumlah: r.count,
            Total: r.total,
            Verified: r.verified_count,
            Unverified: r.unverified_count,
          })),
        },
        {
          name: "Cash Detail",
          rows: [
            {
              "Total Cash Sales": data.cash_detail.total_cash_sales,
              "Change Given": data.cash_detail.total_change_given,
              "Net Cash": data.cash_detail.net_cash,
            },
          ],
        },
        {
          name: "Card Detail",
          rows: data.card_detail.map((r) => ({
            Brand: r.card_brand,
            Jumlah: r.count,
            Total: r.total,
          })),
        },
        {
          name: "Transfer Detail",
          rows: data.transfer_detail.map((r) => ({
            Bank: r.transfer_bank,
            Jumlah: r.count,
            Total: r.total,
            Verified: r.verified,
            Unverified: r.unverified,
          })),
        },
        {
          name: "QRIS Detail",
          rows: [
            {
              Jumlah: data.qris_detail.count,
              Total: data.qris_detail.total,
            },
          ],
        },
        {
          name: "By Day",
          rows: data.by_day.map((r) => ({
            Tanggal: r.date,
            Cash: r.cash,
            Card: r.card,
            QRIS: r.qris,
            Transfer: r.transfer,
          })),
        },
      ],
      `laporan-rekonsiliasi-${period}.xlsx`
    );
  };

  const exportPDF = () => {
    if (!data) return;
    exportPDFReport(
      "Laporan Rekonsiliasi Pembayaran",
      `Periode: ${rangeStr}`,
      [["Metode", "Jumlah", "Total", "Verified", "Unverified"]],
      data.by_method.map((r) => [
        r.method,
        r.count,
        formatIDR(r.total),
        r.verified_count,
        r.unverified_count,
      ]),
      `laporan-rekonsiliasi-${period}.pdf`
    );
  };

  if (loading) return <Loading />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-[#C4A484] mb-1 block">
            Periode
          </label>
          <PeriodSelector value={period} onChange={setPeriod} includeCustom />
        </div>
        {period === "custom" && (
          <DateRangeInputs
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
          />
        )}
        <OutletSelect
          outlets={outlets}
          value={outletId}
          onChange={setOutletId}
        />
        <button
          onClick={fetchData}
          className="bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-sm uppercase tracking-widest font-semibold hover:bg-[#FFDD5C] transition-colors"
        >
          Terapkan
        </button>
        <div className="flex-1" />
        <ExportButtons onExcel={exportExcel} onPDF={exportPDF} />
      </div>

      {/* By method summary */}
      <SectionCard title="Rekap per Metode Pembayaran">
        <Table
          headers={[
            { label: "Metode" },
            { label: "Jumlah", align: "right" },
            { label: "Total", align: "right" },
            { label: "Verified", align: "right" },
            { label: "Unverified", align: "right" },
          ]}
          rows={data.by_method.map((r) => [
            { value: r.method, className: "uppercase text-[#C4A484]" },
            { value: r.count },
            { value: formatIDR(r.total), className: "text-[#F4C842]" },
            { value: r.verified_count, className: "text-[#2E8B57]" },
            { value: r.unverified_count, className: r.unverified_count > 0 ? "text-red-400" : "" },
          ])}
          empty="Tidak ada transaksi pada periode ini"
        />
      </SectionCard>

      {/* Detail cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cash detail */}
        <SectionCard title="Detail Cash">
          <div className="p-6 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-[#C4A484]">Total Cash Sales</span>
              <span className="text-sm text-[#F4C842] font-semibold">
                {formatIDR(data.cash_detail.total_cash_sales)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#C4A484]">Kembalian Diberikan</span>
              <span className="text-sm text-red-400">
                - {formatIDR(data.cash_detail.total_change_given)}
              </span>
            </div>
            <div className="border-t border-[rgba(244,200,66,0.15)] pt-3 flex justify-between">
              <span className="text-sm text-[#F5F5F5] font-semibold">
                Net Cash
              </span>
              <span className="text-lg text-[#F4C842] font-semibold">
                {formatIDR(data.cash_detail.net_cash)}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* QRIS detail */}
        <SectionCard title="Detail QRIS">
          <div className="p-6 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-[#C4A484]">Jumlah Transaksi</span>
              <span className="text-sm text-[#F5F5F5]">
                {data.qris_detail.count}
              </span>
            </div>
            <div className="border-t border-[rgba(244,200,66,0.15)] pt-3 flex justify-between">
              <span className="text-sm text-[#F5F5F5] font-semibold">
                Total QRIS
              </span>
              <span className="text-lg text-[#F4C842] font-semibold">
                {formatIDR(data.qris_detail.total)}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Card detail + Transfer detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Detail Kartu">
          <Table
            headers={[
              { label: "Brand" },
              { label: "Jumlah", align: "right" },
              { label: "Total", align: "right" },
            ]}
            rows={data.card_detail.map((r) => [
              { value: r.card_brand, className: "text-[#C4A484]" },
              { value: r.count },
              { value: formatIDR(r.total), className: "text-[#F4C842]" },
            ])}
            empty="Tidak ada transaksi kartu"
          />
        </SectionCard>
        <SectionCard title="Detail Transfer">
          <Table
            headers={[
              { label: "Bank" },
              { label: "Jumlah", align: "right" },
              { label: "Total", align: "right" },
              { label: "Verified", align: "right" },
              { label: "Unverified", align: "right" },
            ]}
            rows={data.transfer_detail.map((r) => [
              { value: r.transfer_bank, className: "text-[#C4A484]" },
              { value: r.count },
              { value: formatIDR(r.total), className: "text-[#F4C842]" },
              { value: r.verified, className: "text-[#2E8B57]" },
              { value: r.unverified, className: r.unverified > 0 ? "text-red-400" : "" },
            ])}
            empty="Tidak ada transaksi transfer"
          />
        </SectionCard>
      </div>

      {/* Daily breakdown chart */}
      <SectionCard title="Grafik Harian per Metode Pembayaran">
        <MultiBarChart data={data.by_day} />
      </SectionCard>
    </div>
  );
}

/* ============================================================
 *  MAIN PAGE
 * ============================================================ */

export default function Reports() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [outlets, setOutlets] = useState([]);
  const { outletIdForApi, outlets: globalOutlets } = useOutlet();

  // Use global outlets if available, otherwise load
  useEffect(() => {
    if (globalOutlets && globalOutlets.length > 0) {
      setOutlets(globalOutlets);
    } else {
      api.get("/outlets").then((r) => setOutlets(r.data)).catch(() => {});
    }
  }, [globalOutlets]);

  return (
    <div>
      <PageHeader
        title="Laporan"
        subtitle="Pusat laporan manajerial: dashboard, penjualan, laba rugi, shift, stok & rekonsiliasi"
      />
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 bg-[#331419] gold-border rounded-lg p-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm uppercase tracking-widest font-semibold transition-colors ${
                  active
                    ? "bg-[#F4C842] text-[#1A0810]"
                    : "text-[#C4A484] hover:text-[#F5F5F5] hover:bg-[rgba(244,200,66,0.08)]"
                }`}
              >
                <Icon size={16} strokeWidth={1.8} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "dashboard" && <DashboardTab globalOutletId={outletIdForApi} />}
        {activeTab === "sales" && <SalesTab outlets={outlets} globalOutletId={outletIdForApi} />}
        {activeTab === "profit-loss" && <ProfitLossTab outlets={outlets} globalOutletId={outletIdForApi} />}
        {activeTab === "shifts" && <ShiftsTab globalOutletId={outletIdForApi} />}
        {activeTab === "stock" && <StockTab outlets={outlets} globalOutletId={outletIdForApi} />}
        {activeTab === "reconciliation" && (
          <ReconciliationTab outlets={outlets} globalOutletId={outletIdForApi} />
        )}
      </div>
    </div>
  );
}
