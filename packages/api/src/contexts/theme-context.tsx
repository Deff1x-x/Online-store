import { createContext, useContext, useMemo, type PropsWithChildren } from "react";

export type ThemeName = "light";

export type ThemeContextValue = {
  theme: ThemeName;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeContextProvider({ children, theme = "light" }: PropsWithChildren<{ theme?: ThemeName }>) {
  const value = useMemo(() => ({ theme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeContextProvider");
  }
  return context;
}
