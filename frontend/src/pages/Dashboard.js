import { useEffect, useState } from "react";
import api, { formatIDR } from "../lib/api";
import {
  TrendingUp,
  ShoppingBag,
  Users,
  AlertTriangle,
  DollarSign,
  Package,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import PageHeader from "../components/PageHeader";
import { useOutlet } from "../context/OutletContext";

function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  testId,
}) {
  return (
    <div
      className="bg-[#331419] gold-border rounded-lg p-6 card-hover"
      data-testid={testId}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-md bg-[rgba(244,200,66,0.1)] flex items-center justify-center">
          <Icon
            size={20}
            strokeWidth={1.5}
            className="text-[#F4C842]"
          />
        </div>
      </div>

      <p className="text-xs uppercase tracking-widest text-[#C4A484] mb-2">
        {label}
      </p>

      <p className="font-serif-luxury text-3xl text-[#F5F5F5]">
        {value}
      </p>

      {sublabel && (
        <p className="text-xs text-[#C4A484] mt-2">
          {sublabel}
        </p>
      )}
    </div>
  );
}

const PERIOD_OPTIONS = [
  {
    value: "daily",
    label: "Harian",
    chartTitle: "Pendapatan Per Jam",
    subtitle: "Ringkasan performa bisnis hari ini",
  },
  {
    value: "weekly",
    label: "Mingguan",
    chartTitle: "Pendapatan Harian",
    subtitle: "Ringkasan performa bisnis 7 hari terakhir",
  },
  {
    value: "monthly",
    label: "Bulanan",
    chartTitle: "Pendapatan Harian",
    subtitle: "Ringkasan performa bisnis bulan berjalan",
  },
  {
    value: "yearly",
    label: "Tahunan",
    chartTitle: "Pendapatan Bulanan",
    subtitle: "Ringkasan performa bisnis tahun berjalan",
  },
];

function getPeriodLabel(period) {
  return (
    PERIOD_OPTIONS.find((item) => item.value === period)?.label ||
    "Mingguan"
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState("weekly");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { outletIdForApi } = useOutlet();

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const outletParam = outletIdForApi ? `&outlet_id=${outletIdForApi}` : "";
        const response = await api.get(
          `/reports/dashboard?period=${period}${outletParam}`
        );

        if (mounted) {
          setData(response.data);
        }
      } catch (err) {
        console.error("Dashboard error:", err);

        if (mounted) {
          setError(
            err?.response?.data?.detail ||
              "Gagal memuat data Dashboard."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, [period, outletIdForApi]);

  const selectedPeriod =
    PERIOD_OPTIONS.find((item) => item.value === period) ||
    PERIOD_OPTIONS[1];

  if (loading && !data) {
    return (
      <div className="p-10 text-[#C4A484]">
        Memuat Dashboard...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={selectedPeriod.subtitle}
      />

      <div className="p-4 md:p-6 lg:p-8 space-y-8">

        {/* =========================================
            PERIOD FILTER
        ========================================== */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#C4A484]">
              Periode Analisis
            </p>

            <p className="text-sm text-[#F5F5F5] mt-1">
              Menampilkan data{" "}
              {getPeriodLabel(period).toLowerCase()}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="dashboard-period"
              className="text-sm text-[#C4A484]"
            >
              Periode
            </label>

            <select
              id="dashboard-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-[#331419] text-[#F5F5F5] border border-[rgba(244,200,66,0.35)] rounded-md px-4 py-2.5 text-sm outline-none focus:border-[#F4C842]"
              data-testid="dashboard-period"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-[#331419]"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* =========================================
            ERROR
        ========================================== */}
        {error && (
          <div className="bg-[#331419] border border-[#8B0000] rounded-lg p-4 text-sm text-[#F5F5F5]">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* =====================================
                METRICS
            ====================================== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              <MetricCard
                icon={DollarSign}
                label="Pendapatan"
                value={formatIDR(data.revenue)}
                sublabel={`${data.transactions} transaksi`}
                testId="metric-revenue"
              />

              <MetricCard
                icon={TrendingUp}
                label="Transaksi"
                value={data.transactions}
                sublabel={`${getPeriodLabel(period).toLowerCase()}`}
                testId="metric-transactions"
              />

              <MetricCard
                icon={ShoppingBag}
                label="Item Terjual"
                value={data.items_sold}
                sublabel={`${getPeriodLabel(period).toLowerCase()}`}
                testId="metric-items-sold"
              />

              <MetricCard
                icon={Users}
                label="Pelanggan"
                value={data.customers_count}
                sublabel="terdaftar"
                testId="metric-customers"
              />

            </div>

            {/* =====================================
                BRANCH COMPARISON (only when ALL OUTLETS)
            ====================================== */}
            {data.branch_comparison && data.branch_comparison.length > 0 && (
              <div className="bg-[#331419] gold-border rounded-lg p-6">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-widest text-[#C4A484]">Perbandingan Outlet</p>
                  <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mt-1">Performa Cabang</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(244,200,66,0.2)]">
                        <th className="text-left py-2 px-3 text-[#C4A484]">#</th>
                        <th className="text-left py-2 px-3 text-[#C4A484]">Outlet</th>
                        <th className="text-right py-2 px-3 text-[#C4A484]">Pendapatan</th>
                        <th className="text-right py-2 px-3 text-[#C4A484]">Transaksi</th>
                        <th className="text-right py-2 px-3 text-[#C4A484]">Rata-rata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.branch_comparison.map((b, i) => (
                        <tr key={b.outlet_id} className="border-b border-[rgba(244,200,66,0.08)]">
                          <td className="py-2 px-3 text-[#F4C842]">{i + 1}</td>
                          <td className="py-2 px-3 text-[#F5F5F5]">{b.outlet_name}</td>
                          <td className="py-2 px-3 text-right text-[#F5F5F5]">{formatIDR(b.revenue)}</td>
                          <td className="py-2 px-3 text-right text-[#C4A484]">{b.transactions}</td>
                          <td className="py-2 px-3 text-right text-[#C4A484]">{formatIDR(b.avg_transaction)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* =====================================
                CHART + LOW STOCK
            ====================================== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              <div
                className="lg:col-span-2 bg-[#331419] gold-border rounded-lg p-6"
                data-testid="chart-revenue"
              >
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-widest text-[#C4A484]">
                    {getPeriodLabel(period)}
                  </p>

                  <h3 className="font-serif-luxury text-2xl text-[#F5F5F5] mt-1">
                    {selectedPeriod.chartTitle}
                  </h3>
                </div>

                <div className="h-64">
                  {data.chart.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[#C4A484] text-sm">
                      Belum ada data penjualan pada periode ini
                    </div>
                  ) : (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <LineChart data={data.chart}>
                        <CartesianGrid
                          stroke="rgba(244,200,66,0.1)"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="label"
                          stroke="#C4A484"
                          fontSize={11}
                        />

                        <YAxis
                          stroke="#C4A484"
                          fontSize={11}
                          tickFormatter={(value) =>
                            `${(value / 1000).toFixed(0)}K`
                          }
                        />

                        <Tooltip
                          contentStyle={{
                            background: "#0F1A3A",
                            border:
                              "1px solid rgba(244,200,66,0.3)",
                            borderRadius: 6,
                            color: "#F5F5F5",
                          }}
                          formatter={(value) =>
                            formatIDR(value)
                          }
                        />

                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#F4C842"
                          strokeWidth={2}
                          dot={{
                            fill: "#F4C842",
                            r: 4,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* LOW STOCK */}
              <div
                className="bg-[#331419] gold-border rounded-lg p-6"
                data-testid="low-stock-panel"
              >
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle
                    size={18}
                    strokeWidth={1.5}
                    className="text-[#F4C842]"
                  />

                  <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">
                    Stok Menipis
                  </h3>
                </div>

                {data.low_stock_items.length === 0 ? (
                  <p className="text-sm text-[#C4A484]">
                    Semua stok aman.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.low_stock_items.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between py-2 border-b border-[rgba(244,200,66,0.1)] last:border-0"
                      >
                        <div>
                          <p className="text-sm text-[#F5F5F5]">
                            {p.name}
                          </p>

                          <p className="text-xs text-[#C4A484]">
                            {p.sku}
                          </p>
                        </div>

                        <span className="text-sm text-[#8B0000] font-semibold">
                          {p.stock} {p.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* =====================================
                TOP PRODUCTS
            ====================================== */}
            <div
              className="bg-[#331419] gold-border rounded-lg p-6"
              data-testid="top-products"
            >
              <div className="mb-6 flex items-center gap-2">
                <Package
                  size={18}
                  strokeWidth={1.5}
                  className="text-[#F4C842]"
                />

                <h3 className="font-serif-luxury text-2xl text-[#F5F5F5]">
                  Produk Terlaris
                </h3>
              </div>

              {data.top_products.length === 0 ? (
                <p className="text-sm text-[#C4A484]">
                  Belum ada data.
                </p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                      <th className="py-3">
                        Produk
                      </th>

                      <th className="py-3 text-right">
                        Terjual
                      </th>

                      <th className="py-3 text-right">
                        Pendapatan
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.top_products.map((p, i) => (
                      <tr
                        key={i}
                        className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors"
                      >
                        <td className="py-3 text-[#F5F5F5]">
                          {p.name}
                        </td>

                        <td className="py-3 text-right text-[#C4A484]">
                          {p.quantity}
                        </td>

                        <td className="py-3 text-right text-[#F4C842]">
                          {formatIDR(p.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Loading ketika mengganti periode */}
        {loading && data && (
          <div className="text-xs text-[#C4A484]">
            Memperbarui data...
          </div>
        )}

      </div>
    </div>
  );
}