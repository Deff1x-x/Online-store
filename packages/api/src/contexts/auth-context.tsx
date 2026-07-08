import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AuthManager, type AuthResponse, type LoginMode, type LoginPayload } from "../auth-manager";

export type AuthContextValue = {
  authManager: AuthManager;
  accessToken: string | null;
  login: (payload: LoginPayload, mode?: LoginMode) => Promise<AuthResponse>;
  logout: () => void;
  refresh: () => Promise<boolean>;
  setToken: (accessToken: string, refreshToken?: string) => void;
  clearToken: () => void;
  getAccessToken: () => string | null;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthProviderProps = PropsWithChildren<{
  authManager: AuthManager;
}>;

export function AuthProvider({ authManager, children }: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState(() => authManager.getAccessToken());

  useEffect(() => {
    authManager.setTokenListener(setAccessToken);
    return () => authManager.setTokenListener(undefined);
  }, [authManager]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authManager,
      accessToken,
      login: (payload, mode) => authManager.login(payload, mode),
      logout: () => authManager.logout(),
      refresh: () => authManager.refresh(),
      setToken: (token, refreshToken) => authManager.setToken(token, refreshToken),
      clearToken: () => authManager.clearToken(),
      getAccessToken: () => authManager.getAccessToken(),
    }),
    [accessToken, authManager],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
