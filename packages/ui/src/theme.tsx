import type { PropsWithChildren } from "react";

export type ThemeProviderProps = PropsWithChildren<{
  theme?: "light";
}>;

export function ThemeProvider({ children, theme = "light" }: ThemeProviderProps) {
  return <div data-theme={theme}>{children}</div>;
}
