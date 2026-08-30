import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatIDR } from "../lib/api";
import { toast, Toaster } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, Package as PackageIcon, ScanLine, Printer, Clock, LogOut, Utensils, LayoutDashboard, Store } from "lucide-react";
import BarcodeScanner from "../components/BarcodeScanner";
import Receipt, { printReceipt } from "../components/Receipt";
import QRISPayment from "../components/QRISPayment";
import { useAuth } from "../context/AuthContext";
import { useOutlet } from "../context/OutletContext";
import Tables from "./Tables";

export default function POS() {
  const { user, logout } = useAuth();
  const { outlets: globalOutlets, outletIdForApi, setSelectedOutlet } = useOutlet();
  // Use global outlet directly — no local state
  const selectedOutlet = outletIdForApi || "";
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [outletStocks, setOutletStocks] = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [cardType, setCardType] = useState("debit");
  const [cardBrand, setCardBrand] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardReferenceNo, setCardReferenceNo] = useState("");
  const [cardApprovalCode, setCardApprovalCode] = useState("");
  const [cardTerminalId, setCardTerminalId] = useState("");
  const [transferBank, setTransferBank] = useState("");
  const [transferAccountName, setTransferAccountName] = useState("");
  const [transferAccountNo, setTransferAccountNo] = useState("");
  const [transferReferenceNo, setTransferReferenceNo] = useState("");
  const [transferSenderName, setTransferSenderName] = useState("");
  const [transferVerified, setTransferVerified] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [cardBrands, setCardBrands] = useState([]);
  const [cardBrandOther, setCardBrandOther] = useState("");
  const [discount, setDiscount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [variantPick, setVariantPick] = useState(null);
  const [paketComposer, setPaketComposer] = useState(null);
  const [paketSearch, setPaketSearch] = useState("");
  const [activeShift, setActiveShift] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftCash, setShiftCash] = useState(0);
  const [shiftNote, setShiftNote] = useState("");
  const [shiftSaving, setShiftSaving] = useState(false);
  const [showQRIS, setShowQRIS] = useState(false);
  const [activeTab, setActiveTab] = useState("pos"); // "pos" | "dinein"
  const [cartOpen, setCartOpen] = useState(false);
  const nav = useNavigate();
  const bufferRef = useRef({ chars: "", lastTs: 0 });

  const load = async () => {
    if (!selectedOutlet) return; // Wait for global outlet to be set
    const oParam = `?outlet_id=${selectedOutlet}`;
    const [p, c, cu, s, o, pa, cb] = await Promise.all([
      api.get(`/products${oParam}`), api.get("/categories"), api.get("/customers"),
      api.get(`/shifts/active${oParam}`), api.get("/outlets"), api.get(`/payment-accounts${oParam}`),
      api.get("/card-brands"),
    ]);
    setProducts(p.data); setCategories(c.data); setCustomers(cu.data);
    setActiveShift(s.data); setOutlets(globalOutlets.length > 0 ? globalOutlets : o.data); setPaymentAccounts(pa.data || []);
    setCardBrands(cb.data || []);
  };
  useEffect(() => { load(); }, [selectedOutlet]);

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

  const addToCart = (product, variant = null, paketItems = null) => {
    const stock = variant ? variant.stock : getStock(product);
    const price = variant ? variant.price : product.price;
    const displayName = variant ? `${product.name} - ${variant.name}` : product.name;
    const key = variant ? `${product.id}::${variant.name}` : product.id;
    if (stock <= 0) { toast.error(`${displayName}: stok habis`); return; }
    setCartOpen(true);
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        if (existing.quantity >= stock) { toast.error(`Stok ${displayName} tidak cukup`); return prev; }
        return prev.map((i) => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { key, product_id: product.id, variant_name: variant?.name || "", name: displayName, price, quantity: 1, max: stock, paket_items: paketItems || [] }];
    });
  };

  const paketCategoryId = categories.find((c) => c.name === "Paket")?.id;
  const isPaketProduct = (p) => p.category_id === paketCategoryId;
  const openPaketComposer = (product) => { setPaketComposer({ product, selections: {} }); setPaketSearch(""); };
  const updatePaketSelection = (productId, delta) => setPaketComposer((prev) => ({ ...prev, selections: { ...prev.selections, [productId]: Math.max(0, (prev.selections[productId] || 0) + delta) } }));
  const paketTotalItems = paketComposer ? Object.values(paketComposer.selections).reduce((a, b) => a + b, 0) : 0;
  const addPaketToCart = () => {
    const items = Object.entries(paketComposer.selections).filter(([_, qty]) => qty > 0).map(([pid, qty]) => {
      const p = products.find((x) => x.id === pid);
      return { product_id: pid, name: p?.name || "", price: p?.price || 0, quantity: qty };
    });
    addToCart(paketComposer.product, null, items);
    setPaketComposer(null);
  };

  const handleProductClick = (product) => {
    if (product.variants && product.variants.length > 0) setVariantPick(product);
    else if (isPaketProduct(product)) openPaketComposer(product);
    else addToCart(product);
  };

  const openShiftFromPOS = async (e) => {
    e.preventDefault();
    setShiftSaving(true);
    try {
      const { data } = await api.post("/shifts/open", { opening_cash: Number(shiftCash), note: shiftNote, outlet_id: selectedOutlet || undefined });
      setActiveShift(data);
      toast.success("Shift dibuka");
      setShowShiftModal(false); setShiftCash(0); setShiftNote("");
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal membuka shift"); }
    setShiftSaving(false);
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
      // Resolve card brand: if "Lainnya", save new brand to backend
      let finalCardBrand = cardBrand;
      if (paymentMethod === "card" && cardBrand === "__other__" && cardBrandOther.trim()) {
        const trimmed = cardBrandOther.trim();
        try {
          await api.post("/card-brands", { name: trimmed });
          setCardBrands(prev => prev.find(b => b.name === trimmed) ? prev : [...prev, { id: "temp", name: trimmed, is_active: true }]);
        } catch (e) { /* ignore — brand may already exist */ }
        finalCardBrand = trimmed;
      }

      const { data } = await api.post("/sales", {
      outlet_id: selectedOutlet,

      items: cart.map((i) => ({
        product_id: i.product_id,
        variant_name: i.variant_name,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        paket_items: i.paket_items || []
      })),

      customer_id: customerId || "",
      payment_method: paymentMethod,

      amount_paid:
        paymentMethod === "cash"
          ? Number(amountPaid)
          : total,

      card_type: paymentMethod === "card" ? cardType : "",
      card_brand: paymentMethod === "card" ? finalCardBrand : "",
      card_last4: paymentMethod === "card" ? cardLast4 : "",
      card_reference_no: paymentMethod === "card" ? cardReferenceNo : "",
      card_approval_code: paymentMethod === "card" ? cardApprovalCode : "",
      card_terminal_id: paymentMethod === "card" ? cardTerminalId : "",
      transfer_bank: paymentMethod === "transfer" ? transferBank : "",
      transfer_account_name:
        paymentMethod === "transfer" ? transferAccountName : "",
      transfer_account_no:
        paymentMethod === "transfer" ? transferAccountNo : "",
      transfer_reference_no:
        paymentMethod === "transfer" ? transferReferenceNo : "",
      transfer_sender_name:
        paymentMethod === "transfer" ? transferSenderName : "",
      transfer_verified:
        paymentMethod === "transfer" ? transferVerified : false,

      discount: Number(discount) || 0,
      tax: 0,
    });
      setReceipt(data);

      setCart([]);
      setAmountPaid("");
      setDiscount(0);
      setCustomerId("");

      // Reset detail pembayaran kartu
      setCardType("debit");
      setCardBrand("");
      setCardLast4("");
      setCardReferenceNo("");
      setCardApprovalCode("");
      setCardTerminalId("");
      setTransferBank("");
      setTransferAccountName("");
      setTransferAccountNo("");
      setTransferReferenceNo("");
      setTransferSenderName("");
      setTransferVerified(false);

      toast.success("Transaksi berhasil");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal checkout");
    } finally { setProcessing(false); }
  };

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Keranjang kosong");
    if (paymentMethod === "cash" && Number(amountPaid) < total) return toast.error("Uang bayar kurang");
    if (paymentMethod === "card") {
      if (!cardReferenceNo.trim()) {
        return toast.error("Nomor referensi kartu wajib diisi");
      }

      if (cardLast4 && cardLast4.length !== 4) {
        return toast.error("4 digit terakhir kartu harus 4 angka");
      }
    }
    if (paymentMethod === "transfer") {
      if (Number(amountPaid) !== total) {
        return toast.error("Nominal transfer harus sama dengan total transaksi");
      }

      if (!transferBank.trim()) {
        return toast.error("Bank transfer wajib diisi");
      }

      if (!transferReferenceNo.trim()) {
        return toast.error("Nomor referensi transfer wajib diisi");
      }

      if (!transferSenderName.trim()) {
        return toast.error("Nama pengirim wajib diisi");
      }

      if (!transferVerified) {
        return toast.error("Transfer harus diverifikasi terlebih dahulu");
      }
    }
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
      <div className={activeTab === "pos" ? "flex-1 p-4 md:p-6 lg:p-8 pb-32 lg:mr-96" : "flex-1 p-4 md:p-6 lg:p-8"}>
        <div className="mb-6 flex items-start justify-between flex-wrap lg:pl-0 pl-12">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#F4C842] uppercase">Terminal Kasir</p>
            <h1 className="font-serif-luxury text-4xl text-[#F5F5F5]">Point of Sale</h1>
            {/* Tab switcher */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setActiveTab("pos")}
                data-testid="pos-tab-pos"
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "pos" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}
              >
                <ShoppingCart size={15} strokeWidth={1.5} /> POS / Takeaway
              </button>
              <button
                onClick={() => setActiveTab("dinein")}
                data-testid="pos-tab-dinein"
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "dinein" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}
              >
                <Utensils size={15} strokeWidth={1.5} /> Dine-In
              </button>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <button onClick={() => setCartOpen(true)} data-testid="pos-cart-toggle" className="lg:hidden flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors min-h-[44px]">
              <ShoppingCart size={16} strokeWidth={2} /> Cart{cart.length > 0 && <span className="ml-1 bg-[#1A0810] text-[#F4C842] rounded-full px-1.5 text-[10px]">{cart.length}</span>}
            </button>
            <div className="flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
              <span className="text-[#C4A484]">{user?.name}</span>
              <span className="text-[10px] uppercase tracking-widest text-[#F4C842]">{user?.role}</span>
            </div>
            <div className="flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
              <Store size={14} className="text-[#F4C842]" />
              <span className="text-[#F5F5F5]">{outlets.find(o => o.id === selectedOutlet)?.name || "Pilih Outlet"}</span>
            </div>
            {activeShift ? (
              <div className="flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
                <Clock size={14} strokeWidth={1.5} className="text-[#F4C842]" />
                <span className="text-[#C4A484]">Shift · <span className="text-[#F4C842]">{formatIDR(activeShift.opening_cash)}</span></span>
              </div>
            ) : (
              <button onClick={() => setShowShiftModal(true)} data-testid="pos-open-shift-cta" className="flex items-center gap-2 bg-[#331419] border border-[#8B0000] text-[#F5F5F5] px-3 py-2 rounded-md text-xs hover:bg-[#4A1A22]"><Clock size={14} /> Buka Shift</button>
            )}
            {activeTab === "pos" && (
              <button onClick={() => setShowScanner(true)} data-testid="pos-scan-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
                <ScanLine size={14} strokeWidth={2} /> Scan
              </button>
            )}
            {(user?.role === "admin" || user?.role === "manager") && (
              <button onClick={() => nav("/dashboard")} data-testid="pos-dashboard-btn" className="flex items-center gap-2 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#F4C842] hover:text-[#FFDD5C] px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors">
                <LayoutDashboard size={14} strokeWidth={1.5} /> Dashboard
              </button>
            )}
            <button onClick={async () => { await logout(); nav("/login"); }} data-testid="pos-logout-btn" className="flex items-center gap-2 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#C4A484] hover:text-[#F5F5F5] px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors">
              <LogOut size={14} strokeWidth={1.5} /> Keluar
            </button>
          </div>
        </div>

        {/* Dine-In tab content */}
        {activeTab === "dinein" && (
          <Tables embedded />
        )}

        {/* POS tab content */}
        {activeTab === "pos" && (
          <>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3" data-testid="pos-product-grid">
            {filtered.map((p) => {
              const s = getStock(p);
              return (
                <button key={p.id} onClick={() => handleProductClick(p)} data-testid={`pos-product-${p.id}`} className="bg-[#331419] gold-border rounded-lg p-4 text-left card-hover disabled:opacity-40" disabled={s <= 0 && (!p.variants || p.variants.length === 0)}>
                  <div className="aspect-square rounded-md bg-[#4A1A22] mb-3 overflow-hidden flex items-center justify-center relative">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <PackageIcon size={32} strokeWidth={1.2} className="text-[#C4A484] opacity-40" />}
                    {p.variants && p.variants.length > 0 && <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest bg-[#F4C842] text-[#1A0810] px-1.5 py-0.5 rounded">Varian</span>}
                    {isPaketProduct(p) && <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest bg-[#F4C842] text-[#1A0810] px-1.5 py-0.5 rounded">Paket</span>}
                  </div>
                  <p className="text-sm text-[#F5F5F5] truncate">{p.name}</p>
                  <p className="text-xs text-[#C4A484] mt-1">Stok outlet: {s} {p.unit}</p>
                  <p className="text-[#F4C842] font-semibold mt-2">{formatIDR(p.price)}</p>
                </button>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>

      {activeTab === "pos" && (
        <>
      {/* Backdrop overlay for tablet/mobile cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setCartOpen(false)} data-testid="pos-cart-backdrop" />
      )}
      <aside
  className={`w-full max-w-sm lg:w-96 bg-[#2A1015] border-l border-[rgba(244,200,66,0.2)] flex flex-col fixed right-0 top-0 h-screen z-50 lg:z-40 transition-transform duration-300 ${cartOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`} data-testid="pos-cart-panel">
        <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center gap-2">
          <ShoppingCart size={20} strokeWidth={1.5} className="text-[#F4C842]" />
          <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">Keranjang</h2>
          <span className="ml-auto text-xs text-[#C4A484]">{cart.length} item</span>
          <button onClick={() => setCartOpen(false)} className="lg:hidden text-[#C4A484] hover:text-[#F5F5F5] ml-2" data-testid="pos-cart-close" aria-label="Tutup keranjang">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {cart.length === 0 ? <p className="text-sm text-[#C4A484] text-center py-12">Keranjang kosong.</p> : cart.map((i) => (
            <div key={i.key} className="bg-[#331419] rounded-md p-3 gold-border" data-testid={`cart-item-${i.key}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm text-[#F5F5F5] flex-1">{i.name}</p>
                <button onClick={() => removeItem(i.key)} className="text-[#C4A484] hover:text-[#8B0000]"><Trash2 size={14} /></button>
              </div>
              {i.paket_items && i.paket_items.length > 0 && (
                <div className="mb-2 pl-2 border-l border-[rgba(244,200,66,0.2)] space-y-0.5">
                  {i.paket_items.map((pi, idx) => (
                    <p key={idx} className="text-[11px] text-[#C4A484]">{idx === i.paket_items.length - 1 ? "└" : "├"} {pi.name} ×{pi.quantity}</p>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(i.key, -1)} className="w-9 h-9 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Minus size={16} className="mx-auto" /></button>
                  <span className="text-sm text-[#F5F5F5] min-w-[24px] text-center">{i.quantity}</span>
                  <button onClick={() => changeQty(i.key, 1)} className="w-9 h-9 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Plus size={16} className="mx-auto" /></button>
                </div>
                <p className="text-sm text-[#F4C842] font-semibold">{formatIDR(i.price * i.quantity)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[rgba(244,200,66,0.15)] p-6 space-y-3 max-h-[55vh] overflow-y-auto">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="pos-customer-select">
            <option value="">Pelanggan (opsional)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Metode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5] min-h-[44px]" data-testid="pos-payment-method">
                <option value="cash">Tunai</option><option value="card">Kartu</option><option value="qris">QRIS</option><option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Diskon</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="pos-discount-input" />
            </div>
          </div>
          {(paymentMethod === "cash" || paymentMethod === "transfer") && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Uang Bayar</label>
              <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="pos-amount-paid" />
            </div>
          )}
          {paymentMethod === "card" && (
            <div className="space-y-3 bg-[#331419] border border-[rgba(244,200,66,0.15)] rounded-md p-4">
              <div className="text-xs uppercase tracking-widest text-[#F4C842]">
                Detail Pembayaran Kartu
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                    Tipe Kartu
                  </label>
                  <select
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                    Bank / Brand
                  </label>
                  <select
                    value={cardBrand}
                    onChange={(e) => {
                      setCardBrand(e.target.value);
                      if (e.target.value !== "__other__") setCardBrandOther("");
                    }}
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  >
                    <option value="">Pilih</option>
                    {cardBrands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    <option value="__other__">+ Lainnya...</option>
                  </select>
                  {cardBrand === "__other__" && (
                    <input
                      type="text"
                      value={cardBrandOther}
                      onChange={(e) => setCardBrandOther(e.target.value)}
                      placeholder="Ketik nama bank/brand"
                      className="mt-2 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                    4 Digit Terakhir
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    inputMode="numeric"
                    value={cardLast4}
                    onChange={(e) =>
                      setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="4821"
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                    No. Referensi *
                  </label>
                  <input
                    type="text"
                    value={cardReferenceNo}
                    onChange={(e) => setCardReferenceNo(e.target.value)}
                    placeholder="Nomor referensi EDC"
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                    Approval Code
                  </label>
                  <input
                    type="text"
                    value={cardApprovalCode}
                    onChange={(e) => setCardApprovalCode(e.target.value)}
                    placeholder="Opsional"
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                    Terminal EDC
                  </label>
                  <input
                    type="text"
                    value={cardTerminalId}
                    onChange={(e) => setCardTerminalId(e.target.value)}
                    placeholder="EDC-01"
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  />
                </div>
              </div>
            </div>
          )}

          {paymentMethod === "transfer" && (
            <div className="space-y-3 bg-[#331419] border border-[rgba(244,200,66,0.15)] rounded-md p-4">
              <div className="text-xs uppercase tracking-widest text-[#F4C842]">
                Detail Transfer Bank
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                  Bank Tujuan *
                </label>

                <select
                  value={transferBank}
                  onChange={(e) => {
                    const acc = paymentAccounts.find(a => a.bank_name === e.target.value);
                    setTransferBank(e.target.value);
                    if (acc) {
                      setTransferAccountName(acc.account_name || "");
                      setTransferAccountNo(acc.account_no || "");
                    } else {
                      setTransferAccountName("");
                      setTransferAccountNo("");
                    }
                  }}
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  data-testid="pos-transfer-bank"
                >
                  <option value="">Pilih Bank Tujuan</option>
                  {paymentAccounts
                    .filter(a => a.is_active)
                    .map(a => (
                      <option key={a.id} value={a.bank_name}>
                        {a.bank_name} — {a.account_no}
                      </option>
                    ))}
                </select>
                {paymentAccounts.filter(a => a.is_active).length === 0 && (
                  <p className="text-[10px] text-[#8B0000] mt-1">
                    Belum ada bank terdaftar. Tambahkan di menu Pengaturan / Payment Accounts.
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                  Nama Pemilik Rekening Tujuan
                </label>

                <input
                  type="text"
                  value={transferAccountName}
                  readOnly
                  placeholder="Terisi otomatis dari bank terpilih"
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#C4A484] cursor-not-allowed"
                  data-testid="pos-transfer-account-name"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                  No. Rekening Tujuan
                </label>

                <input
                  type="text"
                  value={transferAccountNo}
                  readOnly
                  placeholder="Terisi otomatis dari bank terpilih"
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#C4A484] cursor-not-allowed"
                  data-testid="pos-transfer-account-no"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                  No. Referensi Transfer *
                </label>

                <input
                  type="text"
                  value={transferReferenceNo}
                  onChange={(e) => setTransferReferenceNo(e.target.value)}
                  placeholder="Nomor referensi / berita transfer"
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  data-testid="pos-transfer-reference"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                  Nama Pengirim *
                </label>

                <input
                  type="text"
                  value={transferSenderName}
                  onChange={(e) => setTransferSenderName(e.target.value)}
                  placeholder="Nama pengirim"
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                  data-testid="pos-transfer-sender"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-[#C4A484] cursor-pointer">
                <input
                  type="checkbox"
                  checked={transferVerified}
                  onChange={(e) => setTransferVerified(e.target.checked)}
                  data-testid="pos-transfer-verified"
                />

                <span>
                  Transfer sudah diverifikasi
                </span>
              </label>
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
        </>
      )}

      {variantPick && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setVariantPick(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md w-full p-6 mx-4" data-testid="variant-picker">
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

      {paketComposer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPaketComposer(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-lg w-full p-6 mx-4 max-h-[90vh] overflow-y-auto" data-testid="paket-composer">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">{paketComposer.product.name}</h3>
              <span className="text-lg text-[#F4C842] font-semibold whitespace-nowrap">{formatIDR(paketComposer.product.price)}</span>
            </div>
            <p className="text-xs text-[#C4A484] mb-2">Pilih item untuk paket ini</p>
            <p className="text-xs text-[#F4C842] mb-4">Total item dipilih: {paketTotalItems}</p>

            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C4A484]" strokeWidth={1.5} />
              <input value={paketSearch} onChange={(e) => setPaketSearch(e.target.value)} placeholder="Cari item..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md pl-10 pr-4 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#F4C842]" data-testid="paket-composer-search" />
            </div>

            <div className="space-y-1 mb-4 max-h-[40vh] overflow-y-auto">
              {products
                .filter((p) => p.is_active && p.category_id !== paketCategoryId)
                .filter((p) => !paketSearch || p.name.toLowerCase().includes(paketSearch.toLowerCase()))
                .map((p) => {
                  const qty = paketComposer.selections[p.id] || 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-[#331419] gold-border rounded-md p-3" data-testid={`paket-composer-item-${p.id}`}>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm text-[#F5F5F5] truncate">{p.name}</p>
                        <p className="text-xs text-[#C4A484]">{formatIDR(p.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updatePaketSelection(p.id, -1)} className="w-8 h-8 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Minus size={14} className="mx-auto" /></button>
                        <span className="text-sm text-[#F5F5F5] min-w-[24px] text-center">{qty}</span>
                        <button onClick={() => updatePaketSelection(p.id, 1)} className="w-8 h-8 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]"><Plus size={14} className="mx-auto" /></button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setPaketComposer(null)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-xs uppercase tracking-widest">Batal</button>
              <button onClick={addPaketToCart} disabled={paketTotalItems === 0} data-testid="paket-add-to-cart" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-xs font-semibold uppercase tracking-widest disabled:opacity-50">Tambah ke Keranjang</button>
            </div>
          </div>
        </div>
      )}

      {showScanner && <BarcodeScanner onDetected={(code) => { setShowScanner(false); handleBarcodeInput(code); }} onClose={() => setShowScanner(false)} />}
      {showQRIS && <QRISPayment amount={total} description={`POS - ${cart.length} item`} onSuccess={onQRISSuccess} onClose={() => setShowQRIS(false)} />}

      {receipt && (
        <>
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 no-print" onClick={() => setReceipt(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-lg p-8 max-w-full sm:max-w-md w-full mx-4" data-testid="receipt-modal">
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

      {showShiftModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowShiftModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md w-full p-6 mx-4">
            <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mb-4">Buka Shift</h3>
            <form action="javascript:void(0)" onSubmit={openShiftFromPOS} className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Kas Awal (Modal Kembali)</label>
                <input required type="number" value={shiftCash} onChange={(e) => setShiftCash(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="pos-shift-cash" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Catatan</label>
                <textarea value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} rows="2" className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowShiftModal(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest">Batal</button>
                <button type="submit" disabled={shiftSaving} data-testid="pos-confirm-open-shift" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest disabled:opacity-50">{shiftSaving ? "..." : "Buka"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
