import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatIDR } from "../lib/api";
import { toast, Toaster } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, Package as PackageIcon, ScanLine, Printer, Clock } from "lucide-react";
import BarcodeScanner from "../components/BarcodeScanner";
import Receipt, { printReceipt } from "../components/Receipt";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
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
  const [variantPick, setVariantPick] = useState(null); // product with variants
  const [activeShift, setActiveShift] = useState(null);
  const nav = useNavigate();

  // USB HID barcode scanner listener
  const bufferRef = useRef({ chars: "", lastTs: 0 });

  const load = async () => {
    const [p, c, cu, s] = await Promise.all([
      api.get("/products"),
      api.get("/categories"),
      api.get("/customers"),
      api.get("/shifts/active"),
    ]);
    setProducts(p.data);
    setCategories(c.data);
    setCustomers(cu.data);
    setActiveShift(s.data);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => products.filter((p) => {
    if (!p.is_active) return false;
    if (activeCategory !== "all" && p.category_id !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, activeCategory, search]);

  const addToCart = (product, variant = null) => {
    const stock = variant ? variant.stock : product.stock;
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
    if (product.variants && product.variants.length > 0) {
      setVariantPick(product);
    } else {
      addToCart(product);
    }
  };

  // Handle barcode/SKU lookup (from webcam scanner or USB HID)
  const handleBarcodeInput = async (code) => {
    try {
      const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(code)}`);
      if (data.variants && data.variants.length > 0) {
        setVariantPick(data);
      } else {
        addToCart(data);
        toast.success(`+ ${data.name}`);
      }
    } catch {
      toast.error(`Barcode/SKU "${code}" tidak ditemukan`);
    }
  };

  // USB HID scanner: detect rapid typing (< 30ms/char) + Enter
  useEffect(() => {
    const onKeyDown = (e) => {
      // ignore if focused on input/textarea
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

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Keranjang kosong");
    if (paymentMethod === "cash" && Number(amountPaid) < total) return toast.error("Uang bayar kurang");
    setProcessing(true);
    try {
      const { data } = await api.post("/sales", {
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
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#050505]">
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: '#111', border: '1px solid rgba(212,175,55,0.3)', color: '#FDFBF7' } }} />

      <div className="flex-1 p-8 pb-32">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#D4AF37] uppercase">Terminal Kasir</p>
            <h1 className="font-serif-luxury text-4xl text-[#FDFBF7]">Point of Sale</h1>
          </div>
          <div className="flex gap-2 items-center">
            {activeShift ? (
              <div className="flex items-center gap-2 bg-[#111] gold-border rounded-md px-3 py-2 text-xs">
                <Clock size={14} strokeWidth={1.5} className="text-[#D4AF37]" />
                <span className="text-[#A39B8B]">Shift Aktif · Kas Awal <span className="text-[#D4AF37]">{formatIDR(activeShift.opening_cash)}</span></span>
              </div>
            ) : (
              <button onClick={() => nav("/shifts")} data-testid="pos-open-shift-cta" className="flex items-center gap-2 bg-[#111] border border-[#8B0000] text-[#FDFBF7] px-3 py-2 rounded-md text-xs hover:bg-[#1A1A1A] transition-colors">
                <Clock size={14} /> Buka Shift Dulu
              </button>
            )}
            <button onClick={() => setShowScanner(true)} data-testid="pos-scan-btn" className="flex items-center gap-2 bg-[#D4AF37] text-[#050505] px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-[#FFD700] transition-colors">
              <ScanLine size={14} strokeWidth={2} /> Scan Barcode
            </button>
          </div>
        </div>

        <div className="mb-6 relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A39B8B]" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / SKU / atau scan barcode (USB scanner)..."
            className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md pl-12 pr-4 py-3 text-[#FDFBF7] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            data-testid="pos-search-input"
          />
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setActiveCategory("all")} className={`px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${activeCategory === "all" ? "bg-[#D4AF37] text-[#050505]" : "bg-[#111] text-[#A39B8B] hover:text-[#FDFBF7]"}`} data-testid="pos-cat-all">Semua</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${activeCategory === c.id ? "bg-[#D4AF37] text-[#050505]" : "bg-[#111] text-[#A39B8B] hover:text-[#FDFBF7]"}`}>{c.name}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-[#A39B8B]">
            <PackageIcon size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
            <p>Belum ada produk. Tambahkan di menu Produk.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="pos-product-grid">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProductClick(p)}
                data-testid={`pos-product-${p.id}`}
                className="bg-[#111] gold-border rounded-lg p-4 text-left card-hover disabled:opacity-40"
                disabled={p.stock <= 0 && (!p.variants || p.variants.length === 0)}
              >
                <div className="aspect-square rounded-md bg-[#1A1A1A] mb-3 overflow-hidden flex items-center justify-center relative">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <PackageIcon size={32} strokeWidth={1.2} className="text-[#A39B8B] opacity-40" />}
                  {p.variants && p.variants.length > 0 && (
                    <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest bg-[#D4AF37] text-[#050505] px-1.5 py-0.5 rounded">Varian</span>
                  )}
                </div>
                <p className="text-sm text-[#FDFBF7] truncate">{p.name}</p>
                <p className="text-xs text-[#A39B8B] mt-1">Stok: {p.stock} {p.unit}</p>
                <p className="text-[#D4AF37] font-semibold mt-2">{formatIDR(p.price)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart Panel */}
      <aside className="w-96 bg-[#0A0A0A] border-l border-[rgba(212,175,55,0.2)] flex flex-col fixed right-0 top-0 h-screen" data-testid="pos-cart-panel">
        <div className="p-6 border-b border-[rgba(212,175,55,0.15)] flex items-center gap-2">
          <ShoppingCart size={20} strokeWidth={1.5} className="text-[#D4AF37]" />
          <h2 className="font-serif-luxury text-2xl text-[#FDFBF7]">Keranjang</h2>
          <span className="ml-auto text-xs text-[#A39B8B]">{cart.length} item</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {cart.length === 0 ? (
            <p className="text-sm text-[#A39B8B] text-center py-12">Keranjang kosong. Klik produk atau scan barcode.</p>
          ) : (
            cart.map((i) => (
              <div key={i.key} className="bg-[#111] rounded-md p-3 gold-border" data-testid={`cart-item-${i.key}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm text-[#FDFBF7] flex-1">{i.name}</p>
                  <button onClick={() => removeItem(i.key)} className="text-[#A39B8B] hover:text-[#8B0000] transition-colors"><Trash2 size={14} strokeWidth={1.5} /></button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(i.key, -1)} className="w-7 h-7 rounded-md bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] flex items-center justify-center text-[#D4AF37] hover:bg-[#1A1A1A] transition-colors"><Minus size={12} /></button>
                    <span className="text-sm text-[#FDFBF7] min-w-[24px] text-center">{i.quantity}</span>
                    <button onClick={() => changeQty(i.key, 1)} className="w-7 h-7 rounded-md bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] flex items-center justify-center text-[#D4AF37] hover:bg-[#1A1A1A] transition-colors"><Plus size={12} /></button>
                  </div>
                  <p className="text-sm text-[#D4AF37] font-semibold">{formatIDR(i.price * i.quantity)}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-[rgba(212,175,55,0.15)] p-6 space-y-3">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-sm text-[#FDFBF7]" data-testid="pos-customer-select">
            <option value="">Pelanggan (opsional)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#A39B8B]">Metode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-sm text-[#FDFBF7]" data-testid="pos-payment-method">
                <option value="cash">Tunai</option><option value="card">Kartu</option><option value="qris">QRIS</option><option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#A39B8B]">Diskon</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-sm text-[#FDFBF7]" data-testid="pos-discount-input" />
            </div>
          </div>
          {paymentMethod === "cash" && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#A39B8B]">Uang Bayar</label>
              <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" className="mt-1 w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-sm text-[#FDFBF7]" data-testid="pos-amount-paid" />
            </div>
          )}
          <div className="pt-3 space-y-1 border-t border-[rgba(212,175,55,0.15)]">
            <div className="flex justify-between text-xs text-[#A39B8B]"><span>Subtotal</span><span>{formatIDR(subtotal)}</span></div>
            <div className="flex justify-between text-xs text-[#A39B8B]"><span>Diskon</span><span>- {formatIDR(discount || 0)}</span></div>
            <div className="flex justify-between text-lg text-[#FDFBF7] pt-2"><span className="font-serif-luxury">Total</span><span className="text-[#D4AF37] font-serif-luxury" data-testid="pos-total">{formatIDR(total)}</span></div>
            {paymentMethod === "cash" && amountPaid && <div className="flex justify-between text-xs text-[#A39B8B]"><span>Kembali</span><span>{formatIDR(change)}</span></div>}
          </div>
          <button onClick={checkout} disabled={processing || cart.length === 0} data-testid="pos-checkout-btn" className="w-full bg-[#D4AF37] text-[#050505] py-4 rounded-md font-semibold tracking-widest uppercase text-sm hover:bg-[#FFD700] transition-colors disabled:opacity-50">
            {processing ? "Memproses..." : "Bayar Sekarang"}
          </button>
        </div>
      </aside>

      {/* Variant picker modal */}
      {variantPick && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setVariantPick(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#0A0A0A] gold-border rounded-lg max-w-md w-full p-6" data-testid="variant-picker">
            <h3 className="font-serif-luxury text-2xl text-[#FDFBF7] mb-4">{variantPick.name}</h3>
            <p className="text-xs text-[#A39B8B] mb-4">Pilih varian:</p>
            <div className="space-y-2">
              {variantPick.variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => { addToCart(variantPick, v); setVariantPick(null); }}
                  disabled={v.stock <= 0}
                  data-testid={`variant-${i}`}
                  className="w-full flex items-center justify-between bg-[#111] gold-border hover:border-[#D4AF37] rounded-md p-3 transition-colors disabled:opacity-40"
                >
                  <div className="text-left">
                    <p className="text-sm text-[#FDFBF7]">{v.name}</p>
                    <p className="text-xs text-[#A39B8B]">Stok: {v.stock}</p>
                  </div>
                  <span className="text-[#D4AF37] font-semibold">{formatIDR(v.price)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setVariantPick(null)} className="mt-4 w-full border border-[rgba(212,175,55,0.3)] text-[#D4AF37] py-2 rounded-md text-xs uppercase tracking-widest hover:bg-[#111] transition-colors">Batal</button>
          </div>
        </div>
      )}

      {/* Scanner modal */}
      {showScanner && <BarcodeScanner onDetected={(code) => { setShowScanner(false); handleBarcodeInput(code); }} onClose={() => setShowScanner(false)} />}

      {/* Receipt modal */}
      {receipt && (
        <>
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 no-print" onClick={() => setReceipt(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-[#0A0A0A] border border-[rgba(212,175,55,0.3)] rounded-lg p-8 max-w-md w-full" data-testid="receipt-modal">
              <div className="text-center border-b border-dashed border-[rgba(212,175,55,0.2)] pb-4 mb-4">
                <h3 className="font-serif-luxury text-2xl text-[#D4AF37]">Sutan Khulifah</h3>
                <p className="text-xs text-[#A39B8B] mt-1">{receipt.invoice_no}</p>
                <p className="text-xs text-[#A39B8B]">{new Date(receipt.created_at).toLocaleString("id-ID")}</p>
              </div>
              <div className="space-y-2 mb-4">
                {receipt.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-sm"><span className="text-[#FDFBF7]">{i.name} × {i.quantity}</span><span className="text-[#A39B8B]">{formatIDR(i.price * i.quantity)}</span></div>
                ))}
              </div>
              <div className="border-t border-dashed border-[rgba(212,175,55,0.2)] pt-4 space-y-1">
                <div className="flex justify-between text-xs text-[#A39B8B]"><span>Subtotal</span><span>{formatIDR(receipt.subtotal)}</span></div>
                {receipt.discount > 0 && <div className="flex justify-between text-xs text-[#A39B8B]"><span>Diskon</span><span>- {formatIDR(receipt.discount)}</span></div>}
                <div className="flex justify-between text-lg text-[#D4AF37] font-semibold pt-2"><span>TOTAL</span><span>{formatIDR(receipt.total)}</span></div>
                <div className="flex justify-between text-xs text-[#A39B8B]"><span>Bayar ({receipt.payment_method})</span><span>{formatIDR(receipt.amount_paid)}</span></div>
                <div className="flex justify-between text-xs text-[#A39B8B]"><span>Kembali</span><span>{formatIDR(receipt.change)}</span></div>
              </div>
              <p className="text-center text-xs text-[#A39B8B] mt-4 italic">Terima kasih atas kunjungan Anda</p>
              <div className="flex gap-2 mt-4">
                <button onClick={printReceipt} data-testid="print-receipt-btn" className="flex-1 border border-[#D4AF37] text-[#D4AF37] py-2.5 rounded-md font-semibold uppercase text-xs tracking-widest hover:bg-[#D4AF37]/10 transition-colors flex items-center justify-center gap-2">
                  <Printer size={14} strokeWidth={1.8} /> Cetak Struk
                </button>
                <button onClick={() => setReceipt(null)} data-testid="receipt-close-btn" className="flex-1 bg-[#D4AF37] text-[#050505] py-2.5 rounded-md font-semibold uppercase text-xs tracking-widest hover:bg-[#FFD700] transition-colors">Tutup</button>
              </div>
            </div>
          </div>
          <Receipt sale={receipt} />
        </>
      )}
    </div>
  );
}
