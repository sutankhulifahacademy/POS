import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../lib/api";

const ThemeContext = createContext(null);

let _cachedBusiness = null;

export function ThemeProvider({ children }) {
  const [business, setBusiness] = useState(_cachedBusiness);

  const loadBusiness = useCallback(async () => {
    try {
      const { data } = await api.get("/business");
      _cachedBusiness = data;
      setBusiness(data);
      applyTheme(data);
    } catch {
      // Use defaults
    }
  }, []);

  useEffect(() => {
    if (!_cachedBusiness) {
      loadBusiness();
    } else {
      applyTheme(_cachedBusiness);
    }
  }, [loadBusiness]);

  const refresh = useCallback(() => {
    return loadBusiness();
  }, [loadBusiness]);

  return (
    <ThemeContext.Provider value={{ business, refresh }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx || { business: null, refresh: () => {} };
}

function applyTheme(biz) {
  if (!biz) return;
  const root = document.documentElement;
  if (biz.primary_color) root.style.setProperty("--color-primary", biz.primary_color);
  if (biz.secondary_color) root.style.setProperty("--color-secondary", biz.secondary_color);
  if (biz.bg_color) root.style.setProperty("--color-bg", biz.bg_color);
  if (biz.card_bg_color) root.style.setProperty("--color-card", biz.card_bg_color);
  if (biz.sidebar_bg_color) root.style.setProperty("--color-sidebar", biz.sidebar_bg_color);
  // Also set body background
  if (biz.bg_color) document.body.style.backgroundColor = biz.bg_color;
}
