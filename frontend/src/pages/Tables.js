import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Plus, Users as UsersIcon, X, ShoppingBag, Trash2, Search, MapPin } from "lucide-react";
import { toast } from "sonner";

const emptyTable = { name: "", capacity: 2, zone: "Utama" };

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
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
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState("");

  const load = async () => {
    const [t, p, c] = await Promise.all([api.get("/tables"), api.get("/products"), api.get("/customers")]);
    setTables(t.data); setProducts(p.data); setCustomers(c.data);
  };
  useEffect(() => { load(); }, []);

  const saveTable = async (e) => {
    e.preventDefault();
    try {
      await api.post("/tables", { ...form, capacity: Number(form.capacity) });
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
      const { data } = await api.get(`/orders?status=open`);
      const order = data.find(o => o.id === table.active_order_id);
      if (order) {
        setActiveOrder(order);
        setOrderItems(order.items);
        setGuests(order.guest_count);
        setOpenTable(table);
      }
    } else {
      setActiveOrder(null);
      setOrderItems([]);
      setGuests(1);
      setOpenTable(table);
    }
  };

  const addItem = (p) => {
    if (p.stock <= 0) return toast.error("Stok habis");
    setOrderItems(prev => {
      const ex = prev.find(i => i.product_id === p.id);
      if (ex) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, name: p.name, price: p.price, quantity: 1 }];
    });
  };
  const changeQty = (pid, d) => setOrderItems(prev => prev.map(i => i.product_id === pid ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter(i => i.quantity > 0));

  const saveOrder = async () => {
    if (orderItems.length === 0) return toast.error("Tambahkan minimal 1 item");
    try {
      if (activeOrder) {
        await api.put(`/orders/${activeOrder.id}/items`, { items: orderItems });
        toast.success("Order diperbarui");
      } else {
        await api.post("/orders", { table_id: openTable.id, guest_count: Number(guests), items: orderItems });
        toast.success("Order dibuka");
      }
      setOpenTable(null); setActiveOrder(null); setOrderItems([]); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
  };

  const doCheckout = async () => {
    const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0) - Number(discount || 0);
    if (payMethod === "cash" && Number(amountPaid) < total) return toast.error("Uang bayar kurang");
    try {
      // Save items first (in case edited)
      if (activeOrder) {
        await api.put(`/orders/${activeOrder.id}/items`, { items: orderItems });
      } else {
        // Open then checkout
        const { data } = await api.post("/orders", { table_id: openTable.id, guest_count: Number(guests), items: orderItems });
        setActiveOrder(data);
      }
      const oid = activeOrder?.id || (await api.get("/orders?status=open")).data.find(o => o.table_id === openTable.id)?.id;
      const { data } = await api.post(`/orders/${oid}/checkout`, {
        payment_method: payMethod,
        amount_paid: payMethod === "cash" ? Number(amountPaid) : total,
        discount: Number(discount) || 0,
        tax: 0,
        customer_id: customerId,
      });
      toast.success(`Selesai: ${data.invoice_no}`);
      setShowCheckout(false); setOpenTable(null); setActiveOrder(null); setOrderItems([]);
      setAmountPaid(""); setDiscount(0); setPayMethod("cash"); setCustomerId("");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal"); }
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
      <PageHeader title="Manajemen Meja" subtitle="Peta meja & alur dine-in untuk mode restoran / cafe" actions={
        <button onClick={() => setShowForm(true)} data-testid="add-table-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
          <Plus size={16} /> Tambah Meja
        </button>
      } />
      <div className="p-8 space-y-8">
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
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                  <button onClick={(e) => { e.stopPropagation(); deleteTable(t.id, t.name); }} className="absolute top-2 right-2 text-[#C4A484] hover:text-[#8B0000] opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
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
          <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-6xl mx-auto my-6">
            {/* Left: product picker */}
            <div className="flex-1 bg-[#2A1015] gold-border rounded-l-lg p-6 overflow-y-auto">
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
                  <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} className="w-32 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5]" />
                </div>
              )}
              <div className="mb-4 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C4A484]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari menu..." className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md pl-9 pr-3 py-2 text-sm text-[#F5F5F5]" data-testid="dinein-search" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => addItem(p)} disabled={p.stock <= 0} data-testid={`dinein-product-${p.id}`} className="bg-[#331419] gold-border rounded-md p-3 text-left card-hover disabled:opacity-40">
                    <p className="text-sm text-[#F5F5F5] truncate">{p.name}</p>
                    <p className="text-[10px] text-[#C4A484]">Stok: {p.stock}</p>
                    <p className="text-[#F4C842] font-semibold text-sm mt-1">{formatIDR(p.price)}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Right: order cart */}
            <div className="w-96 bg-[#1A0810] gold-border rounded-r-lg p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag size={18} strokeWidth={1.5} className="text-[#F4C842]" />
                <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Order</h3>
                <span className="ml-auto text-xs text-[#C4A484]">{orderItems.length} item</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {orderItems.length === 0 ? <p className="text-xs text-[#C4A484] italic text-center py-8">Belum ada item</p> : orderItems.map(i => (
                  <div key={i.product_id} className="bg-[#331419] rounded-md p-2 flex items-center justify-between text-sm">
                    <div className="flex-1">
                      <p className="text-[#F5F5F5]">{i.name}</p>
                      <p className="text-xs text-[#C4A484]">{formatIDR(i.price)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(i.product_id, -1)} className="w-6 h-6 rounded bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]">−</button>
                      <span className="text-[#F5F5F5] min-w-[20px] text-center">{i.quantity}</span>
                      <button onClick={() => changeQty(i.product_id, 1)} className="w-6 h-6 rounded bg-[#2A1015] border border-[rgba(244,200,66,0.2)] text-[#F4C842]">+</button>
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
          <div className="bg-[#2A1015] gold-border rounded-lg max-w-md w-full p-6">
            <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mb-4">Bayar - Meja {openTable.name}</h3>
            <div className="space-y-3">
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]">
                <option value="">Pelanggan (opsional)</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}
