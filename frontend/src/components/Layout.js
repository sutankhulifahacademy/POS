import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Users, Truck, Store,
  BarChart3, Settings, LogOut, ClipboardList, Clock, UserCog,
  ArrowRightLeft, Utensils, CreditCard, Shield, Circle, FileText,
  Wallet, Tag, Percent, TrendingUp, Receipt, Coffee, Calendar,
  CheckSquare, List, Grid, Home, Bell, Mail, MessageSquare, Phone,
  MapPin, Star, Award, Heart, Eye, Edit, Trash, Save, Plus, Minus,
  Search, Filter, Download, Upload, Printer, X, Check, ChevronDown,
  ChevronRight, ChevronLeft, ArrowUp, ArrowDown, ArrowRight, ArrowLeft,
  ExternalLink, Link, Lock, Unlock, Key, EyeOff, Send,
  RefreshCw, RotateCw, RotateCcw, Play, Pause, SkipForward,
  SkipBack, FastForward, Rewind, Volume2, VolumeX, Maximize, Minimize,
  MoreHorizontal, MoreVertical, Settings2, Sliders, ToggleLeft,
  ToggleRight, Power, Zap, Activity, AlertCircle, AlertTriangle, Info,
  HelpCircle, XCircle, CheckCircle, PlusCircle, MinusCircle,
  Flame, Snowflake, Sun, Moon, Cloud, Wind, Droplet, Compass,
  Navigation, Globe, Flag, Bookmark, BookOpen, Book, File,
  Folder, FolderOpen, Paperclip, Share, Forward, Reply, Inbox,
  Archive, Megaphone, MessageCircle, Video, Mic, PlayCircle,
  PauseCircle, PlusSquare, MinusSquare, Menu,
} from "lucide-react";
import { Toaster } from "sonner";
import api from "../lib/api";
import { useTheme } from "../context/ThemeContext";
import { useOutlet } from "../context/OutletContext";

const DEFAULT_LOGO = "https://customer-assets-gfyr7b9c.emergentagent.net/job_inventory-hub-3002/artifacts/3xyqa9jm_WhatsApp%20Image%202026-08-25%20at%2009.54.11.jpeg";

// Icon map — maps icon name from database to lucide-react component
const ICON_MAP = {
  LayoutDashboard, ShoppingCart, Package, Boxes, Users, Truck, Store,
  BarChart3, Settings, ClipboardList, Clock, UserCog, ArrowRightLeft,
  Utensils, CreditCard, Shield, Circle, FileText, Wallet, Tag, Percent,
  TrendingUp, Receipt, Coffee, Calendar, CheckSquare, List, Grid, Home,
  Bell, Mail, MessageSquare, Phone, MapPin, Star, Award, Heart, Eye,
  Edit, Trash, Save, Plus, Minus, Search, Filter, Download, Upload,
  Printer, X, Check, ChevronDown, ChevronRight, ChevronLeft, ArrowUp,
  ArrowDown, ArrowRight, ArrowLeft, ExternalLink, Link, Lock, Unlock,
  Key, EyeOff, Send, RefreshCw, RotateCw, RotateCcw, Play, Pause,
  SkipForward, SkipBack, FastForward, Rewind, Volume2, VolumeX, Maximize,
  Minimize, MoreHorizontal, MoreVertical, Settings2, Sliders, ToggleLeft,
  ToggleRight, Power, Zap, Activity, AlertCircle, AlertTriangle, Info,
  HelpCircle, XCircle, CheckCircle, PlusCircle, MinusCircle, Flame,
  Snowflake, Sun, Moon, Cloud, Wind, Droplet, Compass, Navigation, Globe,
  Flag, Bookmark, BookOpen, Book, File, Folder, FolderOpen, Paperclip,
  Share, Forward, Reply, Inbox, Archive, Megaphone, MessageCircle,
  Video, Mic, PlayCircle, PauseCircle, PlusSquare, MinusSquare,
};

function getIcon(name) {
  if (!name) return Circle;
  return ICON_MAP[name] || Circle;
}

// Fallback menus in case API is unavailable
const FALLBACK_MENUS = [
  { route: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", name: "dashboard" },
  { route: "/pos", label: "Kasir (POS)", icon: "ShoppingCart", name: "pos" },
  { route: "/attendance", label: "Absensi", icon: "Clock", name: "attendance" },
];

// Cache menus in memory to avoid refetch on every layout render
let _cachedMenus = null;
let _cachedRole = null;

export async function fetchMyMenus() {
  try {
    const r = await api.get("/menus/my-menus");
    return r.data;
  } catch {
    return FALLBACK_MENUS;
  }
}

export async function fetchAllMenus() {
  try {
    const r = await api.get("/menus");
    return r.data;
  } catch {
    return [];
  }
}

// Exported for App.js route protection — checks if a route exists in cached menus
export function canAccess(role, path) {
  if (path === "/pos") return true; // POS always accessible
  if (!_cachedMenus || _cachedRole !== role) return true; // Allow during initial load / role mismatch
  return _cachedMenus.some(m => m.route === path);
}

export function defaultLandingFor(role) {
  if (role === "kasir") return "/pos";
  if (role === "supervisor") return "/dashboard";
  return "/dashboard";
}

const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", kasir: "Kasir", supervisor: "Supervisor" };

function NotificationBell() {
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/alerts?limit=10");
        setAlerts(data.alerts || []);
        setUnread(data.unread_count || 0);
      } catch (e) { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const markAllRead = async () => {
    try {
      await api.put("/alerts/read-all");
      setUnread(0);
      setAlerts(alerts.map(a => ({ ...a, is_read: true })));
    } catch (e) { /* ignore */ }
  };

  const severityColors = {
    critical: "text-red-400",
    warning: "text-yellow-400",
    info: "text-blue-400",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#331419]"
        data-testid="notification-bell"
      >
        <Bell size={18} className="text-[#C4A484]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between p-3 border-b border-[rgba(244,200,66,0.15)]">
              <span className="text-sm text-[#F5F5F5] font-medium">Notifikasi</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-[#F4C842] hover:underline">
                  Tandai semua dibaca
                </button>
              )}
            </div>
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#C4A484]">Tidak ada notifikasi</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className={`p-3 border-b border-[rgba(244,200,66,0.08)] ${!a.is_read ? "bg-[rgba(244,200,66,0.05)]" : ""}`}>
                  <div className="flex items-start gap-2">
                    <span className={`text-xs mt-0.5 ${severityColors[a.severity] || "text-[#C4A484]"}`}>●</span>
                    <div className="flex-1">
                      <p className="text-sm text-[#F5F5F5]">{a.title}</p>
                      <p className="text-xs text-[#C4A484] mt-0.5">{a.message}</p>
                      {a.outlet_name && <p className="text-xs text-[#C4A484] mt-1">📍 {a.outlet_name}</p>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { business } = useTheme();
  const { outlets, selectedOutlet, setSelectedOutlet, allAccess } = useOutlet();
  const nav = useNavigate();
  const [menus, setMenus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const logoUrl = business?.logo_url || DEFAULT_LOGO;
  const bizName = business?.name || "Republik Dimsum";

  useEffect(() => {
    // Return cached menus immediately if same role
    if (_cachedMenus && _cachedRole === user?.role) {
      setMenus(_cachedMenus);
      return;
    }
    fetchMyMenus().then(data => {
      _cachedMenus = data;
      _cachedRole = user?.role;
      setMenus(data);
    });
  }, [user?.role]);

  const handleLogout = async () => { await logout(); nav("/login"); };

  const visibleNav = menus || [];

  return (
    <div className="min-h-screen bg-[#1A0810] text-[#F5F5F5]">
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: '#111', border: '1px solid rgba(244,200,66,0.3)', color: '#F5F5F5' } }} />

      {/* ===== GLOBAL OUTLET BAR — di atas semua menu ===== */}
      {/* Outlet dropdown hanya untuk Owner. Non-owner lihat nama outlet saja. */}
      {outlets.length > 0 && (
        <div className="sticky top-0 z-[60] w-full bg-[#2A1015] border-b border-[rgba(244,200,66,0.25)] px-4 py-2.5 flex items-center gap-3 shadow-lg">
          {/* Mobile sidebar toggle inside outlet bar */}
          <button
            onClick={() => setSidebarOpen(true)}
            data-testid="sidebar-toggle"
            className="lg:hidden w-9 h-9 flex items-center justify-center bg-[#1A0810] border border-[rgba(244,200,66,0.3)] rounded-md text-[#F4C842]"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Store size={18} className="text-[#F4C842]" />
            <span className="text-xs text-[#C4A484] uppercase tracking-wider font-semibold">Outlet:</span>
          </div>
          {allAccess ? (
            <select
              value={selectedOutlet || ""}
              onChange={(e) => setSelectedOutlet(e.target.value || null)}
              data-testid="outlet-selector"
              className="bg-[#1A0810] border border-[rgba(244,200,66,0.4)] rounded-md px-4 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#F4C842] font-medium min-w-[180px]"
            >
              <option value="">ALL OUTLETS</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.is_main ? " (Utama)" : ""}</option>
              ))}
            </select>
          ) : (
            <span className="bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-4 py-2 text-sm text-[#F5F5F5] font-medium min-w-[180px]" data-testid="outlet-display">
              {outlets.find(o => o.id === selectedOutlet)?.name || outlets[0]?.name || "—"}
            </span>
          )}
          <div className="ml-auto flex items-center gap-4">
            <NotificationBell />
            <span className="text-xs text-[#C4A484] hidden sm:inline">{ROLE_LABEL[user?.role] || user?.role}</span>
          </div>
        </div>
      )}

      {/* Fallback: mobile sidebar toggle when no outlets (loading) */}
      {outlets.length === 0 && (
        <button
          onClick={() => setSidebarOpen(true)}
          data-testid="sidebar-toggle"
          className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 flex items-center justify-center bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md text-[#F4C842]"
        >
          <Menu size={20} />
        </button>
      )}

      <div className="flex">
        {/* Overlay backdrop for tablet/mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setSidebarOpen(false)}
            data-testid="sidebar-backdrop"
          />
        )}

        <aside
          className={`w-64 bg-[#2A1015] border-r border-[rgba(244,200,66,0.15)] flex flex-col fixed h-screen z-50 transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          } ${outlets.length > 0 ? "top-[49px]" : "top-0"}`}
          data-testid="app-sidebar"
        >
          {/* Close button on tablet/mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-[#C4A484] hover:text-[#F5F5F5]"
            data-testid="sidebar-close"
          >
            <X size={18} />
          </button>
          <div className="p-6 border-b border-[rgba(244,200,66,0.15)]">
            <div className="flex flex-col items-center gap-3">
              <img src={logoUrl} alt={bizName} className="w-16 h-16 object-contain" data-testid="brand-logo" />
              <div className="text-center">
                <h1 className="font-serif-luxury text-lg text-[#F4C842] leading-tight">{bizName}</h1>
                <p className="text-xs tracking-widest text-[#C4A484] uppercase">{business?.business_type || "POS"}</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {!menus && (
              <div className="px-3 py-4 text-xs text-[#C4A484]">Memuat menu...</div>
            )}
            {visibleNav.map((n) => {
              const Icon = getIcon(n.icon);
              return (
                <NavLink
                  key={n.route}
                  to={n.route}
                  onClick={() => setSidebarOpen(false)}
                  data-testid={`nav-${n.name}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? "bg-[rgba(244,200,66,0.12)] text-[#F4C842] border-l-2 border-[#F4C842]"
                        : "text-[#C4A484] hover:text-[#F5F5F5] hover:bg-[#331419]"
                    }`
                  }
                >
                  <Icon size={18} strokeWidth={1.5} />
                  <span>{n.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="p-3 border-t border-[rgba(244,200,66,0.15)]">
            <div className="px-3 py-2 mb-2">
              <p className="text-xs text-[#C4A484]">Masuk sebagai</p>
              <p className="text-sm text-[#F5F5F5] truncate" data-testid="user-name">{user?.name}</p>
              <p className="text-xs text-[#F4C842] uppercase tracking-wider" data-testid="user-role-badge">{ROLE_LABEL[user?.role] || user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              data-testid="logout-btn"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-[#C4A484] hover:text-[#F5F5F5] hover:bg-[#331419] transition-colors"
            >
              <LogOut size={18} strokeWidth={1.5} />
              <span>Keluar</span>
            </button>
          </div>
        </aside>
        <main className="flex-1 lg:ml-64 min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
