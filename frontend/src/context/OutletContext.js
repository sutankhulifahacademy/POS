/*
Global Outlet Context — provides outlet selector state across the app.
Owner can select ALL OUTLETS or a specific outlet.
Other roles see only their assigned outlets.
*/
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../lib/api";

const OutletContext = createContext(null);

export function OutletProvider({ children }) {
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(null); // null = ALL OUTLETS
  const [allAccess, setAllAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadOutlets = useCallback(async () => {
    try {
      const { data } = await api.get("/outlets/my");
      setOutlets(data.outlets || []);
      setAllAccess(data.all_access || false);
      // Default: owner starts with first outlet (main), others start with their first outlet
      // Owner can still switch to "ALL OUTLETS" via dropdown
      if (data.outlets.length > 0) {
        const main = data.outlets.find(o => o.is_main) || data.outlets[0];
        setSelectedOutlet(main.id);
      }
    } catch (e) {
      console.error("Failed to load outlets:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOutlets();
  }, [loadOutlets]);

  const value = {
    outlets,
    selectedOutlet,
    setSelectedOutlet,
    allAccess,
    loading,
    reload: loadOutlets,
    // Helper: returns outlet_id for API calls (null = all)
    outletIdForApi: selectedOutlet || null,
  };

  return <OutletContext.Provider value={value}>{children}</OutletContext.Provider>;
}

export function useOutlet() {
  const ctx = useContext(OutletContext);
  if (!ctx) {
    throw new Error("useOutlet must be used within OutletProvider");
  }
  return ctx;
}

export default OutletContext;
