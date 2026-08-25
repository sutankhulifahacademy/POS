import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import { X, Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

export default function QRISPayment({ amount, description, onSuccess, onClose }) {
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post("/payments/qris", { amount, description: description || "POS checkout" });
        if (cancelled) return;
        setQr(data);
        setLoading(false);
      } catch (e) {
        setError(e.response?.data?.detail || "Gagal membuat QRIS");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [amount, description]);

  useEffect(() => {
    if (!qr || ["settlement", "capture", "expire", "deny", "cancel"].includes(status)) return;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/${qr.order_id}`);
        setStatus(data.status);
        if (data.paid) {
          toast.success("Pembayaran QRIS diterima");
          onSuccess(qr.order_id);
        } else if (["expire", "deny", "cancel"].includes(data.status)) {
          toast.error(`Pembayaran ${data.status}`);
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [qr, status, onSuccess]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F1A3A] gold-border rounded-lg max-w-md w-full p-6" data-testid="qris-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif-luxury text-2xl text-[#D4AF37]">Pembayaran QRIS</h3>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#F5F5F5]"><X size={20} /></button>
        </div>
        {error ? (
          <div className="text-center py-8">
            <p className="text-[#8B0000] mb-3">{error}</p>
            <p className="text-xs text-[#94A3B8]">Admin: tambahkan MIDTRANS_SERVER_KEY di /app/backend/.env kemudian restart backend.</p>
          </div>
        ) : loading ? (
          <div className="text-center py-16">
            <Loader2 className="animate-spin mx-auto text-[#D4AF37]" size={40} />
            <p className="text-sm text-[#94A3B8] mt-4">Membuat QR...</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-[#94A3B8]">Total Pembayaran</p>
            <p className="font-serif-luxury text-3xl text-[#D4AF37] mb-4">{formatIDR(amount)}</p>
            {qr?.qr_image && <img src={qr.qr_image} alt="QRIS" className="mx-auto w-64 h-64 bg-white p-3 rounded-md" data-testid="qris-image" />}
            <p className="text-xs text-[#94A3B8] mt-4">{qr?.order_id}</p>
            <div className="mt-4 py-3 border-t border-dashed border-[rgba(212,175,55,0.2)]">
              {status === "pending" ? (
                <div className="flex items-center justify-center gap-2 text-[#D4AF37]">
                  <Clock size={16} className="animate-pulse" />
                  <span className="text-sm">Menunggu pembayaran...</span>
                </div>
              ) : status === "settlement" || status === "capture" ? (
                <div className="flex items-center justify-center gap-2 text-[#2E8B57]">
                  <CheckCircle2 size={16} /> <span className="text-sm font-semibold">Pembayaran diterima</span>
                </div>
              ) : (
                <p className="text-sm text-[#8B0000] uppercase">Status: {status}</p>
              )}
            </div>
            <p className="text-xs text-[#94A3B8] mt-2 italic">Scan dengan aplikasi e-wallet apapun (GoPay, OVO, Dana, ShopeePay, dll.)</p>
          </div>
        )}
      </div>
    </div>
  );
}
