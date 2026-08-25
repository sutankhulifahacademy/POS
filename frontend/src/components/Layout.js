import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LayoutDashboard, ShoppingCart, Package, Boxes, Users, Truck, Store, BarChart3, Settings, LogOut } from "lucide-react";
import { Toaster } from "sonner";

const LOGO = "https://customer-assets-gfyr7b9c.emergentagent.net/job_inventory-hub-3002/artifacts/agyuw41m_logoSK.png";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/pos", label: "Kasir (POS)", icon: ShoppingCart, testId: "nav-pos" },
  { to: "/products", label: "Produk", icon: Package, testId: "nav-products" },
  { to: "/inventory", label: "Inventory", icon: Boxes, testId: "nav-inventory" },
  { to: "/customers", label: "Pelanggan", icon: Users, testId: "nav-customers" },
  { to: "/suppliers", label: "Supplier", icon: Truck, testId: "nav-suppliers" },
  { to: "/outlets", label: "Outlet", icon: Store, testId: "nav-outlets" },
  { to: "/reports", label: "Laporan", icon: BarChart3, testId: "nav-reports" },
  { to: "/settings", label: "Pengaturan", icon: Settings, testId: "nav-settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#FDFBF7] flex">
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: '#111', border: '1px solid rgba(212,175,55,0.3)', color: '#FDFBF7' } }} />
      {/* Sidebar */}
      <aside className="w-64 bg-[#080808] border-r border-[rgba(212,175,55,0.15)] flex flex-col fixed h-screen" data-testid="app-sidebar">
        <div className="p-6 border-b border-[rgba(212,175,55,0.15)]">
          <div className="flex flex-col items-center gap-3">
            <img src={LOGO} alt="Sutan Khulifah" className="w-16 h-16 object-contain" data-testid="brand-logo" />
            <div className="text-center">
              <h1 className="font-serif-luxury text-lg text-[#D4AF37] leading-tight">Sutan Khulifah</h1>
              <p className="text-[10px] tracking-widest text-[#A39B8B] uppercase">POS Academy</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={n.testId}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-[rgba(212,175,55,0.12)] text-[#D4AF37] border-l-2 border-[#D4AF37]"
                      : "text-[#A39B8B] hover:text-[#FDFBF7] hover:bg-[#111]"
                  }`
                }
              >
                <Icon size={17} strokeWidth={1.5} />
                <span>{n.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[rgba(212,175,55,0.15)]">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs text-[#A39B8B]">Masuk sebagai</p>
            <p className="text-sm text-[#FDFBF7] truncate" data-testid="user-name">{user?.name}</p>
            <p className="text-[10px] text-[#D4AF37] uppercase tracking-wider">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-[#A39B8B] hover:text-[#FDFBF7] hover:bg-[#111] transition-colors"
          >
            <LogOut size={17} strokeWidth={1.5} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
