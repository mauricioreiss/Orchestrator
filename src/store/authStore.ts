import { create } from "zustand";

interface AuthStore {
  isAuthenticated: boolean;
  login: (email: string, password: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: sessionStorage.getItem("os-auth") === "true",

  login: (_email, _password) => {
    sessionStorage.setItem("os-auth", "true");
    set({ isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem("os-auth");
    set({ isAuthenticated: false });
  },
}));
