import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Plus, Trash, X, ShoppingCart, TrendingUp, AlertTriangle, CheckCircle, Calculator } from "lucide-react";
import { toast } from "sonner";

export default function OnlineOrders() {
  const { outlets, outletIdForApi, allAccess } = useOutlet();
  const [platforms, setPlatforms] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showBreakEven, setShowBreakEven] = useState(false);
  const [form, setForm] = useState({
    platform_id: "",
    outlet_id: outletIdForApi || "",
    customer_name: "",
    platform_order_ref: "",
    note: "",
    items: [],
  });
  const [breakEvenForm, setBreakEvenForm] = useState({ platform_id: "", outlet_id: outletIdForApi || "", cogs: 0, target_profit: 0 });
  const [breakEvenResult, setBreakEvenResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, oRes] = await Promise.all([
        api.get("/online-platforms"),
        api.get(`/online-orders?limit=50${outletIdForApi ? `&outlet_id=${outletIdForApi}` : ""}`),
      ]);
      setPlatforms(pRes.data);
      setOrders(oRes.data);
      if (pRes.data.length > 0 && !form.platform_id) {
        setForm(f => ({ ...f, platform_id: pRes.data[0].id }));
      }
    } catch (e) {
      toast.error("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi]);

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.get("/products");
      setProducts(res.data);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { product_id: "", product_name: "", variant_name: "", online_price: 0, cost: 0, quantity: 1 }] });
  };

  const updateItem = (i, field, value) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: value };
    // Auto-fill from product
    if (field === "product_id") {
      const p = products.find(p => p.id === value);
      if (p) {
        items[i].product_name = p.name;
        items[i].online_price = p.online_price || p.price || 0;
        items[i].cost = p.cost || 0;
      }
    }
    setForm({ ...form, items });
  };

  const removeItem = (i) => {
    setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  };

  const totalGross = form.items.reduce((s, i) => s + (Number(i.online_price) * Number(i.quantity)), 0);
  const totalCogs = form.items.reduce((s, i) => s + (Number(i.cost) * Number(i.quantity)), 0);

  const save = async (e) => {
    e.preventDefault();
    if (!form.platform_id) { toast.error("Pilih platform"); return; }
    if (form.items.length === 0) { toast.error("Tambahkan minimal 1 item"); return; }
    try {
      await api.post("/online-orders", form);
      toast.success("Online order dibuat");
      setShowForm(false);
      setForm({ platform_id: platforms[0]?.id || "", outlet_id: outletIdForApi || "", customer_name: "", platform_order_ref: "", note: "", items: [] });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membuat order");
    }
  };

  const reconcile = async (orderId, actual) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      await api.put(`/online-orders/${orderId}/reconcile`, { actual_settlement: actual, settlement_date: today });
      toast.success("Settlement direkonsiliasi");
      setShowDetail(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal rekonsiliasi");
    }
  };

  const calcBreakEven = async () => {
    try {
      const res = await api.post("/online-orders/break-even", breakEvenForm);
      setBreakEvenResult(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menghitung");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Online Orders" subtitle="Transaksi penjualan online + profit analysis" icon={ShoppingCart} />

      <div className="flex gap-2 mb-4">
        <button onClick={() => { setForm({ platform_id: platforms[0]?.id || "", outlet_id: outletIdForApi || "", customer_name: "", platform_order_ref: "", note: "", items: [] }); setShowForm(true); }} className="flex items-center gap-2 bg-[#F4C842] text-[#1A0A0F] px-4 py-2 rounded-md text-sm font-semibold hover:bg-[#E6B830]">
          <Plus size={16} /> New Online Order
        </button>
        <button onClick={() => { setBreakEvenForm({ platform_id: platforms[0]?.id || "", outlet_id: outletIdForApi || "", cogs: 0, target_profit: 0 }); setBreakEvenResult(null); setShowBreakEven(true); }} className="flex items-center gap-2 border border-[rgba(244,200,66,0.3)] text-[#F4C842] px-4 py-2 rounded-md text-sm">
          <Calculator size={16} /> Break-Even Calculator
        </button>
      </div>

      {/* Orders list */}
      <div className="space-y-2">
        {orders.length === 0 && <p className="text-[#C4A484] italic">Belum ada online order.</p>}
        {orders.map(o => (
          <div key={o.id} className="bg-[#2A1015] border border-[rgba(244,200,66,0.15)] rounded-lg p-4 cursor-pointer hover:border-[rgba(244,200,66,0.3)]" onClick={() => setShowDetail(o)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: o.platform_color || "#00B14F" }} />
                <div>
                  <p className="text-sm text-[#F5F5F5]">{o.order_no} — {o.platform_name}</p>
                  <p className="text-xs text-[#C4A484]">{o.outlet_name || "No Outlet"} • {new Date(o.created_at).toLocaleString("id-ID")}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#F5F5F5]">{formatIDR(o.gross_sales)}</p>
                <p className={`text-xs ${o.gross_profit >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"}`}>Profit: {formatIDR(o.gross_profit)} ({o.profit_margin}%)</p>
              </div>
              <div className="ml-4">
                {o.settlement_status === "matched" && <span className="text-xs text-[#F4C842] flex items-center gap-1"><CheckCircle size={12} /> Matched</span>}
                {o.settlement_status === "variance" && <span className="text-xs text-[#8B0000] flex items-center gap-1"><AlertTriangle size={12} /> Variance: {formatIDR(o.settlement_variance)}</span>}
                {o.settlement_status === "pending" && <span className="text-xs text-[#C4A484]">Pending</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Order Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="bg-[#1A0A0F] gold-border rounded-lg max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">New Online Order</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Platform</label>
                <select value={form.platform_id} onChange={(e) => setForm({ ...form, platform_id: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" required>
                  {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Outlet</label>
                <select value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]">
                  <option value="">No Outlet</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Customer Name</label>
                <input type="text" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Platform Order Ref</label>
                <input type="text" value={form.platform_order_ref} onChange={(e) => setForm({ ...form, platform_order_ref: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
            </div>

            {/* Items */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs uppercase tracking-widest text-[#C4A484]">Items</label>
                <button type="button" onClick={addItem} className="text-xs text-[#F4C842] flex items-center gap-1"><Plus size={12} /> Add Item</button>
              </div>
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
                  <select value={item.product_id} onChange={(e) => updateItem(i, "product_id", e.target.value)} className="col-span-4 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-xs text-[#F5F5F5]">
                    <option value="">Select Product</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" placeholder="Online Price" value={item.online_price} onChange={(e) => updateItem(i, "online_price", e.target.value)} className="col-span-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-xs text-[#F5F5F5]" />
                  <input type="number" placeholder="Cost" value={item.cost} onChange={(e) => updateItem(i, "cost", e.target.value)} className="col-span-2 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-xs text-[#F5F5F5]" />
                  <input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className="col-span-1 bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-2 py-2 text-xs text-[#F5F5F5]" />
                  <span className="col-span-2 text-xs text-[#F4C842]">{formatIDR(Number(item.online_price) * Number(item.quantity))}</span>
                  <button type="button" onClick={() => removeItem(i)} className="col-span-1 text-[#C4A484] hover:text-[#8B0000]"><Trash size={14} /></button>
                </div>
              ))}
              {form.items.length === 0 && <p className="text-xs text-[#C4A484] italic">Klik "Add Item" untuk menambah produk.</p>}
            </div>

            <div className="bg-[#2A1015] rounded-md p-3 mb-4 text-sm">
              <div className="flex justify-between"><span className="text-[#C4A484]">Total Gross Sales:</span><span className="text-[#F5F5F5]">{formatIDR(totalGross)}</span></div>
              <div className="flex justify-between"><span className="text-[#C4A484]">Total COGS:</span><span className="text-[#F5F5F5]">{formatIDR(totalCogs)}</span></div>
              <p className="text-xs text-[#C4A484] mt-2 italic">Settlement + profit dihitung otomatis di backend berdasarkan fee config platform.</p>
            </div>

            <button type="submit" className="w-full bg-[#F4C842] text-[#1A0A0F] py-2 rounded-md text-sm font-semibold hover:bg-[#E6B830]">Create Online Order</button>
          </form>
        </div>
      )}

      {/* Order Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#1A0A0F] gold-border rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">{showDetail.order_no}</h3>
              <button onClick={() => setShowDetail(null)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
              <div><span className="text-[#C4A484] text-xs">Platform</span><br /><span className="text-[#F5F5F5]">{showDetail.platform_name}</span></div>
              <div><span className="text-[#C4A484] text-xs">Outlet</span><br /><span className="text-[#F5F5F5]">{showDetail.outlet_name || "—"}</span></div>
              <div><span className="text-[#C4A484] text-xs">Customer</span><br /><span className="text-[#F5F5F5]">{showDetail.customer_name || "—"}</span></div>
              <div><span className="text-[#C4A484] text-xs">Platform Ref</span><br /><span className="text-[#F5F5F5]">{showDetail.platform_order_ref || "—"}</span></div>
            </div>

            {/* Settlement breakdown */}
            <div className="bg-[#2A1015] rounded-md p-4 mb-4">
              <h4 className="text-xs uppercase tracking-widest text-[#C4A484] mb-3">Settlement Breakdown</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-[#F5F5F5]">Gross Sales</span><span className="text-[#F5F5F5]">{formatIDR(showDetail.gross_sales)}</span></div>
                <div className="flex justify-between text-[#8B0000]"><span>Commission</span><span>-{formatIDR(showDetail.commission_amount)}</span></div>
                <div className="flex justify-between text-[#8B0000]"><span>Fixed Fee</span><span>-{formatIDR(showDetail.fixed_fee)}</span></div>
                <div className="flex justify-between text-[#8B0000]"><span>Tax on Fee</span><span>-{formatIDR(showDetail.tax_on_fee)}</span></div>
                {Number(showDetail.merchant_promo) > 0 && <div className="flex justify-between text-[#8B0000]"><span>Merchant Promo</span><span>-{formatIDR(showDetail.merchant_promo)}</span></div>}
                {Number(showDetail.advertising_fee) > 0 && <div className="flex justify-between text-[#8B0000]"><span>Advertising</span><span>-{formatIDR(showDetail.advertising_fee)}</span></div>}
                {Number(showDetail.other_fee) > 0 && <div className="flex justify-between text-[#8B0000]"><span>Other Fee</span><span>-{formatIDR(showDetail.other_fee)}</span></div>}
                <div className="border-t border-[rgba(244,200,66,0.15)] pt-1 flex justify-between font-semibold"><span className="text-[#F5F5F5]">Total Deduction</span><span class="text-[#8B0000]">-{formatIDR(showDetail.total_deduction)}</span></div>
                <div className="flex justify-between font-semibold"><span className="text-[#F4C842]">Expected Settlement</span><span className="text-[#F4C842]">{formatIDR(showDetail.expected_settlement)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-[#C4A484]">Effective Fee</span><span className="text-[#C4A484]">{showDetail.effective_fee_pct}%</span></div>
              </div>
            </div>

            {/* Profit */}
            <div className="bg-[#2A1015] rounded-md p-4 mb-4">
              <h4 className="text-xs uppercase tracking-widest text-[#C4A484] mb-3">Profit Analysis</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-[#F5F5F5]">COGS</span><span className="text-[#F5F5F5]">{formatIDR(showDetail.total_cogs)}</span></div>
                <div className="flex justify-between font-semibold"><span className={showDetail.gross_profit >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"}>Gross Profit After Platform</span><span className={showDetail.gross_profit >= 0 ? "text-[#F4C842]" : "text-[#8B0000]"}>{formatIDR(showDetail.gross_profit)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-[#C4A484]">Profit Margin</span><span className="text-[#C4A484]">{showDetail.profit_margin}%</span></div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-[#2A1015] rounded-md p-4 mb-4">
              <h4 className="text-xs uppercase tracking-widest text-[#C4A484] mb-3">Items</h4>
              {showDetail.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-[rgba(244,200,66,0.05)] last:border-0">
                  <span className="text-[#F5F5F5]">{item.product_name} {item.variant_name ? `(${item.variant_name})` : ""} × {item.quantity}</span>
                  <span className="text-[#F5F5F5]">{formatIDR(item.gross_sales)}</span>
                </div>
              ))}
            </div>

            {/* Reconciliation */}
            {showDetail.settlement_status === "pending" ? (
              <ReconcileForm order={showDetail} onReconcile={reconcile} />
            ) : (
              <div className="bg-[#2A1015] rounded-md p-4">
                <h4 className="text-xs uppercase tracking-widest text-[#C4A484] mb-2">Settlement Reconciliation</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-[#F5F5F5]">Actual Settlement</span><span className="text-[#F5F5F5]">{formatIDR(showDetail.actual_settlement)}</span></div>
                  <div className="flex justify-between"><span className="text-[#F5F5F5]">Variance</span><span className={Number(showDetail.settlement_variance) === 0 ? "text-[#F4C842]" : "text-[#8B0000]"}>{formatIDR(showDetail.settlement_variance)}</span></div>
                  <div className="flex justify-between"><span className="text-[#F5F5F5]">Status</span><span className={showDetail.settlement_status === "matched" ? "text-[#F4C842]" : "text-[#8B0000]"}>{showDetail.settlement_status}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Break-Even Calculator Modal */}
      {showBreakEven && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowBreakEven(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#1A0A0F] gold-border rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">Break-Even Calculator</h3>
              <button onClick={() => setShowBreakEven(false)} className="text-[#C4A484] hover:text-[#F5F5F5]"><X /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Platform</label>
                <select value={breakEvenForm.platform_id} onChange={(e) => setBreakEvenForm({ ...breakEvenForm, platform_id: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]">
                  {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">COGS per unit</label>
                <input type="number" value={breakEvenForm.cogs} onChange={(e) => setBreakEvenForm({ ...breakEvenForm, cogs: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[#C4A484] mb-1 block">Target Profit per unit</label>
                <input type="number" value={breakEvenForm.target_profit} onChange={(e) => setBreakEvenForm({ ...breakEvenForm, target_profit: e.target.value })} className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
              </div>
              <button onClick={calcBreakEven} className="w-full bg-[#F4C842] text-[#1A0A0F] py-2 rounded-md text-sm font-semibold hover:bg-[#E6B830]">Calculate</button>

              {breakEvenResult && (
                <div className="bg-[#2A1015] rounded-md p-4 mt-3">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-[#C4A484]">Variable Fee</span><span className="text-[#F5F5F5]">{breakEvenResult.variable_fee_pct}%</span></div>
                    <div className="flex justify-between"><span className="text-[#C4A484]">Total Fixed Cost</span><span className="text-[#F5F5F5]">{formatIDR(breakEvenResult.total_fixed_cost)}</span></div>
                    <div className="flex justify-between font-semibold"><span className="text-[#F4C842]">Break-Even Price</span><span className="text-[#F4C842]">{formatIDR(breakEvenResult.break_even_price)}</span></div>
                    <div className="flex justify-between font-semibold"><span className="text-[#F4C842]">Recommended Price</span><span className="text-[#F4C842]">{formatIDR(breakEvenResult.recommended_price)}</span></div>
                  </div>
                  <p className="text-xs text-[#C4A484] mt-2 italic">Simulasi — Owner memutuskan harga aktual.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReconcileForm({ order, onReconcile }) {
  const [actual, setActual] = useState("");
  return (
    <div className="bg-[#2A1015] rounded-md p-4">
      <h4 className="text-xs uppercase tracking-widest text-[#C4A484] mb-2">Settlement Reconciliation</h4>
      <p className="text-xs text-[#C4A484] mb-2">Expected: {formatIDR(order.expected_settlement)}</p>
      <div className="flex gap-2">
        <input type="number" placeholder="Actual Settlement" value={actual} onChange={(e) => setActual(e.target.value)} className="flex-1 bg-[#331419] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5]" />
        <button onClick={() => onReconcile(order.id, actual)} className="bg-[#F4C842] text-[#1A0A0F] px-4 py-2 rounded-md text-sm font-semibold">Reconcile</button>
      </div>
    </div>
  );
}
