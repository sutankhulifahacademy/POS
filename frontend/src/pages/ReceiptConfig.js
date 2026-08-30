import { useState, useEffect, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Save, Receipt, Eye } from "lucide-react";
import { toast } from "sonner";

const PAPER_WIDTHS = [
  { value: "58mm", label: "58mm" },
  { value: "80mm", label: "80mm" },
];
const FONT_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const DEFAULT_CONFIG = {
  receipt_header: "",
  receipt_footer: "Terima Kasih",
  receipt_logo: "",
  receipt_show_cashier: true,
  receipt_show_shift: false,
  receipt_paper_width: "80mm",
  receipt_font_size: "medium",
  tax_enabled: false,
  tax_rate: 0,
  tax_name: "Pajak",
  tax_inclusive: false,
  service_charge_enabled: false,
  service_charge_rate: 0,
};

export default function ReceiptConfig() {
  const { outlets, selectedOutlet, setSelectedOutlet, allAccess } = useOutlet();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selectedOutlet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/receipt-config/${selectedOutlet}`);
      setConfig({ ...DEFAULT_CONFIG, ...data });
    } catch (e) {
      if (e.response?.status === 404) {
        setConfig(DEFAULT_CONFIG);
      } else {
        toast.error("Gagal memuat konfigurasi struk");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedOutlet]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedOutlet) {
      toast.error("Pilih outlet terlebih dahulu");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/receipt-config/${selectedOutlet}`, config);
      toast.success("Konfigurasi struk disimpan");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan konfigurasi");
    } finally {
      setSaving(false);
    }
  };

  const set = (key, value) => setConfig({ ...config, [key]: value });

  const previewWidth = config.receipt_paper_width === "58mm" ? "w-[220px]" : "w-[300px]";
  const fontSizeClass =
    config.receipt_font_size === "small"
      ? "text-[10px]"
      : config.receipt_font_size === "large"
      ? "text-sm"
      : "text-xs";

  return (
    <div>
      <PageHeader
        title="Konfigurasi Struk"
        subtitle="Kustomisasi struk per outlet"
        actions={
          allAccess ? (
            <select
              value={selectedOutlet || ""}
              onChange={(e) => setSelectedOutlet(e.target.value ? Number(e.target.value) : null)}
              className="bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm"
            >
              <option value="">Semua Outlet</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          ) : null
        }
      />

      <div className="p-4 md:p-6 lg:p-8">
        {!selectedOutlet ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <Receipt size={32} className="mx-auto mb-3 opacity-50" />
            Pilih outlet untuk mengatur konfigurasi struk
          </div>
        ) : loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <form action="javascript:void(0)" onSubmit={handleSave} className="bg-[#331419] gold-border rounded-lg p-6 space-y-6">
              <div>
                <h3 className="font-serif-luxury text-lg text-[#F5F5F5] mb-4">Tampilan Struk</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-[#C4A484]">Header Struk</label>
                    <input
                      type="text"
                      value={config.receipt_header}
                      onChange={(e) => set("receipt_header", e.target.value)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                      placeholder="Nama Outlet"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-[#C4A484]">Footer Struk</label>
                    <input
                      type="text"
                      value={config.receipt_footer}
                      onChange={(e) => set("receipt_footer", e.target.value)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                      placeholder="Terima Kasih"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-[#C4A484]">Logo URL</label>
                    <input
                      type="text"
                      value={config.receipt_logo}
                      onChange={(e) => set("receipt_logo", e.target.value)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#C4A484]">Lebar Kertas</label>
                    <select
                      value={config.receipt_paper_width}
                      onChange={(e) => set("receipt_paper_width", e.target.value)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                    >
                      {PAPER_WIDTHS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#C4A484]">Ukuran Font</label>
                    <select
                      value={config.receipt_font_size}
                      onChange={(e) => set("receipt_font_size", e.target.value)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                    >
                      {FONT_SIZES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.receipt_show_cashier}
                      onChange={(e) => set("receipt_show_cashier", e.target.checked)}
                      className="accent-[#F4C842]"
                    />
                    Tampilkan Nama Kasir
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.receipt_show_shift}
                      onChange={(e) => set("receipt_show_shift", e.target.checked)}
                      className="accent-[#F4C842]"
                    />
                    Tampilkan Info Shift
                  </label>
                </div>
              </div>

              <div className="border-t border-[rgba(244,200,66,0.15)] pt-4">
                <h3 className="font-serif-luxury text-lg text-[#F5F5F5] mb-4">Pajak</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.tax_enabled}
                      onChange={(e) => set("tax_enabled", e.target.checked)}
                      className="accent-[#F4C842]"
                    />
                    Aktifkan Pajak
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.tax_inclusive}
                      onChange={(e) => set("tax_inclusive", e.target.checked)}
                      className="accent-[#F4C842]"
                    />
                    Pajak Inklusif
                  </label>
                  <div>
                    <label className="text-xs text-[#C4A484]">Nama Pajak</label>
                    <input
                      type="text"
                      value={config.tax_name}
                      onChange={(e) => set("tax_name", e.target.value)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#C4A484]">Tarif Pajak (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={config.tax_rate}
                      onChange={(e) => set("tax_rate", parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-[rgba(244,200,66,0.15)] pt-4">
                <h3 className="font-serif-luxury text-lg text-[#F5F5F5] mb-4">Service Charge</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.service_charge_enabled}
                      onChange={(e) => set("service_charge_enabled", e.target.checked)}
                      className="accent-[#F4C842]"
                    />
                    Aktifkan Service Charge
                  </label>
                  <div>
                    <label className="text-xs text-[#C4A484]">Tarif Service Charge (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={config.service_charge_rate}
                      onChange={(e) => set("service_charge_rate", parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-2 text-[#F5F5F5] text-sm mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-6 py-2 rounded-md text-sm font-medium hover:bg-[#E6B835] disabled:opacity-50"
                >
                  <Save size={16} /> {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>

            {/* Live Preview */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#C4A484] text-sm">
                <Eye size={16} /> Preview Struk
              </div>
              <div className="bg-[#F5F5F5] text-black rounded-md p-4 mx-auto shadow-lg" style={{ width: config.receipt_paper_width === "58mm" ? 220 : 300 }}>
                <div className={`font-mono ${fontSizeClass} text-center space-y-1`}>
                  {config.receipt_logo && (
                    <img src={config.receipt_logo} alt="logo" className="mx-auto h-12 w-auto object-contain" />
                  )}
                  {config.receipt_header && (
                    <p className="font-bold text-sm">{config.receipt_header}</p>
                  )}
                  <p className="text-gray-600">Jl. Contoh No. 123</p>
                  <p className="text-gray-600">Telp: 021-1234567</p>
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <div className="flex justify-between">
                    <span>INV-001</span>
                    <span>{new Date().toLocaleDateString("id-ID")}</span>
                  </div>
                  {config.receipt_show_cashier && (
                    <div className="flex justify-between">
                      <span>Kasir</span>
                      <span>Admin</span>
                    </div>
                  )}
                  {config.receipt_show_shift && (
                    <div className="flex justify-between">
                      <span>Shift</span>
                      <span>Pagi</span>
                    </div>
                  )}
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <div className="flex justify-between">
                    <span>Espresso x1</span>
                    <span>25.000</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cappuccino x2</span>
                    <span>70.000</span>
                  </div>
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <div className="flex justify-between font-bold">
                    <span>Subtotal</span>
                    <span>95.000</span>
                  </div>
                  {config.tax_enabled && (
                    <div className="flex justify-between">
                      <span>{config.tax_name} ({config.tax_rate}%){config.tax_inclusive ? " (Inkl.)" : ""}</span>
                      <span>{formatIDR(95000 * config.tax_rate / 100)}</span>
                    </div>
                  )}
                  {config.service_charge_enabled && (
                    <div className="flex justify-between">
                      <span>Service ({config.service_charge_rate}%)</span>
                      <span>{formatIDR(95000 * config.service_charge_rate / 100)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-gray-400 pt-1">
                    <span>Total</span>
                    <span>{formatIDR(
                      95000 +
                      (config.tax_enabled && !config.tax_inclusive ? 95000 * config.tax_rate / 100 : 0) +
                      (config.service_charge_enabled ? 95000 * config.service_charge_rate / 100 : 0)
                    )}</span>
                  </div>
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <p>{config.receipt_footer || "Terima Kasih"}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
