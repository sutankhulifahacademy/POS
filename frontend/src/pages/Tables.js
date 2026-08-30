import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, Users as UsersIcon, X, ShoppingBag, Trash2, Search, MapPin, Package } from "lucide-react";
import { toast } from "sonner";
import { useOutlet } from "../context/OutletContext";

const emptyTable = { name: "", capacity: 2, zone: "Utama" };

export default function Tables({ embedded = false }) {
  const { outletIdForApi } = useOutlet();
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyTable);
  const [openTable, setOpenTable] = useState(null); // Table to open order for
  const [orderItems, setOrderItems] = useState([]);
  const [guests, setGuests] = useState(1);
  const [activeOrder, setActiveOrder] = useState(null); // Loaded order for editing
  const [search, setSearch] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [cardType, setCardType] = useState("debit");
  const [cardBrand, setCardBrand] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardReferenceNo, setCardReferenceNo] = useState("");
  const [cardApprovalCode, setCardApprovalCode] = useState("");
  const [cardTerminalId, setCardTerminalId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [transferBank, setTransferBank] = useState("");
  const [transferAccountName, setTransferAccountName] = useState("");
  const [transferAccountNo, setTransferAccountNo] = useState("");
  const [transferReferenceNo, setTransferReferenceNo] = useState("");
  const [transferSenderName, setTransferSenderName] = useState("");
  const [transferVerified, setTransferVerified] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [cardBrands, setCardBrands] = useState([]);
  const [cardBrandOther, setCardBrandOther] = useState("");
  const [paketComposer, setPaketComposer] = useState(null);

  const load = async () => {
    const oParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
    const [t, p, cat, c, pa, cb] = await Promise.all([
      api.get(`/tables${oParam}`),
      api.get(`/products${oParam}`),
      api.get("/categories"),
      api.get("/customers"),
      api.get(`/payment-accounts${oParam}`),
      api.get("/card-brands"),
    ]);
    setTables(t.data); setProducts(p.data); setCategories(cat.data || []); setCustomers(c.data);
    setPaymentAccounts(pa.data || []);
    setCardBrands(cb.data || []);
  };
  useEffect(() => { load(); }, [outletIdForApi]);

  const saveTable = async (e) => {
    e.preventDefault();
    try {
      await api.post("/tables", { ...form, capacity: Number(form.capacity), outlet_id: outletIdForApi || undefined });
      toast.success("Meja ditambahkan");
      setShowForm(false); setForm(emptyTable); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const deleteTable = async (id, name) => {
    if (!window.confirm(`Hapus meja ${name}?`)) return;
    try { await api.delete(`/tables/${id}`); toast.success("Meja dihapus"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const beginOrder = async (table) => {
    if (table.active_order_id) {
      try {
        const { data } = await api.get(`/orders?status=open${outletIdForApi ? `&outlet_id=${outletIdForApi}` : ""}`);
        const order = data.find(o => o.id === table.active_order_id);
        if (order) {
          setActiveOrder(order);
          // Normalize items: pastikan field quantity (bukan qty), variant_name, note
          const items = (order.items || []).map(i => ({
            product_id: String(i.product_id),
            name: String(i.name || ""),
            price: Number(i.price) || 0,
            quantity: Number(i.quantity ?? i.qty ?? 1),
            variant_name: String(i.variant_name || ""),
            note: String(i.note || ""),
            paket_items: i.paket_items || null
          }));
          setOrderItems(items);
          setGuests(order.guest_count || 1);
          setOpenTable(table);
          return;
        }
      } catch (err) {
        console.error("beginOrder error:", err);
      }
    }
    // Tidak ada order aktif atau gagal load → buka order baru
    setActiveOrder(null);
    setOrderItems([]);
    setGuests(1);
    setOpenTable(table);
  };

  const paketCategoryId = categories.find(c => c.name === "Paket")?.id;
  const isPaketProduct = (p) => p.category_id === paketCategoryId;

  const handleProductClick = (product) => {
    if (isPaketProduct(product)) {
      setPaketComposer({ product, selections: {} });
    } else {
      addItem(product);
    }
  };

  const updatePaketSelection = (productId, delta) =>
    setPaketComposer(prev => ({
      ...prev,
      selections: {
        ...prev.selections,
        [productId]: Math.max(0, (prev.selections[productId] || 0) + delta)
      }
    }));

  const paketTotalItems = paketComposer ? Object.values(paketComposer.selections).reduce((a, b) => a + b, 0) : 0;

  const addPaketToOrder = () => {
    const items = Object.entries(paketComposer.selections)
      .filter(([_, qty]) => qty > 0)
      .map(([pid, qty]) => {
        const p = products.find(x => String(x.id) === String(pid));
        return { product_id: String(pid), name: p?.name || "", price: p?.price || 0, quantity: qty };
      });
    if (items.length === 0) {
      return toast.error("Pilih minimal 1 item untuk paket");
    }
    const product = paketComposer.product;
    setOrderItems(prev => {
      const ex = prev.find(i => i.product_id === String(product.id));
      if (ex) {
        return prev.map(i => i.product_id === String(product.id)
          ? { ...i, quantity: i.quantity + 1, paket_items: items }
          : i);
      }
      return [
        ...prev,
        {
          product_id: String(product.id),
          name: product.name,
          price: Number(product.price),
          quantity: 1,
          variant_name: "",
          note: "",
          paket_items: items
        }
      ];
    });
    setPaketComposer(null);
  };

  const addItem = (p) => {
    if (p.stock <= 0) return toast.error("Stok habis");
    setOrderItems(prev => {
      const ex = prev.find(i => i.product_id === p.id);
      if (ex) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [
        ...prev,
        {
          product_id: String(p.id),
          name: p.name,
          price: Number(p.price),
          quantity: 1,
          variant_name: "",
          note: ""
        }
      ];
    });
  };
  const changeQty = (pid, d) => setOrderItems(prev => prev.map(i => i.product_id === pid ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter(i => i.quantity > 0));

  const saveOrder = async () => {
    if (orderItems.length === 0) {
      return toast.error("Tambahkan minimal 1 item");
    }

    const payloadItems = orderItems.map(i => ({
      product_id: String(i.product_id),
      name: String(i.name || ""),
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 0,
      variant_name: String(i.variant_name || ""),
      note: String(i.note || ""),
      paket_items: i.paket_items || null
    }));

    try {
      if (activeOrder) {
        await api.put(`/orders/${activeOrder.id}/items`, { items: payloadItems });
        toast.success("Order diperbarui");
      } else {
        // Cek apakah meja sudah punya order terbuka
        try {
          const { data: newOrder } = await api.post("/orders", {
            table_id: openTable.id,
            guest_count: Number(guests),
            items: payloadItems,
            outlet_id: outletIdForApi || undefined
          });
          setActiveOrder(newOrder);
          toast.success("Order dibuka");
        } catch (err) {
          if (err.response?.status === 400 && err.response?.data?.detail?.includes("order terbuka")) {
            // Meja sudah punya order → cari & update items
            const { data: openOrders } = await api.get(`/orders?status=open${outletIdForApi ? `&outlet_id=${outletIdForApi}` : ""}`);
            const existing = openOrders.find(o => o.table_id === openTable.id);
            if (existing) {
              await api.put(`/orders/${existing.id}/items`, { items: payloadItems });
              setActiveOrder(existing);
              toast.success("Order diperbarui");
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      setOpenTable(null);
      setActiveOrder(null);
      setOrderItems([]);
      load();

    } catch (err) {
      const detail = err.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map(x => x.msg || "Data tidak valid").join(", ")
            : "Gagal menyimpan order";
      toast.error(message);
    }
  };

  const doCheckout = async () => {
    const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0) - Number(discount || 0);

    // Resolve card brand: if "Lainnya", save new brand to backend
    let finalCardBrand = cardBrand;
    if (payMethod === "card" && cardBrand === "__other__") {
      if (!cardBrandOther.trim()) {
        return toast.error("Ketik nama bank/brand");
      }
      finalCardBrand = cardBrandOther.trim();
      try {
        await api.post("/card-brands", { name: finalCardBrand });
        setCardBrands(prev => prev.find(b => b.name === finalCardBrand) ? prev : [...prev, { id: "temp", name: finalCardBrand, is_active: true }]);
      } catch (e) { /* ignore */ }
    }

   if (payMethod === "card") {
      if (!cardType) {
        return toast.error("Pilih jenis kartu");
      }

      if (!finalCardBrand) {
        return toast.error("Isi bank / brand kartu");
      }

      if (!/^\d{4}$/.test(cardLast4)) {
        return toast.error("4 digit terakhir kartu harus diisi");
      }

      if (!cardReferenceNo.trim()) {
        return toast.error("No. referensi kartu wajib diisi");
      }
    }
    if (payMethod === "transfer") {
      if (!transferBank.trim()) {
        return toast.error("Bank tujuan wajib dipilih");
      }
      if (!transferReferenceNo.trim()) {
        return toast.error("No. referensi transfer wajib diisi");
      }
      if (!transferSenderName.trim()) {
        return toast.error("Nama pengirim wajib diisi");
      }
      if (!transferVerified) {
        return toast.error("Transfer harus diverifikasi terlebih dahulu");
      }
    }
    try {
      // Save items first (in case edited)
      let oid;
      const checkoutItems = orderItems.map(i => ({
        product_id: String(i.product_id),
        name: String(i.name || ""),
        price: Number(i.price) || 0,
        quantity: Number(i.quantity) || 0,
        variant_name: String(i.variant_name || ""),
        note: String(i.note || ""),
        paket_items: i.paket_items || null
      }));
      if (activeOrder) {
        await api.put(`/orders/${activeOrder.id}/items`, { items: checkoutItems });
        oid = activeOrder.id;
      } else {
        // Cek apakah meja sudah punya order terbuka
        const { data: openOrders } = await api.get(`/orders?status=open${outletIdForApi ? `&outlet_id=${outletIdForApi}` : ""}`);
        const existing = openOrders.find(o => o.table_id === openTable.id);
        if (existing) {
          // Order sudah ada → update items saja
          await api.put(`/orders/${existing.id}/items`, { items: checkoutItems });
          oid = existing.id;
          setActiveOrder(existing);
        } else {
          // Buka order baru
          const { data } = await api.post("/orders", { table_id: openTable.id, guest_count: Number(guests), items: checkoutItems, outlet_id: outletIdForApi || undefined });
          oid = data.id;
          setActiveOrder(data);
        }
      }
      const { data } = await api.post(`/orders/${oid}/checkout`, {
        payment_method: payMethod,
        amount_paid: payMethod === "cash" ? Number(amountPaid) : total,
        discount: Number(discount) || 0,
        tax: 0,
        customer_id: customerId,

        card_type: payMethod === "card" ? cardType : "",
        card_brand: payMethod === "card" ? finalCardBrand : "",
        card_last4: payMethod === "card" ? cardLast4 : "",
        card_reference_no: payMethod === "card" ? cardReferenceNo : "",
        card_approval_code: payMethod === "card" ? cardApprovalCode : "",
        card_terminal_id: payMethod === "card" ? cardTerminalId : "",

        transfer_bank: payMethod === "transfer" ? transferBank : "",
        transfer_account_name: payMethod === "transfer" ? transferAccountName : "",
        transfer_account_no: payMethod === "transfer" ? transferAccountNo : "",
        transfer_reference_no: payMethod === "transfer" ? transferReferenceNo : "",
        transfer_sender_name: payMethod === "transfer" ? transferSenderName : "",
        transfer_verified: payMethod === "transfer" ? transferVerified : false,
      });
      toast.success(`Selesai: ${data.invoice_no}`);
      setShowCheckout(false); setOpenTable(null); setActiveOrder(null); setOrderItems([]);
      setAmountPaid("");
      setDiscount(0);
      setPayMethod("cash");
      setCustomerId("");

      setCardType("");
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
      load();
    } catch (err) {
      const detail = err.response?.data?.detail;

      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((x) => x.msg || "Data tidak valid").join(", ")
            : "Gagal menyimpan order";

      console.error("UPDATE ORDER ERROR:", err.response?.data);
      console.error("ORDER ITEMS:", orderItems);

      toast.error(message);
    }
  };

  const cancelOrder = async () => {
    if (!activeOrder) { setOpenTable(null); return; }
    if (!window.confirm("Batalkan order ini?")) return;
    try { await api.delete(`/orders/${activeOrder.id}`); toast.success("Order dibatalkan"); setOpenTable(null); setActiveOrder(null); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const filteredProducts = products.filter(p => p.is_active && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
  const orderTotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const zones = [...new Set(tables.map(t => t.zone || "Utama"))];

  return (
    <div>
      {!embedded && (
        <PageHeader title="Manajemen Meja" subtitle="Peta meja & alur dine-in untuk mode restoran / cafe" actions={
          <button onClick={() => setShowForm(true)} data-testid="add-table-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
            <Plus size={16} /> Tambah Meja
          </button>
        } />
      )}
      <div className={embedded ? "space-y-8" : "p-4 md:p-6 lg:p-8 space-y-8"}>
        {tables.length === 0 && (
          <div className="bg-[#331419] gold-border rounded-lg p-12 text-center">
            <MapPin size={40} strokeWidth={1.2} className="mx-auto mb-3 text-[#F4C842] opacity-40" />
            <p className="text-[#C4A484]">Belum ada meja. Mulai dengan menambahkan meja pertama Anda.</p>
          </div>
        )}
        {zones.map(zone => (
          <div key={zone}>
            <h2 className="font-serif-luxury text-2xl text-[#F5F5F5] mb-4 flex items-center gap-2">
              <MapPin size={18} strokeWidth={1.5} className="text-[#F4C842]" /> Zona {zone}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {tables.filter(t => (t.zone || "Utama") === zone).map(t => (
                <div
                  key={t.id}
                  onClick={() => beginOrder(t)}
                  data-testid={`table-${t.id}`}
                  className={`relative cursor-pointer rounded-lg p-5 card-hover ${
                    t.status === "occupied"
                      ? "bg-[#F4C842]/10 border border-[#F4C842] gold-glow"
                      : "bg-[#331419] gold-border hover:border-[#F4C842]"
                  }`}
                >
                  <button onClick={(e) => { e.stopPropagation(); deleteTable(t.id, t.name); }} className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-[#C4A484] hover:text-[#8B0000] opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                  <p className="font-serif-luxury text-2xl text-[#F5F5F5]">{t.name}</p>
                  <p className="text-xs text-[#C4A484] mt-1 flex items-center gap-1"><UsersIcon size={11} /> {t.capacity} orang</p>
                  <div className={`mt-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded inline-block ${
                    t.status === "occupied" ? "bg-[#F4C842] text-[#1A0810]" : "bg-[#2E8B57]/20 text-[#2E8B57]"
                  }`}>
                    {t.status === "occupied" ? "TERISI" : "KOSONG"}
                  </div>
                  {t.active_order_total > 0 && (
                    <p className="text-xs text-[#F4C842] mt-2 font-semibold">{formatIDR(t.active_order_total)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add table form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">Tambah Meja</h2>
              <button onClick={() => setShowForm(false)} className="text-[#C4A484]"><X size={20} /></button>
            </div>
            <form onSubmit={saveTable} className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Nama</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" data-testid="table-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Kapasitas</label>
                  <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Zona</label>
                  <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" placeholder="Utama / VIP / Outdoor" />
                </div>
              </div>
              <div className="flex gap-2 pt-3">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2 rounded-md text-xs uppercase tracking-widest">Batal</button>
                <button type="submit" data-testid="table-submit" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2 rounded-md text-xs font-semibold uppercase tracking-widest">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dine-in Order UI */}
      {openTable && (
        <div className="fixed inset-0 bg-black/90 z-40 flex" onClick={() => { if (!activeOrder) setOpenTable(null); }}>
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col lg:flex-row w-full max-w-6xl mx-auto my-6">
            {/* Left: product picker */}
            <div className="flex-1 bg-[#2A1015] gold-border rounded-l-lg p-6 overflow-y-auto max-h-[50vh] lg:max-h-[80vh]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#F4C842]">Meja {openTable.name}</p>
                  <h2 className="font-serif-luxury text-3xl text-[#F5F5F5]">{activeOrder ? "Edit Order" : "Buka Order Baru"}</h2>
                </div>
                <button onClick={() => { setOpenTable(null); setActiveOrder(null); setOrderItems([]); }} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={22} /></button>
              </div>
              {!activeOrder && (
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Jumlah Tamu</label>
                  <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} className="w-24 sm:w-32 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
              )}
              <div className="mb-4 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C4A484]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari menu..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md pl-9 pr-3 py-2 text-sm text-[#F5F5F5]" data-testid="dinein-search" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => handleProductClick(p)} disabled={p.stock <= 0} data-testid={`dinein-product-${p.id}`} className="bg-[#331419] gold-border rounded-md p-3 text-left card-hover disabled:opacity-40">
                    {isPaketProduct(p) && (
                      <span className="inline-flex items-center gap-1 mb-1 text-[9px] uppercase tracking-widest bg-[#F4C842] text-[#1A0810] px-1.5 py-0.5 rounded font-semibold">
                        <Package size={9} /> Paket
                      </span>
                    )}
                    <p className="text-sm text-[#F5F5F5] truncate">{p.name}</p>
                    <p className="text-[10px] text-[#C4A484]">Stok: {p.stock}</p>
                    <p className="text-[#F4C842] font-semibold text-sm mt-1">{formatIDR(p.price)}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Right: order cart */}
            <div className="w-full lg:w-96 bg-[#1A0810] gold-border rounded-r-lg p-6 flex flex-col overflow-y-auto max-h-[50vh] lg:max-h-[80vh]">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag size={18} strokeWidth={1.5} className="text-[#F4C842]" />
                <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Order</h3>
                <span className="ml-auto text-xs text-[#C4A484]">{orderItems.length} item</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {orderItems.length === 0 ? <p className="text-xs text-[#C4A484] italic text-center py-8">Belum ada item</p> : orderItems.map(i => (
                  <div key={i.product_id} className="bg-[#331419] rounded-md p-2 flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-[#F5F5F5] truncate">{i.name}</p>
                      <p className="text-xs text-[#C4A484]">{formatIDR(i.price)}</p>
                      {i.paket_items && i.paket_items.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {i.paket_items.map((pi, idx) => (
                            <li key={idx} className="text-[10px] text-[#C4A484] flex items-center gap-1">
                              <span className="text-[#F4C842]">×{pi.quantity}</span>
                              <span className="truncate">{pi.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(i.product_id, -1)} className="w-9 h-9 rounded bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842] text-base">−</button>
                      <span className="text-[#F5F5F5] min-w-[20px] text-center">{i.quantity}</span>
                      <button onClick={() => changeQty(i.product_id, 1)} className="w-9 h-9 rounded bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842] text-base">+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[rgba(244,200,66,0.15)] pt-3 space-y-1 mb-3">
                <div className="flex justify-between text-lg text-[#F5F5F5]">
                  <span className="font-serif-luxury">Total</span>
                  <span className="text-[#F4C842] font-serif-luxury">{formatIDR(orderTotal)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <button onClick={saveOrder} data-testid="save-order-btn" className="w-full border border-[#F4C842] text-[#F4C842] py-2.5 rounded-md text-xs uppercase tracking-widest font-semibold hover:bg-[#F4C842]/10 transition-colors">
                  {activeOrder ? "Update Order" : "Simpan (Belum Bayar)"}
                </button>
                <button onClick={() => setShowCheckout(true)} disabled={orderItems.length === 0} data-testid="dinein-checkout-btn" className="w-full bg-[#F4C842] text-[#1A0810] py-3 rounded-md text-sm uppercase tracking-widest font-semibold hover:bg-[#FFDD5C] transition-colors disabled:opacity-50">
                  Bayar Sekarang
                </button>
                {activeOrder && (
                  <button onClick={cancelOrder} data-testid="cancel-order-btn" className="w-full text-[#8B0000] py-1 text-xs uppercase tracking-widest hover:text-[#A00000]">Batalkan Order</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout modal */}
      {showCheckout && openTable && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md mx-4 w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mb-4">Bayar - Meja {openTable.name}</h3>
            <div className="space-y-3">
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]">
                <option value="">Pelanggan (opsional)</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Metode</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="dinein-payment">
                    <option value="cash">Tunai</option><option value="card">Kartu</option><option value="qris">QRIS</option><option value="transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Diskon</label>
                  <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
                </div>
              </div>
              {payMethod === "cash" && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">Uang Bayar</label>
                  <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" data-testid="dinein-amount" />
                </div>
              )}
              {payMethod === "card" && (
                <div className="space-y-3 border border-[rgba(244,200,66,0.2)] rounded-md p-4 bg-[#331419]">

                  <div className="text-xs uppercase tracking-widest text-[#F4C842]">
                    Detail Pembayaran Kartu
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                        Jenis Kartu
                      </label>

                      <select
                        value={cardType}
                        onChange={(e) => setCardType(e.target.value)}
                        className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                      >
                        <option value="">Pilih</option>
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

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                      4 Digit Terakhir Kartu
                    </label>

                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={cardLast4}
                      onChange={(e) =>
                        setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="Contoh: 1234"
                      className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                      No. Referensi
                    </label>

                    <input
                      type="text"
                      value={cardReferenceNo}
                      onChange={(e) => setCardReferenceNo(e.target.value)}
                      placeholder="Nomor referensi transaksi EDC"
                      className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                        Approval Code
                      </label>

                      <input
                        type="text"
                        value={cardApprovalCode}
                        onChange={(e) => setCardApprovalCode(e.target.value)}
                        placeholder="Approval"
                        className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-[#C4A484]">
                        Terminal ID
                      </label>

                      <input
                        type="text"
                        value={cardTerminalId}
                        onChange={(e) => setCardTerminalId(e.target.value)}
                        placeholder="ID EDC"
                        className="mt-1 w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]"
                      />
                    </div>

                  </div>

                </div>
              )}
              {payMethod === "transfer" && (
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
                      data-testid="dinein-transfer-bank"
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
                      data-testid="dinein-transfer-account-name"
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
                      data-testid="dinein-transfer-account-no"
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
                      data-testid="dinein-transfer-reference"
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
                      data-testid="dinein-transfer-sender"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[#C4A484] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={transferVerified}
                      onChange={(e) => setTransferVerified(e.target.checked)}
                      data-testid="dinein-transfer-verified"
                    />
                    <span>Transfer sudah diverifikasi</span>
                  </label>
                </div>
              )}
              <div className="border-t border-dashed border-[rgba(244,200,66,0.2)] pt-3 flex justify-between text-lg">
                <span className="text-[#C4A484]">Total</span>
                <span className="text-[#F4C842] font-serif-luxury">{formatIDR(orderTotal - Number(discount || 0))}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCheckout(false)} className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-xs uppercase tracking-widest">Batal</button>
                <button onClick={doCheckout} data-testid="dinein-confirm-checkout" className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-xs font-semibold uppercase tracking-widest">Konfirmasi</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paket composer modal */}
      {paketComposer && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4" onClick={() => setPaketComposer(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-lg mx-4 w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#F4C842] flex items-center gap-1"><Package size={12} /> Paket</p>
                <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">{paketComposer.product.name}</h3>
                <p className="text-sm text-[#F4C842] font-semibold mt-1">{formatIDR(paketComposer.product.price)}</p>
              </div>
              <button onClick={() => setPaketComposer(null)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X size={20} /></button>
            </div>
            <p className="text-xs text-[#C4A484] mb-3">Pilih item dimsum yang masuk ke dalam paket ini:</p>
            <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
              {products.filter(p => p.is_active && !isPaketProduct(p)).map(p => {
                const qty = paketComposer.selections[p.id] || 0;
                return (
                  <div key={p.id} className="bg-[#331419] gold-border rounded-md p-2 flex items-center justify-between text-sm">
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
              {products.filter(p => p.is_active && !isPaketProduct(p)).length === 0 && (
                <p className="text-xs text-[#C4A484] italic text-center py-6">Tidak ada produk tersedia</p>
              )}
            </div>
            <div className="border-t border-[rgba(244,200,66,0.15)] pt-3 mt-3 flex items-center justify-between">
              <span className="text-xs text-[#C4A484]">Total item: <span className="text-[#F4C842] font-semibold">{paketTotalItems}</span></span>
              <button onClick={addPaketToOrder} disabled={paketTotalItems === 0} data-testid="add-paket-to-order" className="bg-[#F4C842] text-[#1A0810] px-5 py-2 rounded-md text-xs font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors disabled:opacity-50">
                Tambah ke Pesanan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
