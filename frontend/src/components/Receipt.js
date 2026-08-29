import { formatIDR } from "../lib/api";
import { useTheme } from "../context/ThemeContext";

export default function Receipt({ sale, businessName }) {
  const { business } = useTheme();
  const name = businessName || business?.name || "POS";
  const address = business?.address || "";
  const logoUrl = business?.logo_url;

  return (
    <div id="print-receipt" className="print-only bg-white text-black" style={{ width: "80mm", padding: "8px", fontFamily: "monospace", fontSize: "11px" }}>
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        {logoUrl && <img src={logoUrl} alt={name} style={{ width: "50px", height: "50px", objectFit: "contain", marginBottom: "4px" }} />}
        <div style={{ fontSize: "14px", fontWeight: "bold" }}>{name}</div>
        {address && <div style={{ fontSize: "9px", marginTop: "2px" }}>{address}</div>}
      </div>
      <div style={{ borderTop: "1px dashed #000", padding: "4px 0", textAlign: "center", fontSize: "10px" }}>
        <div>{sale.invoice_no}</div>
        <div>{new Date(sale.created_at).toLocaleString("id-ID")}</div>
        <div>Kasir: {sale.cashier_name}</div>
      </div>
      <div style={{ borderTop: "1px dashed #000", padding: "4px 0" }}>
        {sale.items.map((i, idx) => (
          <div key={idx} style={{ marginBottom: "3px" }}>
            <div>{i.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{i.quantity} x {formatIDR(i.price)}</span>
              <span>{formatIDR(i.price * i.quantity)}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px dashed #000", padding: "4px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{formatIDR(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Diskon</span><span>-{formatIDR(sale.discount)}</span></div>}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "13px", marginTop: "2px" }}><span>TOTAL</span><span>{formatIDR(sale.total)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}><span>{sale.payment_method.toUpperCase()}</span><span>{formatIDR(sale.amount_paid)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Kembali</span><span>{formatIDR(sale.change || 0)}</span></div>
      </div>
      <div style={{ borderTop: "1px dashed #000", padding: "6px 0 2px", textAlign: "center", fontSize: "10px" }}>
        <div>Terima kasih atas kunjungan Anda</div>
      </div>
    </div>
  );
}

export function printReceipt() {
  window.print();
}
