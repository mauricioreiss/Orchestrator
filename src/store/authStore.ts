import { create } from "zustand";
import { invoke, isElectron } from "../lib/electron";

interface AuthStore {
  isAuthenticated: boolean;
  hasPassword: boolean | null;
  error: string | null;
  checkHasPassword: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  createPassword: (password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: sessionStorage.getItem("os-auth") === "true",
  hasPassword: null,
  error: null,

  checkHasPassword: async () => {
    if (!isElectron()) {
      set({ hasPassword: false });
      return;
    }
    try {
      const has = await invoke<boolean>("has_master_password");
      set({ hasPassword: has });
    } catch {
      set({ hasPassword: false });
    }
  },

  login: async (password: string) => {
    if (!isElectron()) {
      sessionStorage.setItem("os-auth", "true");
      set({ isAuthenticated: true, error: null });
      return true;
    }
    try {
      const valid = await invoke<boolean>("verify_master_password", { password });
      if (valid) {
        sessionStorage.setItem("os-auth", "true");
        set({ isAuthenticated: true, error: null });
        return true;
      }
      set({ error: "Senha incorreta" });
      return false;
    } catch {
      set({ error: "Erro ao verificar senha" });
      return false;
    }
  },

  createPassword: async (password: string) => {
    if (!isElectron()) {
      sessionStorage.setItem("os-auth", "true");
      set({ isAuthenticated: true, hasPassword: true, error: null });
      return true;
    }
    try {
      await invoke("set_master_password", { password });
      sessionStorage.setItem("os-auth", "true");
      set({ isAuthenticated: true, hasPassword: true, error: null });
      return true;
    } catch {
      set({ error: "Erro ao criar senha" });
      return false;
    }
  },

  logout: () => {
    sessionStorage.removeItem("os-auth");
    set({ isAuthenticated: false, error: null });
  },
}));
