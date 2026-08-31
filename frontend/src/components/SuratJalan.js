import { useEffect, useState } from "react";
import api from "../lib/api";
import { X, Printer, Truck } from "lucide-react";
import { toast } from "sonner";

/**
 * Surat Jalan (Delivery Note) printable component.
 * Opens as a modal with print-ready layout.
 */
export default function SuratJalan({ deliveryNoteId, transferId, onClose }) {
  const [dn, setDn] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        let url;
        if (deliveryNoteId) {
          url = `/delivery-notes/${deliveryNoteId}`;
        } else {
          url = `/delivery-notes/by-transfer/${transferId}`;
        }
        const { data } = await api.get(url);
        setDn(data);
      } catch (err) {
        toast.error("Gagal memuat Surat Jalan");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [deliveryNoteId, transferId]);

  const handlePrint = async () => {
    // Log print action
    if (dn) {
      try {
        await api.post(`/delivery-notes/${dn.id}/print`);
      } catch (e) { /* ignore log error */ }
    }
    // Trigger print
    window.print();
  };

  const handleShip = async () => {
    if (!dn) return;
    try {
      await api.post(`/delivery-notes/${dn.id}/ship`);
      toast.success("Surat Jalan ditandai dikirim");
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  if (loading) return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="text-[#C4A484]">Memuat Surat Jalan...</div>
    </div>
  );

  if (!dn) return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="text-[#C4A484]">Surat Jalan tidak ditemukan</div>
    </div>
  );

  const biz = dn.business || {};
  const items = dn.items || [];
  const totalQty = items.reduce((s, i) => s + (i.qty_sent || 0), 0);
  const dateStr = dn.generated_at ? new Date(dn.generated_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white text-black rounded-lg max-w-3xl w-full max-h-[95vh] overflow-y-auto">
        {/* Action bar (hidden on print) */}
        <div className="no-print flex items-center justify-between p-4 border-b bg-gray-100">
          <h2 className="text-lg font-bold text-gray-800">Surat Jalan — {dn.delivery_no}</h2>
          <div className="flex gap-2">
            {dn.status !== "shipped" && dn.status !== "received" && (
              <button onClick={handleShip} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                <Truck size={16} /> Tandai Dikirim
              </button>
            )}
            <button onClick={handlePrint} className="flex items-center gap-1 bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700" data-testid="print-sj-btn">
              <Printer size={16} /> {dn.print_count > 0 ? "Reprint" : "Print"}
            </button>
            <button onClick={onClose} className="bg-gray-300 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable document */}
        <div className="p-8 print-area" id="surat-jalan-print">
          {/* Header */}
          <div className="text-center mb-6 border-b-2 border-black pb-4">
            {biz.name && <h1 className="text-2xl font-bold">{biz.name}</h1>}
            {biz.address && <p className="text-sm text-gray-600 mt-1">{biz.address}</p>}
            <h2 className="text-xl font-bold mt-4 uppercase underline">Surat Jalan Transfer Stok</h2>
          </div>

          {/* Document info */}
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <table className="w-full">
                <tbody>
                  <tr><td className="py-1 font-semibold">No. Surat Jalan</td><td className="py-1">: {dn.delivery_no}</td></tr>
                  <tr><td className="py-1 font-semibold">No. Transfer</td><td className="py-1">: {dn.transfer_no}</td></tr>
                  {dn.request_no && <tr><td className="py-1 font-semibold">No. Request</td><td className="py-1">: {dn.request_no}</td></tr>}
                  <tr><td className="py-1 font-semibold">Tanggal</td><td className="py-1">: {dateStr}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full">
                <tbody>
                  <tr><td className="py-1 font-semibold">Dari</td><td className="py-1">: {dn.from_outlet_name}</td></tr>
                  <tr><td className="py-1 font-semibold">Ke</td><td className="py-1">: {dn.to_outlet_name}</td></tr>
                  <tr><td className="py-1 font-semibold">Dibuat Oleh</td><td className="py-1">: {dn.generated_by_name}</td></tr>
                  <tr><td className="py-1 font-semibold">Status</td><td className="py-1">: {dn.status?.toUpperCase()}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Items table */}
          <table className="w-full border-collapse border border-black text-sm mb-6">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black px-2 py-2 text-center w-10">No</th>
                <th className="border border-black px-2 py-2 text-left">Item</th>
                <th className="border border-black px-2 py-2 text-center w-24">SKU</th>
                <th className="border border-black px-2 py-2 text-center w-20">Qty Kirim</th>
                <th className="border border-black px-2 py-2 text-center w-16">Unit</th>
                <th className="border border-black px-2 py-2 text-center w-20">Check</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="border border-black px-2 py-2 text-center">{idx + 1}</td>
                  <td className="border border-black px-2 py-2">{item.product_name}</td>
                  <td className="border border-black px-2 py-2 text-center">{item.sku || "-"}</td>
                  <td className="border border-black px-2 py-2 text-center font-semibold">{item.qty_sent}</td>
                  <td className="border border-black px-2 py-2 text-center">{item.unit || "pcs"}</td>
                  <td className="border border-black px-2 py-2 text-center">☐</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={3} className="border border-black px-2 py-2 text-right">TOTAL</td>
                <td className="border border-black px-2 py-2 text-center">{totalQty}</td>
                <td colSpan={2} className="border border-black px-2 py-2"></td>
              </tr>
            </tfoot>
          </table>

          {/* Note */}
          {dn.transfer_note && (
            <div className="mb-6 text-sm">
              <p className="font-semibold">Catatan:</p>
              <p className="italic">{dn.transfer_note}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-4 mt-12 text-sm text-center">
            <div>
              <p className="font-semibold mb-16">Dibuat Oleh</p>
              <div className="border-t border-black pt-1">
                <p>{dn.generated_by_name || ""}</p>
                <p className="text-xs text-gray-600">Tanggal: {dateStr}</p>
              </div>
            </div>
            <div>
              <p className="font-semibold mb-16">Petugas Pengirim</p>
              <div className="border-t border-black pt-1">
                <p>&nbsp;</p>
                <p className="text-xs text-gray-600">Tanggal:</p>
              </div>
            </div>
            <div>
              <p className="font-semibold mb-16">Diterima Oleh</p>
              <div className="border-t border-black pt-1">
                <p>&nbsp;</p>
                <p className="text-xs text-gray-600">Tanggal:</p>
              </div>
            </div>
          </div>

          {/* Print count footer */}
          {dn.print_count > 0 && (
            <div className="mt-8 text-xs text-gray-500 text-center border-t pt-2">
              Printed: {dn.print_count}x · {dn.printed_by_name} · {dn.printed_at ? new Date(dn.printed_at).toLocaleString("id-ID") : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
