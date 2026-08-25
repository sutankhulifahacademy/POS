import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatIDR } from "../lib/api";
import { toast, Toaster } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, Package as PackageIcon, ScanLine, Printer, Clock, LogOut } from "lucide-react";
import BarcodeScanner from "../components/BarcodeScanner";
import Receipt, { printReceipt } from "../components/Receipt";
import QRISPayment from "../components/QRISPayment";
import { useAuth } from "../context/AuthContext";

export default function POS() {
  const { user, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const [outletStocks, setOutletStocks] = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [discount, setDiscount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [variantPick, setVariantPick] = useState(null);
  const [activeShift, setActiveShift] = useState(null);
  const [showQRIS, setShowQRIS] = useState(false);
  const nav = useNavigate();
  const bufferRef = useRef({ chars: "", lastTs: 0 });

  const load = async () => {
    const [p, c, cu, s, o] = await Promise.all([
      api.get("/products"), api.get("/categories"), api.get("/customers"),
      api.get("/shifts/active"), api.get("/outlets"),
    ]);
    setProducts(p.data); setCategories(c.data); setCustomers(cu.data);
    setActiveShift(s.data); setOutlets(o.data);
    // Default outlet: main
    if (!selectedOutlet) {
      const main = o.data.find(x => x.is_main) || o.data[0];
      if (main) setSelectedOutlet(main.id);
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedOutlet) return;
    (async () => {
      const { data } = await api.get(`/outlet-stocks/${selectedOutlet}`);
      const map = {};
      data.forEach(e => { map[e.product_id] = e.quantity; });
      setOutletStocks(map);
    })();
  }, [selectedOutlet, products]);

  const getStock = (p) => selectedOutlet && outletStocks[p.id] !== undefined ? outletStocks[p.id] : p.stock;

  const filtered = useMemo(() => products.filter((p) => {
    if (!p.is_active) return false;
    if (activeCategory !== "all" && p.category_id !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, activeCategory, search]);

  const addToCart = (product, variant = null) => {
    const stock = variant ? variant.stock : getStock(product);
    const price = variant ? variant.price : product.price;
    const displayName = variant ? `${product.name} - ${variant.name}` : product.name;
    const key = variant ? `${product.id}::${variant.name}` : product.id;
    if (stock <= 0) { toast.error(`${displayName}: stok habis`); return; }
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        if (existing.quantity >= stock) { toast.error(`Stok ${displayName} tidak cukup`); return prev; }
        return prev.map((i) => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { key, product_id: product.id, variant_name: variant?.name || "", name: displayName, price, quantity: 1, max: stock }];
    });
  };

  const handleProductClick = (product) => {
    if (product.variants && product.variants.length > 0) setVariantPick(product);
    else addToCart(product);
  };

  const handleBarcodeInput = async (code) => {
    try {
      const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(code)}`);
      if (data.variants && data.variants.length > 0) setVariantPick(data);
      else { addToCart(data); toast.success(`+ ${data.name}`); }
    } catch { toast.error(`Barcode/SKU "${code}" tidak ditemukan`); }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const now = Date.now();
      const delta = now - bufferRef.current.lastTs;
      if (delta > 100) bufferRef.current.chars = "";
      bufferRef.current.lastTs = now;
      if (e.key === "Enter") {
        const code = bufferRef.current.chars;
        bufferRef.current.chars = "";
        if (code.length >= 3) handleBarcodeInput(code);
        return;
      }
      if (e.key.length === 1) bufferRef.current.chars += e.key;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const changeQty = (key, delta) => {
    setCart((prev) => prev.map((i) => {
      if (i.key !== key) return i;
      const nq = i.quantity + delta;
      if (nq <= 0) return null;
      if (nq > i.max) { toast.error("Melebihi stok"); return i; }
      return { ...i, quantity: nq };
    }).filter(Boolean));
  };

  const removeItem = (key) => setCart((prev) => prev.filter((i) => i.key !== key));
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));
  const change = Math.max(0, Number(amountPaid || 0) - total);

  const finalizeSale = async () => {
    setProcessing(true);
    try {
      const { data } = await api.post("/sales", {
        outlet_id: selectedOutlet,
        items: cart.map((i) => ({ product_id: i.product_id, variant_name: i.variant_name, name: i.name, price: i.price, quantity: i.quantity })),
        customer_id: customerId || "",
        payment_method: paymentMethod,
        amount_paid: paymentMethod === "cash" ? Number(amountPaid) : total,
        discount: Number(discount) || 0,
        tax: 0,
      });
      setReceipt(data);
      setCart([]); setAmountPaid(""); setDiscount(0); setCustomerId("");
      toast.success("Transaksi berhasil");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal checkout");
    } finally { setProcessing(false); }
  };

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Keranjang kosong");
    if (paymentMethod === "cash" && Number(amountPaid) < total) return toast.error("Uang bayar kurang");
    if (paymentMethod === "qris") {
      setShowQRIS(true);
      return;
    }
    await finalizeSale();
  };

  const onQRISSuccess = async () => { setShowQRIS(false); await finalizeSale(); };

  return (
    <div className="min-h-screen flex bg-[#1A0810]">
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: '#111', border: '1px solid rgba(244,200,66,0.3)', color: '#F5F5F5' } }} />
      <div className="flex-1 p-8 pb-32 mr-96">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#F4C842] uppercase">Terminal Kasir</p>
            <h1 className="font-serif-luxury text-4xl text-[#F5F5F5]">Point of Sale</h1>
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <div className="flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
              <span className="text-[#C4A484]">{user?.name}</span>
              <span className="text-[10px] uppercase tracking-widest text-[#F4C842]">{user?.role}</span>
            </div>
            <select value={selectedOutlet} onChange={(e) => setSelectedOutlet(e.target.value)} className="bg-[#331419] gold-border rounded-md px-3 py-2 text-xs text-[#F5F5F5]" data-testid="pos-outlet-select">
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}{o.is_main ? " (Utama)" : ""}</option>)}
            </select>
            {activeShift ? (
              <div className="flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
                <Clock size={14} strokeWidth={1.5} className="text-[#F4C842]" />
                <span className="text-[#C4A484]">Shift · <span className="text-[#F4C842]">{formatIDR(activeShift.opening_cash)}</span></span>
              </div>
            ) : (
              <button onClick={() => nav("/shifts")} data-testid="pos-open-shift-cta" className="flex items-center gap-2 bg-[#331419] border border-[#8B0000] text-[#F5F5F5] px-3 py-2 rounded-md text-xs hover:bg-[#4A1A22]"><Clock size={14} /> Buka Shift</button>
            )}
            <button onClick={() => setShowScanner(true)} data-testid="pos-scan-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
              <ScanLine size={14} strokeWidth={2} /> Scan
            </button>
            <button onClick={async () => { await logout(); nav("/login"); }} data-testid="pos-logout-btn" className="flex items-center gap-2 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#C4A484] hover:text-[#F5F5F5] px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors">
              <LogOut size={14} strokeWidth={1.5} /> Keluar
            </button>
          </div>
        </div>

        <div className="mb-6 relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C4A484]" strokeWidth={1.5} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / SKU / scan barcode (USB)..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md pl-12 pr-4 py-3 text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#F4C842]" data-testid="pos-search-input" />
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setActiveCategory("all")} className={`px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${activeCategory === "all" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`} data-testid="pos-cat-all">Semua</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${activeCategory === c.id ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}>{c.name}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-[#C4A484]"><PackageIcon size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" /><p>Belum ada produk.</p></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="pos-product-grid">
            {filtered.map((p) => {
              const s = getStock(p);
              return (
                <button key={p.id} onClick={() => handleProductClick(p)} data-testid={`pos-product-${p.id}`} className="bg-[#331419] gold-border rounded-lg p-4 text-left card-hover disabled:opacity-40" disabled={s <= 0 && (!p.variants || p.variants.length === 0)}>
                  <div className="aspect-square rounded-md bg-[#4A1A22] mb-3 overflow-hidden flex items-center justify-center relative">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <PackageIcon size={32} strokeWidth={1.2} className="text-[#C4A484] opacity-40" />}
                    {p.variants && p.variants.length > 0 && <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest bg-[#F4C842] text-[#1A0810] px-1.5 py-0.5 rounded">Varian</span>}
                  </div>
                  <p className="text-sm text-[#F5F5F5] truncate">{p.name}</p>
                  <p className="text-xs text-[#C4A484] mt-1">Stok outlet: {s} {p.unit}</p>
                  <p className="text-[#F4C842] font-semibold mt-2">{formatIDR(p.price)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="w-96 bg-[#2A1015] border-l border-[rgba(244,200,66,0.2)] flex flex-col fixed right-0 top-0 h-screen" data-testid="pos-cart-panel">
        <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center gap-2">
          <ShoppingCart size={20} strokeWidth={1.5} className="text-[#F4C842]" />
          <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">Keranjang</h2>
          <span className="ml-auto text-xs text-[#C4A484]">{cart.length} item</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {cart.length === 0 ? <p className="text-sm text-[#C4A484] text-center py-12">Keranjang kosong.</p> : cart.map((i) => (
            <div key={i.key} className="bg-[#331419] rounded-md p-3 gold-border" data-testid={`cart-item-${i.key}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm text-[#F5F5F5] flex-1">{i.name}</p>
                <button onClick={() => removeItem(i.key)} className="text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={14} /></button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(i.key, -1)} className="w-7 h-7 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Minus size={12} className="mx-auto" /></button>
                  <span className="text-sm text-[#F5F5F5] min-w-[24px] text-center">{i.quantity}</span>
                  <button onClick={() => changeQty(i.key, 1)} className="w-7 h-7 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Plus size={12} className="mx-auto" /></button>
                </div>
                <p className="text-sm text-[#F4C842] font-semibold">{formatIDR(i.price * i.quantity)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[rgba(244,200,66,0.15)] p-6 space-y-3">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="pos-customer-select">
            <option value="">Pelanggan (opsional)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Metode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="pos-payment-method">
                <option value="cash">Tunai</option><option value="card">Kartu</option><option value="qris">QRIS</option><option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Diskon</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="pos-discount-input" />
            </div>
          </div>
          {paymentMethod === "cash" && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Uang Bayar</label>
              <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="pos-amount-paid" />
            </div>
          )}
          <div className="pt-3 space-y-1 border-t border-[rgba(244,200,66,0.15)]">
            <div className="flex justify-between text-xs text-[#C4A484]"><span>Subtotal</span><span>{formatIDR(subtotal)}</span></div>
            <div className="flex justify-between text-xs text-[#C4A484]"><span>Diskon</span><span>- {formatIDR(discount || 0)}</span></div>
            <div className="flex justify-between text-lg text-[#F5F5F5] pt-2"><span className="font-serif-luxury">Total</span><span className="text-[#F4C842] font-serif-luxury" data-testid="pos-total">{formatIDR(total)}</span></div>
            {paymentMethod === "cash" && amountPaid && <div className="flex justify-between text-xs text-[#C4A484]"><span>Kembali</span><span>{formatIDR(change)}</span></div>}
          </div>
          <button onClick={checkout} disabled={processing || cart.length === 0} data-testid="pos-checkout-btn" className="w-full bg-[#F4C842] text-[#1A0810] py-4 rounded-md font-semibold tracking-widest uppercase text-sm hover:bg-[#FFDD5C] transition-colors disabled:opacity-50">
            {processing ? "Memproses..." : paymentMethod === "qris" ? "Tampilkan QR" : "Bayar Sekarang"}
          </button>
        </div>
      </aside>

      {variantPick && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setVariantPick(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-md w-full p-6" data-testid="variant-picker">
            <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mb-4">{variantPick.name}</h3>
            <div className="space-y-2">
              {variantPick.variants.map((v, i) => (
                <button key={i} onClick={() => { addToCart(variantPick, v); setVariantPick(null); }} disabled={v.stock <= 0} data-testid={`variant-${i}`} className="w-full flex items-center justify-between bg-[#331419] gold-border hover:border-[#F4C842] rounded-md p-3 disabled:opacity-40">
                  <div className="text-left"><p className="text-sm text-[#F5F5F5]">{v.name}</p><p className="text-xs text-[#C4A484]">Stok: {v.stock}</p></div>
                  <span className="text-[#F4C842] font-semibold">{formatIDR(v.price)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setVariantPick(null)} className="mt-4 w-full border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2 rounded-md text-xs uppercase tracking-widest">Batal</button>
          </div>
        </div>
      )}

      {showScanner && <BarcodeScanner onDetected={(code) => { setShowScanner(false); handleBarcodeInput(code); }} onClose={() => setShowScanner(false)} />}
      {showQRIS && <QRISPayment amount={total} description={`POS - ${cart.length} item`} onSuccess={onQRISSuccess} onClose={() => setShowQRIS(false)} />}

      {receipt && (
        <>
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 no-print" onClick={() => setReceipt(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-lg p-8 max-w-md w-full" data-testid="receipt-modal">
              <div className="text-center border-b border-dashed border-[rgba(244,200,66,0.2)] pb-4 mb-4">
                <h3 className="font-serif-luxury text-2xl text-[#F4C842]">Republik Dimsum Imperium</h3>
                <p className="text-xs text-[#C4A484] mt-1">Jl. Gadjah Mada No.15 Pakualaman, Yogyakarta</p>
                <p className="text-xs text-[#C4A484]">{receipt.invoice_no}</p>
                <p className="text-xs text-[#C4A484]">{new Date(receipt.created_at).toLocaleString("id-ID")}</p>
              </div>
              <div className="space-y-2 mb-4">
                {receipt.items.map((i, idx) => <div key={idx} className="flex justify-between text-sm"><span className="text-[#F5F5F5]">{i.name} × {i.quantity}</span><span className="text-[#C4A484]">{formatIDR(i.price * i.quantity)}</span></div>)}
              </div>
              <div className="border-t border-dashed border-[rgba(244,200,66,0.2)] pt-4 space-y-1">
                <div className="flex justify-between text-xs text-[#C4A484]"><span>Subtotal</span><span>{formatIDR(receipt.subtotal)}</span></div>
                {receipt.discount > 0 && <div className="flex justify-between text-xs text-[#C4A484]"><span>Diskon</span><span>- {formatIDR(receipt.discount)}</span></div>}
                <div className="flex justify-between text-lg text-[#F4C842] font-semibold pt-2"><span>TOTAL</span><span>{formatIDR(receipt.total)}</span></div>
                <div className="flex justify-between text-xs text-[#C4A484]"><span>Bayar ({receipt.payment_method})</span><span>{formatIDR(receipt.amount_paid)}</span></div>
                <div className="flex justify-between text-xs text-[#C4A484]"><span>Kembali</span><span>{formatIDR(receipt.change)}</span></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={printReceipt} data-testid="print-receipt-btn" className="flex-1 border border-[#F4C842] text-[#F4C842] py-2.5 rounded-md font-semibold uppercase text-xs tracking-widest hover:bg-[#F4C842]/10 flex items-center justify-center gap-2"><Printer size={14} /> Cetak</button>
                <button onClick={() => setReceipt(null)} data-testid="receipt-close-btn" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md font-semibold uppercase text-xs tracking-widest hover:bg-[#FFDD5C]">Tutup</button>
              </div>
            </div>
          </div>
          <Receipt sale={receipt} />
        </>
      )}
    </div>
  );
}
