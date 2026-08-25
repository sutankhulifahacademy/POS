import { useEffect, useState, useMemo } from "react";
import api, { formatIDR } from "../lib/api";
import { toast, Toaster } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, Package as PackageIcon } from "lucide-react";

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

  const load = async () => {
    const [p, c, cu] = await Promise.all([
      api.get("/products"),
      api.get("/categories"),
      api.get("/customers"),
    ]);
    setProducts(p.data);
    setCategories(c.data);
    setCustomers(cu.data);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => products.filter((p) => {
    if (!p.is_active) return false;
    if (activeCategory !== "all" && p.category_id !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, activeCategory, search]);

  const addToCart = (product) => {
    if (product.stock <= 0) {
      toast.error(`${product.name}: stok habis`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.error(`Stok ${product.name} tidak cukup`);
          return prev;
        }
        return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1, max: product.stock }];
    });
  };

  const changeQty = (pid, delta) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== pid) return i;
      const nq = i.quantity + delta;
      if (nq <= 0) return null;
      if (nq > i.max) { toast.error("Melebihi stok"); return i; }
      return { ...i, quantity: nq };
    }).filter(Boolean));
  };

  const removeItem = (pid) => setCart((prev) => prev.filter((i) => i.product_id !== pid));

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));
  const change = Math.max(0, Number(amountPaid || 0) - total);

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Keranjang kosong");
    if (paymentMethod === "cash" && Number(amountPaid) < total) return toast.error("Uang bayar kurang");
    setProcessing(true);
    try {
      const { data } = await api.post("/sales", {
        items: cart.map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        customer_id: customerId || "",
        payment_method: paymentMethod,
        amount_paid: paymentMethod === "cash" ? Number(amountPaid) : total,
        discount: Number(discount) || 0,
        tax: 0,
      });
      setReceipt(data);
      setCart([]);
      setAmountPaid("");
      setDiscount(0);
      setCustomerId("");
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

      {/* Products area (70%) */}
      <div className="flex-1 p-8 pb-32">
        <div className="mb-6">
          <p className="text-xs tracking-[0.3em] text-[#D4AF37] uppercase">Terminal Kasir</p>
          <h1 className="font-serif-luxury text-4xl text-[#FDFBF7]">Point of Sale</h1>
        </div>

        {/* Search */}
        <div className="mb-6 relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A39B8B]" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau SKU produk..."
            className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md pl-12 pr-4 py-3 text-[#FDFBF7] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            data-testid="pos-search-input"
          />
        </div>

        {/* Categories */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${activeCategory === "all" ? "bg-[#D4AF37] text-[#050505]" : "bg-[#111] text-[#A39B8B] hover:text-[#FDFBF7]"}`}
            data-testid="pos-cat-all"
          >Semua</button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${activeCategory === c.id ? "bg-[#D4AF37] text-[#050505]" : "bg-[#111] text-[#A39B8B] hover:text-[#FDFBF7]"}`}
            >{c.name}</button>
          ))}
        </div>

        {/* Grid */}
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
                onClick={() => addToCart(p)}
                data-testid={`pos-product-${p.id}`}
                className="bg-[#111] gold-border rounded-lg p-4 text-left card-hover disabled:opacity-40"
                disabled={p.stock <= 0}
              >
                <div className="aspect-square rounded-md bg-[#1A1A1A] mb-3 overflow-hidden flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <PackageIcon size={32} strokeWidth={1.2} className="text-[#A39B8B] opacity-40" />
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

      {/* Cart Panel (30%) */}
      <aside className="w-96 bg-[#0A0A0A] border-l border-[rgba(212,175,55,0.2)] flex flex-col fixed right-0 top-0 h-screen" data-testid="pos-cart-panel">
        <div className="p-6 border-b border-[rgba(212,175,55,0.15)] flex items-center gap-2">
          <ShoppingCart size={20} strokeWidth={1.5} className="text-[#D4AF37]" />
          <h2 className="font-serif-luxury text-2xl text-[#FDFBF7]">Keranjang</h2>
          <span className="ml-auto text-xs text-[#A39B8B]">{cart.length} item</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {cart.length === 0 ? (
            <p className="text-sm text-[#A39B8B] text-center py-12">Keranjang kosong. Klik produk untuk menambahkan.</p>
          ) : (
            cart.map((i) => (
              <div key={i.product_id} className="bg-[#111] rounded-md p-3 gold-border" data-testid={`cart-item-${i.product_id}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm text-[#FDFBF7] flex-1">{i.name}</p>
                  <button onClick={() => removeItem(i.product_id)} className="text-[#A39B8B] hover:text-[#8B0000] transition-colors">
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(i.product_id, -1)} className="w-7 h-7 rounded-md bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] flex items-center justify-center text-[#D4AF37] hover:bg-[#1A1A1A] transition-colors" data-testid={`cart-decrement-${i.product_id}`}>
                      <Minus size={12} strokeWidth={1.5} />
                    </button>
                    <span className="text-sm text-[#FDFBF7] min-w-[24px] text-center">{i.quantity}</span>
                    <button onClick={() => changeQty(i.product_id, 1)} className="w-7 h-7 rounded-md bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] flex items-center justify-center text-[#D4AF37] hover:bg-[#1A1A1A] transition-colors" data-testid={`cart-increment-${i.product_id}`}>
                      <Plus size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                  <p className="text-sm text-[#D4AF37] font-semibold">{formatIDR(i.price * i.quantity)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout section */}
        <div className="border-t border-[rgba(212,175,55,0.15)] p-6 space-y-3">
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-sm text-[#FDFBF7] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            data-testid="pos-customer-select"
          >
            <option value="">Pelanggan (opsional)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#A39B8B]">Metode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full bg-[#0A0A0A] border border-[rgba(212,175,55,0.2)] rounded-md px-3 py-2 text-sm text-[#FDFBF7]" data-testid="pos-payment-method">
                <option value="cash">Tunai</option>
                <option value="card">Kartu</option>
                <option value="qris">QRIS</option>
                <option value="transfer">Transfer</option>
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
            {paymentMethod === "cash" && amountPaid && (
              <div className="flex justify-between text-xs text-[#A39B8B]"><span>Kembali</span><span>{formatIDR(change)}</span></div>
            )}
          </div>

          <button
            onClick={checkout}
            disabled={processing || cart.length === 0}
            data-testid="pos-checkout-btn"
            className="w-full bg-[#D4AF37] text-[#050505] py-4 rounded-md font-semibold tracking-widest uppercase text-sm hover:bg-[#FFD700] transition-colors disabled:opacity-50"
          >
            {processing ? "Memproses..." : "Bayar Sekarang"}
          </button>
        </div>
      </aside>

      {/* Receipt modal */}
      {receipt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setReceipt(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#0A0A0A] border border-[rgba(212,175,55,0.3)] rounded-lg p-8 max-w-md w-full" data-testid="receipt-modal">
            <div className="text-center border-b border-dashed border-[rgba(212,175,55,0.2)] pb-4 mb-4">
              <h3 className="font-serif-luxury text-2xl text-[#D4AF37]">Sutan Khulifah</h3>
              <p className="text-xs text-[#A39B8B] mt-1">{receipt.invoice_no}</p>
              <p className="text-xs text-[#A39B8B]">{new Date(receipt.created_at).toLocaleString("id-ID")}</p>
            </div>
            <div className="space-y-2 mb-4">
              {receipt.items.map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-[#FDFBF7]">{i.name} × {i.quantity}</span>
                  <span className="text-[#A39B8B]">{formatIDR(i.price * i.quantity)}</span>
                </div>
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
            <button onClick={() => setReceipt(null)} data-testid="receipt-close-btn" className="mt-4 w-full bg-[#D4AF37] text-[#050505] py-2.5 rounded-md font-semibold uppercase text-xs tracking-widest hover:bg-[#FFD700] transition-colors">Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
