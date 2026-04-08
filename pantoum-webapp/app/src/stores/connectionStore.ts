import { create } from 'zustand';

interface ConnectionStore {
  wsConnected: boolean;
  serverUptime: number | null;
  setWsConnected: (connected: boolean) => void;
  setServerUptime: (uptime: number | null) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  wsConnected: false,
  serverUptime: null,
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setServerUptime: (uptime) => set({ serverUptime: uptime }),
}));
