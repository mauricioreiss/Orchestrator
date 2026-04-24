import { create } from "zustand";

interface AuthStore {
  isAuthenticated: boolean;
  enter: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: sessionStorage.getItem("os-auth") === "true",

  enter: () => {
    sessionStorage.setItem("os-auth", "true");
    set({ isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem("os-auth");
    set({ isAuthenticated: false });
  },
}));
