import { createContext, useContext, useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { clearMenuCache } from "../components/Layout";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        setUser(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      // If MFA is required, return the MFA challenge — don't set user yet
      if (data.mfa_required) {
        return { ok: true, mfa_required: true, ...data };
      }
      // Cookie is set by backend (HttpOnly) — no localStorage token
      setUser(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const verifyMFA = async (mfa_token, code) => {
    try {
      const { data } = await api.post("/auth/mfa/verify", { mfa_token, code });
      setUser(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (payload) => {
    try {
      const { data } = await api.post("/auth/register", payload);
      // Cookie is set by backend (HttpOnly) — no localStorage token
      setUser(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    clearMenuCache();
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, verifyMFA, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
