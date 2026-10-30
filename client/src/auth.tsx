import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { User } from "./types";

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: "CUSTOMER" | "PROVIDER";
  area?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
};

type AuthResponse = { token: string; user: User };

// A "notice board" every component can read with useAuth(), instead of passing `user` down as props.
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // With no saved token there is nothing to wait for.
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("token")));

  // On page load: is the saved token still good? The SERVER decides, via /auth/me.
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    let ignore = false;
    api<{ user: User }>("/auth/me")
      .then((data) => !ignore && setUser(data.user))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, []);

  function save({ token, user }: AuthResponse) {
    localStorage.setItem("token", token);
    setUser(user);
    return user;
  }

  const value: AuthState = {
    user,
    loading,
    login: async (email, password) => save(await api<AuthResponse>("/auth/login", { method: "POST", body: { email, password } })),
    register: async (input) => save(await api<AuthResponse>("/auth/register", { method: "POST", body: input })),
    logout: () => {
      localStorage.removeItem("token");
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
