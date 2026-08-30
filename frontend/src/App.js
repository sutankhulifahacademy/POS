import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { OutletProvider } from "./context/OutletContext";
import Login from "./pages/Login";
import Layout, { canAccess, defaultLandingFor } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Products from "./pages/Products";
import Inventory from "./pages/Inventory";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Outlets from "./pages/Outlets";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import PurchaseOrders from "./pages/PurchaseOrders";
import Shifts from "./pages/Shifts";
import Users from "./pages/Karyawan";
import Transfers from "./pages/Transfers";
import Tables from "./pages/Tables";
import Attendance from "./pages/Attendance";
import PaymentAccounts from "./pages/PaymentAccounts";
import Roles from "./pages/Roles";
import AIAssistant from "./pages/AIAssistant";
import Expenses from "./pages/Expenses";
import AuditLogs from "./pages/AuditLogs";
import LeaveRequests from "./pages/LeaveRequests";
import ReceiptConfig from "./pages/ReceiptConfig";
import Loyalty from "./pages/Loyalty";
import KitchenDisplay from "./pages/KitchenDisplay";
import Coupons from "./pages/Coupons";
import Schedules from "./pages/Schedules";
import Payroll from "./pages/Payroll";
import MobileDashboard from "./pages/MobileDashboard";

function Protected({ children, path }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading || user === null) return <div className="min-h-screen flex items-center justify-center bg-[#1A0810] text-[#C4A484]">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Role check for specific path
  const targetPath = path || location.pathname;
  if (targetPath !== "/pos" && !canAccess(user.role, targetPath)) {
    return <Navigate to={defaultLandingFor(user.role)} replace />;
  }
  return children;
}

function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <div className="min-h-screen flex items-center justify-center bg-[#1A0810] text-[#C4A484]">Memuat...</div>;
  if (user) return <Navigate to={defaultLandingFor(user.role)} replace />;
  return children;
}

function RoleAwareLayout() {
  const { user } = useAuth();
  // Kasir gets sidebar too (POS + Absensi only)
  return <Layout />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OutletProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Public><Login /></Public>} />
          <Route element={<Protected><RoleAwareLayout /></Protected>}>
            <Route path="/dashboard" element={<Protected path="/dashboard"><Dashboard /></Protected>} />
            <Route path="/shifts" element={<Protected path="/shifts"><Shifts /></Protected>} />
            <Route path="/attendance" element={<Protected path="/attendance"><Attendance /></Protected>} />
            <Route path="/tables" element={<Protected path="/tables"><Tables /></Protected>} />
            <Route path="/products" element={<Protected path="/products"><Products /></Protected>} />
            <Route path="/inventory" element={<Protected path="/inventory"><Inventory /></Protected>} />
            <Route path="/transfers" element={<Protected path="/transfers"><Transfers /></Protected>} />
            <Route path="/purchase-orders" element={<Protected path="/purchase-orders"><PurchaseOrders /></Protected>} />
            <Route path="/customers" element={<Protected path="/customers"><Customers /></Protected>} />
            <Route path="/suppliers" element={<Protected path="/suppliers"><Suppliers /></Protected>} />
            <Route path="/outlets" element={<Protected path="/outlets"><Outlets /></Protected>} />
            <Route path="/reports" element={<Protected path="/reports"><Reports /></Protected>} />
            <Route path="/users" element={<Protected path="/users"><Users /></Protected>} />
            <Route path="/settings" element={<Protected path="/settings"><Settings /></Protected>} />
            <Route path="/payment-accounts" element={<Protected path="/payment-accounts"><PaymentAccounts /></Protected>} />
            <Route path="/roles" element={<Protected path="/roles"><Roles /></Protected>} />
            <Route path="/ai-assistant" element={<Protected path="/ai-assistant"><AIAssistant /></Protected>} />
            <Route path="/expenses" element={<Protected path="/expenses"><Expenses /></Protected>} />
            <Route path="/audit-logs" element={<Protected path="/audit-logs"><AuditLogs /></Protected>} />
            <Route path="/leave-requests" element={<Protected path="/leave-requests"><LeaveRequests /></Protected>} />
            <Route path="/receipt-config" element={<Protected path="/receipt-config"><ReceiptConfig /></Protected>} />
            <Route path="/loyalty" element={<Protected path="/loyalty"><Loyalty /></Protected>} />
            <Route path="/kds" element={<Protected path="/kds"><KitchenDisplay /></Protected>} />
            <Route path="/coupons" element={<Protected path="/coupons"><Coupons /></Protected>} />
            <Route path="/schedules" element={<Protected path="/schedules"><Schedules /></Protected>} />
            <Route path="/payroll" element={<Protected path="/payroll"><Payroll /></Protected>} />
            <Route path="/mobile-dashboard" element={<Protected path="/mobile-dashboard"><MobileDashboard /></Protected>} />
          </Route>
          <Route path="/pos" element={<Protected><POS /></Protected>} />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
        </BrowserRouter>
      </OutletProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading || user === null) return <div className="min-h-screen flex items-center justify-center bg-[#1A0810] text-[#C4A484]">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={defaultLandingFor(user.role)} replace />;
}

export default App;
