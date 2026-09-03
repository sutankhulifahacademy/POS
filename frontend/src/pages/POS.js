import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatIDR, formatApiErrorDetail } from "../lib/api";
import { toast, Toaster } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, Package as PackageIcon, ScanLine, Printer, Clock, LogOut, Utensils, LayoutDashboard, Store, X } from "lucide-react";
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
  const [qrisOrderId, setQrisOrderId] = useState(null);
  const [activeTab, setActiveTab] = useState("pos"); // "pos" | "dinein"
  const [cartOpen, setCartOpen] = useState(false);
  const [noteEditKey, setNoteEditKey] = useState(null); // which cart item's note is being edited (mobile)
  const [salesChannel, setSalesChannel] = useState("offline"); // "offline" | "online"
  const [priceType, setPriceType] = useState("ecceran"); // "ecceran" | "reseller" | "partai"
  const [heldOrders, setHeldOrders] = useState([]); // Hold/Park order feature
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const nav = useNavigate();
  const bufferRef = useRef({ chars: "", lastTs: 0 });

  const load = async () => {
    // POS needs an outlet for per-outlet stock. If "ALL OUTLETS" is
    // selected (selectedOutlet is empty), fall back to the first
    // available outlet so products still load. Previously, when owner
    // selected "ALL OUTLETS", load() returned early and NO products
    // were displayed.
    let outletForLoad = selectedOutlet;
    if (!outletForLoad) {
      // Try global outlets first, then fetch /outlets as fallback
      if (globalOutlets.length > 0) {
        const main = globalOutlets.find(o => o.is_main) || globalOutlets[0];
        outletForLoad = main?.id || "";
      }
      if (!outletForLoad) {
        try {
          const { data: oData } = await api.get("/outlets");
          if (oData.length > 0) {
            const main = oData.find(o => o.is_main) || oData[0];
            outletForLoad = main.id;
          }
        } catch { /* ignore */ }
      }
      if (!outletForLoad) return; // No outlets at all
    }
    const oParam = `?outlet_id=${outletForLoad}`;
    try {
      const [p, c, cu, s, o, pa, cb] = await Promise.all([
        api.get(`/products${oParam}`), api.get("/categories"), api.get("/customers"),
        api.get(`/shifts/active${oParam}`), api.get("/outlets"), api.get(`/payment-accounts${oParam}`),
        api.get("/card-brands"),
      ]);
      setProducts(p.data); setCategories(c.data); setCustomers(cu.data);
      setActiveShift(s.data); setOutlets(globalOutlets.length > 0 ? globalOutlets : o.data); setPaymentAccounts(pa.data || []);
      setCardBrands(cb.data || []);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Gagal memuat data POS");
    }
  };
  useEffect(() => { load(); }, [selectedOutlet]);

  useEffect(() => {
    if (!selectedOutlet) return;
    (async () => {
      try {
        const { data } = await api.get(`/outlet-stocks/${selectedOutlet}`);
        const map = {};
        data.forEach(e => { map[e.product_id] = e.quantity; });
        setOutletStocks(map);
      } catch (e) {
        // Non-critical: outlet stocks may not be initialized yet
        console.error("Failed to load outlet stocks:", e);
      }
    })();
  }, [selectedOutlet, products]);

  const getStock = (p) => selectedOutlet && outletStocks[p.id] !== undefined ? outletStocks[p.id] : p.stock;

  // Frontend price resolution for DISPLAY only — backend does final resolution
  const resolveDisplayPrice = (product, variant = null) => {
    const obj = variant || product;
    const existingPrice = parseFloat(obj.price) || 0;
    if (salesChannel === "online") {
      const op = obj.online_price;
      if (op != null && parseFloat(op) >= 0) return parseFloat(op);
      return existingPrice;
    }
    if (priceType === "reseller") {
      const rp = obj.reseller_price;
      if (rp != null && parseFloat(rp) >= 0) return parseFloat(rp);
      return existingPrice;
    }
    if (priceType === "partai") {
      const wp = obj.wholesale_price;
      if (wp != null && parseFloat(wp) >= 0) return parseFloat(wp);
      return existingPrice;
    }
    // eceran (standard POS) — use products.price directly
    // retail_price is a separate pricing tier, NOT the default for standard POS
    return existingPrice;
  };

  const filtered = useMemo(() => products.filter((p) => {
    if (!p.is_active) return false;
    if (activeCategory !== "all" && p.category_id !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, activeCategory, search]);

  const addToCart = (product, variant = null, paketItems = null) => {
    const stock = variant ? variant.stock : getStock(product);
    const price = resolveDisplayPrice(product, variant);
    const displayName = variant ? `${product.name} - ${variant.name}` : product.name;
    const key = variant ? `${product.id}::${variant.name}` : product.id;
    if (stock <= 0) { toast.error(`${displayName}: stok habis`); return; }
    // Don't auto-open cart on mobile — sticky bottom bar shows cart status
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        if (existing.quantity >= stock) { toast.error(`Stok ${displayName} tidak cukup`); return prev; }
        return prev.map((i) => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { key, product_id: product.id, variant_name: variant?.name || "", name: displayName, price, quantity: 1, max: stock, paket_items: paketItems || [] }];
    });
  };

  // ============================================================
  // HOLD / PARK ORDER
  // ============================================================
  // Cashier can park the current cart to serve another customer,
  // then resume it later. Held orders are kept in component state
  // (session-scoped). Each held order snapshots: cart, customer,
  // discount, channel, price_type, and a timestamp.
  // ============================================================
  const holdOrder = () => {
    if (cart.length === 0) { toast.error("Cart kosong, tidak bisa ditahan"); return; }
    const held = {
      id: `held-${Date.now()}`,
      cart: [...cart],
      customerId,
      customerName: customers.find(c => c.id === customerId)?.name || "",
      discount,
      salesChannel,
      priceType,
      heldAt: new Date().toISOString(),
    };
    setHeldOrders(prev => [...prev, held]);
    setCart([]); setCustomerId(""); setDiscount(0);
    setCartOpen(false);
    toast.success(`Order ditahan (${cart.length} item)`);
  };

  const resumeOrder = (heldId) => {
    const held = heldOrders.find(h => h.id === heldId);
    if (!held) return;
    setCart(held.cart);
    setCustomerId(held.customerId);
    setDiscount(held.discount);
    setSalesChannel(held.salesChannel);
    setPriceType(held.priceType);
    setHeldOrders(prev => prev.filter(h => h.id !== heldId));
    setShowHeldOrders(false);
    setCartOpen(true);
    toast.success("Order dilanjutkan");
  };

  const discardHeldOrder = (heldId) => {
    setHeldOrders(prev => prev.filter(h => h.id !== heldId));
    toast.success("Order ditahan dibuang");
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
    // Only show variant picker for REAL variants (with "name" field).
    // Frozen packages use "pack" field — those are NOT POS variants,
    // so we add to cart directly at products.price.
    const hasRealVariants = product.variants && product.variants.length > 0
      && product.variants.some(v => v && v.name);
    if (hasRealVariants) setVariantPick(product);
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
      const hasRealVariants = data.variants && data.variants.length > 0
        && data.variants.some(v => v && v.name);
      if (hasRealVariants) setVariantPick(data);
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

  // Re-resolve cart prices when channel/price_type changes
  useEffect(() => {
    if (cart.length === 0) return;
    setCart((prev) => prev.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return item;
      const variant = item.variant_name ? (product.variants || []).find((v) => v.name === item.variant_name) : null;
      const newPrice = resolveDisplayPrice(product, variant);
      return { ...item, price: newPrice };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesChannel, priceType]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));
  const change = Math.max(0, Number(amountPaid || 0) - total);

  const finalizeSale = async (qrisOrderIdOverride = null) => {
    if (processing) return; // Double-submit protection
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

      // Generate idempotency key to prevent duplicate sales from
      // double-click, network retry, or browser refresh
      const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const { data } = await api.post("/sales", {
      outlet_id: selectedOutlet,

      items: cart.map((i) => ({
        product_id: i.product_id,
        variant_name: i.variant_name,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        note: i.note || "",
        paket_items: i.paket_items || []
      })),

      customer_id: customerId || "",
      payment_method: paymentMethod,

      sales_channel: salesChannel,
      price_type: salesChannel === "online" ? "online" : priceType,

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
      qris_order_id: (qrisOrderIdOverride || qrisOrderId) || "",
    }, {
      headers: { "Idempotency-Key": idempotencyKey }
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
    if (processing) return; // Double-submit protection
    if (cart.length === 0) return toast.error("Keranjang kosong");
    if (paymentMethod === "cash" && Number(amountPaid) < total) return toast.error("Uang bayar kurang");
    if (paymentMethod === "card") {
      if (!cardType) {
        return toast.error("Jenis kartu wajib dipilih");
      }

      if (!cardBrand) {
        return toast.error("Bank/brand kartu wajib dipilih");
      }

      if (cardBrand === "__other__" && !cardBrandOther.trim()) {
        return toast.error("Nama bank/brand wajib diisi");
      }

      if (!cardLast4 || cardLast4.length !== 4) {
        return toast.error("4 digit terakhir kartu harus 4 angka");
      }

      if (!cardReferenceNo.trim()) {
        return toast.error("Nomor referensi kartu wajib diisi");
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

  const onQRISSuccess = async (orderId) => { setShowQRIS(false); setQrisOrderId(orderId); await finalizeSale(orderId); };

  return (
    <div className={`min-h-screen flex bg-[#1A0810] ${activeTab === "pos" ? "overflow-x-hidden" : ""}`}>
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: '#111', border: '1px solid rgba(244,200,66,0.3)', color: '#F5F5F5' } }} />
      <div className={activeTab === "pos" ? "flex-1 min-w-0 p-2 sm:p-3 md:p-4 lg:p-8 pb-16 lg:pb-8 lg:mr-96" : "flex-1 min-w-0 p-2 sm:p-3 md:p-4 lg:p-8"}>
        {/* Header — compact on mobile/tablet, full on laptop+ */}
        <div className="mb-3 sm:mb-4 lg:mb-6 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div>
              <p className="hidden sm:block text-[10px] tracking-[0.3em] text-[#F4C842] uppercase">Terminal Kasir</p>
              <h1 className="font-serif-luxury text-lg sm:text-xl lg:text-4xl text-[#F5F5F5] leading-tight">Point of Sale</h1>
            </div>
            {/* Tab switcher */}
            <div className="flex gap-1.5 sm:gap-2 mt-0 sm:mt-3 lg:mt-3">
              <button
                onClick={() => setActiveTab("pos")}
                data-testid="pos-tab-pos"
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${activeTab === "pos" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}
              >
                <ShoppingCart size={14} strokeWidth={1.5} /> <span className="hidden sm:inline">POS / Takeaway</span><span className="sm:hidden">POS</span>
              </button>
              <button
                onClick={() => setActiveTab("dinein")}
                data-testid="pos-tab-dinein"
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${activeTab === "dinein" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}
              >
                <Utensils size={14} strokeWidth={1.5} /> <span className="hidden sm:inline">Dine-In</span><span className="sm:hidden">Dine</span>
              </button>
            </div>
          </div>
          {/* Action buttons — compact on mobile/tablet */}
          <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap justify-end">
            {/* User info — hidden on mobile, compact on tablet */}
            <div className="hidden md:flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
              <span className="text-[#C4A484]">{user?.name}</span>
              <span className="text-[10px] uppercase tracking-widest text-[#F4C842]">{user?.role}</span>
            </div>
            {/* Outlet — hidden on mobile, show on tablet+ */}
            <div className="hidden sm:flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
              <Store size={14} className="text-[#F4C842]" />
              <span className="text-[#F5F5F5] max-w-[120px] truncate">{outlets.find(o => o.id === selectedOutlet)?.name || "Pilih Outlet"}</span>
            </div>
            {/* Shift — hidden on mobile/tablet, show on laptop+ */}
            {activeShift ? (
              <div className="hidden lg:flex items-center gap-2 bg-[#331419] gold-border rounded-md px-3 py-2 text-xs">
                <Clock size={14} strokeWidth={1.5} className="text-[#F4C842]" />
                <span className="text-[#C4A484]">Shift · <span className="text-[#F4C842]">{formatIDR(activeShift.opening_cash)}</span></span>
              </div>
            ) : (
              <button onClick={() => setShowShiftModal(true)} data-testid="pos-open-shift-cta" className="hidden lg:flex items-center gap-2 bg-[#331419] border border-[#8B0000] text-[#F5F5F5] px-3 py-2 rounded-md text-xs hover:bg-[#4A1A22]"><Clock size={14} /> Buka Shift</button>
            )}
            {activeTab === "pos" && (
              <button onClick={() => setShowScanner(true)} data-testid="pos-scan-btn" className="flex items-center gap-1.5 sm:gap-2 bg-[#F4C842] text-[#1A0810] px-3 sm:px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
                <ScanLine size={14} strokeWidth={2} /> <span className="hidden sm:inline">Scan</span>
              </button>
            )}
            {(user?.role === "owner" || user?.role === "admin" || user?.role === "manager" || user?.role === "supervisor") && (
              <button onClick={() => nav("/dashboard")} data-testid="pos-dashboard-btn" className="hidden md:flex items-center gap-2 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#F4C842] hover:text-[#FFDD5C] px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors">
                <LayoutDashboard size={14} strokeWidth={1.5} /> Dashboard
              </button>
            )}
            <button onClick={async () => { await logout(); nav("/login"); }} data-testid="pos-logout-btn" className="flex items-center gap-1.5 bg-[#331419] border border-[rgba(244,200,66,0.3)] text-[#C4A484] hover:text-[#F5F5F5] px-2.5 sm:px-3 py-2 rounded-md text-xs uppercase tracking-wider transition-colors">
              <LogOut size={14} strokeWidth={1.5} /> <span className="hidden sm:inline">Keluar</span>
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
        <div className="mb-3 sm:mb-4 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C4A484]" strokeWidth={1.5} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari / scan barcode..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md pl-9 pr-3 py-2 sm:py-2.5 lg:py-3 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#F4C842] min-h-[36px] sm:min-h-[40px] lg:min-h-[48px]" data-testid="pos-search-input" />
        </div>

        <div className="mb-3 sm:mb-4 flex gap-1.5 sm:gap-2 overflow-x-auto pb-1.5">
          <button onClick={() => setActiveCategory("all")} className={`px-3 py-1.5 sm:py-2 rounded-md text-xs whitespace-nowrap transition-colors min-h-[32px] sm:min-h-[36px] ${activeCategory === "all" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`} data-testid="pos-cat-all">Semua</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-3 py-1.5 sm:py-2 rounded-md text-xs whitespace-nowrap transition-colors min-h-[32px] sm:min-h-[36px] ${activeCategory === c.id ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#331419] text-[#C4A484] hover:text-[#F5F5F5]"}`}>{c.name}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-[#C4A484]"><PackageIcon size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" /><p>Belum ada produk.</p></div>
        ) : (
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3 min-w-0" data-testid="pos-product-grid">
            {filtered.map((p) => {
              const s = getStock(p);
              return (
                <button key={p.id} onClick={() => handleProductClick(p)} data-testid={`pos-product-${p.id}`} className="w-full box-border bg-[#331419] gold-border rounded-lg p-3 sm:p-4 text-left card-hover disabled:opacity-40 min-h-[90px] sm:min-h-[110px]" disabled={s <= 0 && (!p.variants || p.variants.length === 0)}>
                  {isPaketProduct(p) && (
                    <span className="inline-flex items-center gap-1 mb-1 text-[8px] uppercase tracking-widest bg-[#F4C842] text-[#1A0810] px-1 py-0.5 rounded font-semibold">
                      <PackageIcon size={8} /> Paket
                    </span>
                  )}
                  {p.variants && p.variants.length > 0 && !isPaketProduct(p) && (
                    <span className="inline-flex items-center gap-1 mb-1 text-[8px] uppercase tracking-widest bg-[#F4C842] text-[#1A0810] px-1 py-0.5 rounded font-semibold">
                      Varian
                    </span>
                  )}
                  <p className="text-xs sm:text-sm text-[#F5F5F5] truncate leading-tight">{p.name}</p>
                  <p className="text-[10px] text-[#C4A484]">Stok: {s}</p>
                  <p className="text-[#F4C842] font-semibold text-xs sm:text-sm mt-1 truncate">{formatIDR(resolveDisplayPrice(p))}</p>
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
      {/* Mobile sticky bottom cart bar — product-first, cart-on-demand */}
      {cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          data-testid="pos-cart-toggle"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#2A1015] border-t border-[rgba(244,200,66,0.3)] px-3 py-2.5 flex items-center justify-between shadow-[0_-4px_12px_rgba(0,0,0,0.4)]"
          style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
        >
          <span className="flex items-center gap-2 text-sm text-[#F5F5F5]">
            <ShoppingCart size={18} className="text-[#F4C842]" />
            <span className="font-semibold">{cart.length} Item</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-base font-bold text-[#F4C842] font-serif-luxury">{formatIDR(total)}</span>
            <span className="bg-[#F4C842] text-[#1A0810] px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider">Lihat</span>
          </span>
        </button>
      )}

      {/* Backdrop overlay for mobile bottom sheet / tablet drawer */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setCartOpen(false)} data-testid="pos-cart-backdrop" />
      )}
      <aside
  className={`bg-[#2A1015] border-l border-[rgba(244,200,66,0.2)] flex flex-col fixed z-50 lg:z-40 transition-transform duration-300 bottom-0 left-0 right-0 max-h-[88dvh] rounded-t-xl border-t border-[rgba(244,200,66,0.3)] sm:bottom-auto sm:left-auto sm:right-0 sm:top-0 sm:w-96 sm:max-h-none sm:h-screen sm:h-dvh sm:rounded-none sm:border-t-0 sm:border-l lg:w-96 ${cartOpen ? "translate-y-0 sm:translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full lg:translate-x-0"}`}
  data-testid="pos-cart-panel">
        {/* Drag handle for mobile bottom sheet */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#C4A484]/40" />
        </div>
        <div className="p-3 sm:p-4 lg:p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center gap-2">
          <ShoppingCart size={18} strokeWidth={1.5} className="text-[#F4C842]" />
          <h2 className="font-serif-luxury text-lg sm:text-2xl text-[#F5F5F5]">Keranjang</h2>
          <span className="ml-auto text-xs text-[#C4A484]">{cart.length} item</span>
          {heldOrders.length > 0 && (
            <button
              onClick={() => setShowHeldOrders(true)}
              data-testid="held-orders-btn"
              className="text-[10px] sm:text-xs bg-[#F4C842]/20 border border-[#F4C842]/40 text-[#F4C842] px-2 py-1 rounded hover:bg-[#F4C842]/30"
              title={`${heldOrders.length} order ditahan`}
            >
              {heldOrders.length} Tahan
            </button>
          )}
          <button onClick={() => setCartOpen(false)} className="lg:hidden text-[#C4A484] hover:text-[#F5F5F5] ml-1 w-8 h-8 flex items-center justify-center text-lg" data-testid="pos-cart-close" aria-label="Tutup keranjang">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3 sm:p-4 lg:p-6 space-y-2 sm:space-y-3">
          {cart.length === 0 ? <p className="text-sm text-[#C4A484] text-center py-12">Keranjang kosong.</p> : cart.map((i) => (
            <div key={i.key} className="bg-[#331419] rounded-md p-2 sm:p-3 gold-border" data-testid={`cart-item-${i.key}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-xs sm:text-sm text-[#F5F5F5] flex-1 leading-tight">{i.name}</p>
                <button onClick={() => removeItem(i.key)} className="text-[#C4A484] hover:text-[#8B0000] p-1 shrink-0"><Trash2 size={14} /></button>
              </div>
              {i.paket_items && i.paket_items.length > 0 && (
                <div className="mb-1.5 pl-2 border-l border-[rgba(244,200,66,0.2)] space-y-0.5">
                  {i.paket_items.map((pi, idx) => (
                    <p key={idx} className="text-[10px] sm:text-[11px] text-[#C4A484]">{idx === i.paket_items.length - 1 ? "└" : "├"} {pi.name} ×{pi.quantity}</p>
                  ))}
                </div>
              )}
              {i.note && (
                <p className="text-[10px] text-[#C4A484] italic mb-1">Catatan: {i.note}</p>
              )}
              {/* Note: toggleable on mobile, always visible on tablet+ */}
              {noteEditKey === i.key ? (
                <input
                  type="text"
                  value={i.note || ""}
                  onChange={(e) => setCart(prev => prev.map(c => c.key === i.key ? { ...c, note: e.target.value } : c))}
                  onBlur={() => setNoteEditKey(null)}
                  placeholder="Catatan..."
                  autoFocus
                  className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded px-2 py-1 text-[10px] sm:text-[11px] text-[#C4A484] mb-1.5"
                  data-testid={`cart-note-${i.key}`}
                />
              ) : (
                <button
                  onClick={() => setNoteEditKey(i.key)}
                  className="sm:hidden text-[10px] text-[#C4A484]/70 hover:text-[#F4C842] mb-1.5 flex items-center gap-1"
                  data-testid={`cart-note-toggle-${i.key}`}
                >
                  {i.note ? "Edit catatan" : "+ Catatan"}
                </button>
              )}
              {/* Always show note input on tablet+ */}
              <input
                type="text"
                value={i.note || ""}
                onChange={(e) => setCart(prev => prev.map(c => c.key === i.key ? { ...c, note: e.target.value } : c))}
                placeholder="Catatan item..."
                className="hidden sm:block w-full bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded px-2 py-1 text-[11px] text-[#C4A484] mb-1.5"
                data-testid={`cart-note-sm-${i.key}`}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button onClick={() => changeQty(i.key, -1)} className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842] flex items-center justify-center shrink-0"><Minus size={14} /></button>
                  <span className="text-sm text-[#F5F5F5] min-w-[20px] text-center">{i.quantity}</span>
                  <button onClick={() => changeQty(i.key, 1)} className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842] flex items-center justify-center shrink-0"><Plus size={14} /></button>
                </div>
                <p className="text-xs sm:text-sm text-[#F4C842] font-semibold">{formatIDR(i.price * i.quantity)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[rgba(244,200,66,0.15)] p-3 sm:p-4 lg:p-6 space-y-2">
          {/* Sales Channel */}
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#C4A484]">Channel</label>
              <select value={salesChannel} onChange={(e) => { setSalesChannel(e.target.value); if (e.target.value === "online") setPriceType("online"); else if (priceType === "online") setPriceType("ecceran"); }} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]" data-testid="pos-sales-channel">
                <option value="offline">Offline</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>
          {salesChannel === "online" && (
            <div className="bg-[rgba(244,200,66,0.1)] border border-[rgba(244,200,66,0.3)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-[#F4C842]">
              Mode Online: semua produk menggunakan Harga Online
            </div>
          )}
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]" data-testid="pos-customer-select">
            <option value="">Pelanggan (opsional)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#C4A484]">Metode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]" data-testid="pos-payment-method">
                <option value="cash">Tunai</option><option value="card">Kartu</option><option value="qris">QRIS</option><option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#C4A484]">Diskon</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]" data-testid="pos-discount-input" />
            </div>
          </div>
          {(paymentMethod === "cash" || paymentMethod === "transfer") && (
            <div>
              <label className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#C4A484]">Uang Bayar</label>
              <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]" data-testid="pos-amount-paid" />
            </div>
          )}
          {paymentMethod === "card" && (
            <div className="space-y-2 sm:space-y-3 bg-[#331419] border border-[rgba(244,200,66,0.15)] rounded-md p-3 sm:p-4">
              <div className="text-[10px] sm:text-xs uppercase tracking-widest text-[#F4C842]">
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
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
                    className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
                  />
                </div>
              </div>
            </div>
          )}

          {paymentMethod === "transfer" && (
            <div className="space-y-2 sm:space-y-3 bg-[#331419] border border-[rgba(244,200,66,0.15)] rounded-md p-3 sm:p-4">
              <div className="text-[10px] sm:text-xs uppercase tracking-widest text-[#F4C842]">
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
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#C4A484] cursor-not-allowed min-h-[36px] sm:min-h-[40px]"
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
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#C4A484] cursor-not-allowed min-h-[36px] sm:min-h-[40px]"
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
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
                  className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-[#F5F5F5] min-h-[36px] sm:min-h-[40px]"
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
          </div>
        </div>
        <div className="shrink-0 border-t border-[rgba(244,200,66,0.15)] bg-[#2A1015] p-3 sm:p-4 lg:p-6 space-y-2" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] sm:text-xs text-[#C4A484]"><span>Subtotal</span><span>{formatIDR(subtotal)}</span></div>
            <div className="flex justify-between text-[10px] sm:text-xs text-[#C4A484]"><span>Diskon</span><span>- {formatIDR(discount || 0)}</span></div>
            <div className="flex justify-between text-base sm:text-lg text-[#F5F5F5] pt-1.5 sm:pt-2"><span className="font-serif-luxury">Total</span><span className="text-[#F4C842] font-serif-luxury" data-testid="pos-total">{formatIDR(total)}</span></div>
            {paymentMethod === "cash" && amountPaid && <div className="flex justify-between text-[10px] sm:text-xs text-[#C4A484]"><span>Kembali</span><span>{formatIDR(change)}</span></div>}
          </div>
          <button onClick={checkout} disabled={processing || cart.length === 0} data-testid="pos-checkout-btn" className="w-full bg-[#F4C842] text-[#1A0810] py-3 sm:py-4 rounded-md font-semibold tracking-widest uppercase text-xs sm:text-sm hover:bg-[#FFDD5C] transition-colors disabled:opacity-50 min-h-[48px] sm:min-h-[52px]">
            {processing ? "Memproses..." : paymentMethod === "qris" ? "Tampilkan QR" : "Bayar Sekarang"}
          </button>
          {cart.length > 0 && (
            <button
              onClick={holdOrder}
              disabled={processing}
              data-testid="pos-hold-btn"
              className="w-full border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-1.5 sm:py-2 rounded-md text-[10px] sm:text-xs uppercase tracking-widest hover:bg-[#F4C842]/10 transition-colors disabled:opacity-50"
            >
              Tahan Order
            </button>
          )}
        </div>
      </aside>
        </>
      )}

      {variantPick && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4" onClick={() => setVariantPick(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md w-full max-h-[80dvh] overflow-y-auto p-4 sm:p-6" data-testid="variant-picker">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#F4C842]">Pilih Varian</p>
                <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">{variantPick.name}</h3>
              </div>
              <button onClick={() => setVariantPick(null)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <div className="space-y-2">
              {variantPick.variants.map((v, i) => (
                <button key={i} onClick={() => { addToCart(variantPick, v); setVariantPick(null); }} disabled={v.stock <= 0} data-testid={`variant-${i}`} className="w-full bg-[#331419] gold-border rounded-md p-3 text-left card-hover hover:border-[#F4C842] disabled:opacity-40">
                  <p className="text-sm text-[#F5F5F5]">{v.name}</p>
                  <p className="text-[#F4C842] font-semibold text-sm mt-1">{formatIDR(resolveDisplayPrice(variantPick, v))}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {paketComposer && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4" onClick={() => setPaketComposer(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-lg w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-6" data-testid="paket-composer">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#F4C842] flex items-center gap-1"><PackageIcon size={12} /> Paket</p>
                <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">{paketComposer.product.name}</h3>
                <p className="text-sm text-[#F4C842] font-semibold mt-1">{formatIDR(paketComposer.product.price)}</p>
              </div>
              <button onClick={() => setPaketComposer(null)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <p className="text-xs text-[#C4A484] mb-3">Pilih item dimsum yang masuk ke dalam paket ini:</p>

            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C4A484]" strokeWidth={1.5} />
              <input value={paketSearch} onChange={(e) => setPaketSearch(e.target.value)} placeholder="Cari item..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md pl-10 pr-4 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#F4C842]" data-testid="paket-composer-search" />
            </div>

            <div className="max-h-[40dvh] overflow-y-auto space-y-2 pr-1 mb-4">
              {products
                .filter((p) => p.is_active && p.category_id !== paketCategoryId)
                .filter((p) => !paketSearch || p.name.toLowerCase().includes(paketSearch.toLowerCase()))
                .map((p) => {
                  const qty = paketComposer.selections[p.id] || 0;
                  return (
                    <div key={p.id} className="bg-[#331419] gold-border rounded-md p-2 flex items-center justify-between text-sm" data-testid={`paket-composer-item-${p.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#F5F5F5] truncate">{p.name}</p>
                        <p className="text-[10px] text-[#C4A484]">{formatIDR(p.price)} · Stok: {p.stock}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updatePaketSelection(p.id, -1)} className="w-8 h-8 rounded bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842] text-base">−</button>
                        <span className="text-[#F5F5F5] min-w-[20px] text-center">{qty}</span>
                        <button onClick={() => updatePaketSelection(p.id, 1)} className="w-8 h-8 rounded bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842] text-base">+</button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="border-t border-[rgba(244,200,66,0.15)] pt-3 mt-3 flex items-center justify-between">
              <span className="text-xs text-[#C4A484]">Total item: <span className="text-[#F4C842] font-semibold">{paketTotalItems}</span></span>
              <button onClick={addPaketToCart} disabled={paketTotalItems === 0} data-testid="paket-add-to-cart" className="bg-[#F4C842] text-[#1A0810] px-5 py-2 rounded-md text-xs font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors disabled:opacity-50">
                Tambah ke Keranjang
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && <BarcodeScanner onDetected={(code) => { setShowScanner(false); handleBarcodeInput(code); }} onClose={() => setShowScanner(false)} />}
      {showQRIS && (
        <QRISPayment
          amount={total}
          description={`POS - ${cart.length} item`}
          transaction={{
            outlet_id: selectedOutlet,
            price_type: salesChannel === "online" ? "online" : priceType,
            discount: Number(discount) || 0,
            tax: 0,
            items: cart.map((i) => ({
              product_id: i.product_id,
              variant_name: i.variant_name,
              quantity: i.quantity,
              note: i.note || "",
            })),
          }}
          onSuccess={onQRISSuccess}
          onClose={() => setShowQRIS(false)}
        />
      )}

      {receipt && (
        <>
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4 no-print" onClick={() => setReceipt(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-lg p-4 sm:p-6 lg:p-8 max-w-full sm:max-w-md w-full max-h-[92dvh] overflow-y-auto" data-testid="receipt-modal">
              <div className="text-center border-b border-dashed border-[rgba(244,200,66,0.2)] pb-3 sm:pb-4 mb-3 sm:mb-4">
                <h3 className="font-serif-luxury text-lg sm:text-2xl text-[#F4C842]">Republik Dimsum Imperium</h3>
                <p className="text-[10px] sm:text-xs text-[#C4A484] mt-1">Jl. Gadjah Mada No.15 Pakualaman, Yogyakarta</p>
                <p className="text-[10px] sm:text-xs text-[#C4A484]">{receipt.invoice_no}</p>
                <p className="text-[10px] sm:text-xs text-[#C4A484]">{new Date(receipt.created_at).toLocaleString("id-ID")}</p>
              </div>
              <div className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4">
                {receipt.items.map((i, idx) => <div key={idx} className="flex justify-between text-xs sm:text-sm gap-2"><span className="text-[#F5F5F5] truncate">{i.name} × {i.quantity}</span><span className="text-[#C4A484] whitespace-nowrap">{formatIDR(i.price * i.quantity)}</span></div>)}
              </div>
              <div className="border-t border-dashed border-[rgba(244,200,66,0.2)] pt-3 sm:pt-4 space-y-1">
                <div className="flex justify-between text-[10px] sm:text-xs text-[#C4A484]"><span>Subtotal</span><span>{formatIDR(receipt.subtotal)}</span></div>
                {receipt.discount > 0 && <div className="flex justify-between text-[10px] sm:text-xs text-[#C4A484]"><span>Diskon</span><span>- {formatIDR(receipt.discount)}</span></div>}
                <div className="flex justify-between text-base sm:text-lg text-[#F4C842] font-semibold pt-1.5 sm:pt-2"><span>TOTAL</span><span>{formatIDR(receipt.total)}</span></div>
                <div className="flex justify-between text-[10px] sm:text-xs text-[#C4A484]"><span>Bayar ({receipt.payment_method})</span><span>{formatIDR(receipt.amount_paid)}</span></div>
                <div className="flex justify-between text-[10px] sm:text-xs text-[#C4A484]"><span>Kembali</span><span>{formatIDR(receipt.change)}</span></div>
              </div>
              <div className="flex gap-2 mt-3 sm:mt-4">
                <button onClick={printReceipt} data-testid="print-receipt-btn" className="flex-1 border border-[#F4C842] text-[#F4C842] py-2 sm:py-2.5 rounded-md font-semibold uppercase text-[10px] sm:text-xs tracking-widest hover:bg-[#F4C842]/10 flex items-center justify-center gap-2 min-h-[40px]"><Printer size={14} /> Cetak</button>
                <button onClick={() => setReceipt(null)} data-testid="receipt-close-btn" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2 sm:py-2.5 rounded-md font-semibold uppercase text-[10px] sm:text-xs tracking-widest hover:bg-[#FFDD5C] min-h-[40px]">Tutup</button>
              </div>
            </div>
          </div>
          <Receipt sale={receipt} />
        </>
      )}

      {showShiftModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowShiftModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md w-full p-4 sm:p-6 mx-4 max-h-[90dvh] overflow-y-auto">
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

      {/* Held Orders modal */}
      {showHeldOrders && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4" onClick={() => setShowHeldOrders(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-lg w-full max-h-[80dvh] overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">Order Ditahan</h3>
              <button onClick={() => setShowHeldOrders(false)} className="text-[#C4A484] hover:text-[#F5F5F5]">✕</button>
            </div>
            {heldOrders.length === 0 ? (
              <p className="text-sm text-[#C4A484] italic text-center py-8">Tidak ada order ditahan</p>
            ) : (
              <div className="space-y-3">
                {heldOrders.map(h => (
                  <div key={h.id} className="bg-[#331419] gold-border rounded-md p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm text-[#F5F5F5]">{h.cart.length} item{h.customerName && ` · ${h.customerName}`}</p>
                        <p className="text-[10px] text-[#C4A484]">
                          {new Date(h.heldAt).toLocaleTimeString("id-ID")} · {formatIDR(h.cart.reduce((s, i) => s + i.price * i.quantity, 0) - (h.discount || 0))}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => resumeOrder(h.id)}
                          data-testid={`resume-held-${h.id}`}
                          className="bg-[#F4C842] text-[#1A0810] px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-widest hover:bg-[#FFDD5C]"
                        >
                          Lanjut
                        </button>
                        <button
                          onClick={() => discardHeldOrder(h.id)}
                          className="text-[#8B0000] px-2 py-1.5 text-xs uppercase tracking-widest hover:text-[#A00000]"
                        >
                          Buang
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-[#C4A484] truncate">
                      {h.cart.map(i => `${i.name} ×${i.quantity}`).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
