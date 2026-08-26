import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast, Toaster } from "sonner";
import { Loader2 } from "lucide-react";

const LOGO = "https://customer-assets-gfyr7b9c.emergentagent.net/job_inventory-hub-3002/artifacts/3xyqa9jm_WhatsApp%20Image%202026-08-25%20at%2009.54.11.jpeg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Selamat datang kembali");
      nav("/dashboard");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#1A0810] text-[#F5F5F5]">
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: '#111', border: '1px solid rgba(244,200,66,0.3)', color: '#F5F5F5' } }} />

      {/* Left brand panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden border-r border-[rgba(244,200,66,0.15)]">
        <div className="absolute inset-0 grain opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A0810] via-[#2A1015] to-[#1A0810]" />
        <div className="relative z-10 flex flex-col justify-between p-16 w-full">
          <div>
            <img src={LOGO} alt="Sutan Khulifah" className="w-32 h-32 object-contain" />
          </div>
          <div>
            <h1 className="font-serif-luxury text-6xl leading-tight text-[#F5F5F5]">
              Republik Dimsum <br />
              <span className="text-[#F4C842] italic">Imperium.</span>
            </h1>
            <p className="mt-6 text-[#C4A484] text-lg font-serif-luxury">
              Sajian Kerajaan. Layanan Istimewa. Setiap Hari.
            </p>
            <div className="mt-12 w-16 h-px bg-[#F4C842]" />
            <p className="mt-6 text-xs tracking-[0.3em] text-[#C4A484] uppercase">
              Point of Sale · Inventory · Analytics
            </p>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-8">
            <img src={LOGO} alt="Logo" className="w-24 h-24 object-contain" />
          </div>
          <div className="mb-10">
            <p className="text-xs tracking-[0.3em] text-[#F4C842] uppercase mb-3">Selamat Datang</p>
            <h2 className="font-serif-luxury text-4xl text-[#F5F5F5]">Masuk ke Sistem</h2>
            <p className="mt-3 text-[#C4A484] text-sm">Kelola bisnis Anda dengan ketenangan dan ketelitian.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="text-xs tracking-widest uppercase text-[#C4A484] mb-2 block">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-4 py-3 text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#F4C842] focus:border-[#F4C842] transition-colors"
                placeholder="email@domain.com"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <label className="text-xs tracking-widest uppercase text-[#C4A484] mb-2 block">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-4 py-3 text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#F4C842] focus:border-[#F4C842] transition-colors"
                placeholder="••••••••"
                data-testid="login-password-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit-btn"
              className="w-full bg-[#F4C842] text-[#1A0810] py-3.5 rounded-md font-semibold tracking-wide uppercase text-sm hover:bg-[#FFDD5C] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : "Masuk"}
            </button>

            <div className="pt-4 border-t border-[rgba(244,200,66,0.15)]">
              <p className="text-xs text-[#C4A484] leading-relaxed">
                <span className="text-[#F4C842]">Kredensial demo:</span><br/>
                Admin: sutankhulifahacademy@gmail.com / Sutan@2026<br/>
                Kasir: kasir@sutankhulifah.com / Kasir@2026
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
