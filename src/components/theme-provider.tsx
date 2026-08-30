"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => {},
});

export const THEME_STORAGE_KEY = "settlemate-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
        if (stored === "dark" || stored === "light" || stored === "system") {
          return stored;
        }
      }
    } catch {
      // Storage unavailable
    }
    return "dark";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  // Update resolvedTheme and document class whenever theme changes
  useEffect(() => {
    function applyTheme(targetTheme: Theme) {
      const root = document.documentElement;
      let effective: "dark" | "light" = "dark";

      if (targetTheme === "system") {
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        effective = systemDark ? "dark" : "light";
      } else {
        effective = targetTheme;
      }

      setResolvedTheme(effective);

      if (effective === "dark") {
        root.classList.add("dark");
        root.classList.remove("light");
        root.style.colorScheme = "dark";
      } else {
        root.classList.remove("dark");
        root.classList.add("light");
        root.style.colorScheme = "light";
      }
    }

    applyTheme(theme);

    // If system mode, listen for OS color scheme changes
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Storage unavailable
    }
  };

  const contextValue = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
