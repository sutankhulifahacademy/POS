import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import { X, Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

export default function QRISPayment({ amount, description, transaction, onSuccess, onClose }) {
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qrisKey = `qris-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const payload = {
          description: description || "POS checkout",
          outlet_id: transaction?.outlet_id,
          price_type: transaction?.price_type || "ecceran",
          discount: transaction?.discount || 0,
          tax: transaction?.tax || 0,
          items: (transaction?.items || []).map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
            variant_name: i.variant_name || "",
            note: i.note || "",
          })),
        };
        const { data } = await api.post("/payments/qris", payload, {
          headers: { "Idempotency-Key": qrisKey },
        });
        if (cancelled) return;
        setQr(data);
        setLoading(false);
      } catch (e) {
        setError(e.response?.data?.detail || "Gagal membuat QRIS");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [description, transaction]);

  useEffect(() => {
    if (!qr || ["settlement", "capture", "expire", "deny", "cancel"].includes(status)) return;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/${qr.order_id}`);
        setStatus(data.status);
        if (data.paid) {
          toast.success("Pembayaran QRIS diterima");
          onSuccess(qr.order_id, qr.amount);
        } else if (["expire", "deny", "cancel"].includes(data.status)) {
          toast.error(`Pembayaran ${data.status}`);
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [qr, status, onSuccess]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-[#2A1015] gold-border rounded-lg max-w-md w-full p-4 sm:p-6 mx-2 sm:mx-4 max-h-[92dvh] max-h-[92vh] overflow-y-auto" data-testid="qris-modal">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="font-serif-luxury text-lg sm:text-2xl text-[#F4C842]">Pembayaran QRIS</h3>
          <button onClick={onClose} className="text-[#C4A484] hover:text-[#F5F5F5] p-1"><X size={20} /></button>
        </div>
        {error ? (
          <div className="text-center py-6 sm:py-8">
            <p className="text-[#8B0000] mb-3 text-sm">{error}</p>
            <p className="text-[10px] sm:text-xs text-[#C4A484]">Admin: pembayaran QRIS belum dikonfigurasi. Hubungi administrator untuk mengaktifkan.</p>
          </div>
        ) : loading ? (
          <div className="text-center py-10 sm:py-16">
            <Loader2 className="animate-spin mx-auto text-[#F4C842]" size={32} />
            <p className="text-sm text-[#C4A484] mt-3">Membuat QR...</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xs sm:text-sm text-[#C4A484]">Total Pembayaran</p>
            <p className="font-serif-luxury text-xl sm:text-3xl text-[#F4C842] mb-3 sm:mb-4">{formatIDR(qr?.amount ?? amount)}</p>
            {qr?.qr_image && <img src={qr.qr_image} alt="QRIS" className="mx-auto w-48 h-48 sm:w-64 sm:h-64 bg-white p-2 sm:p-3 rounded-md" data-testid="qris-image" />}
            <p className="text-[10px] sm:text-xs text-[#C4A484] mt-3 sm:mt-4 break-all">{qr?.order_id}</p>
            <div className="mt-3 sm:mt-4 py-2 sm:py-3 border-t border-dashed border-[rgba(244,200,66,0.2)]">
              {status === "pending" ? (
                <div className="flex items-center justify-center gap-2 text-[#F4C842]">
                  <Clock size={16} className="animate-pulse" />
                  <span className="text-xs sm:text-sm">Menunggu pembayaran...</span>
                </div>
              ) : status === "settlement" || status === "capture" ? (
                <div className="flex items-center justify-center gap-2 text-[#2E8B57]">
                  <CheckCircle2 size={16} /> <span className="text-xs sm:text-sm font-semibold">Pembayaran diterima</span>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-[#8B0000] uppercase">Status: {status}</p>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-[#C4A484] mt-2 italic">Scan dengan aplikasi e-wallet apapun (GoPay, OVO, Dana, ShopeePay, dll.)</p>
          </div>
        )}
      </div>
    </div>
  );
}
