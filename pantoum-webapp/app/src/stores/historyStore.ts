import { create } from 'zustand';
import type { HistoryEntry } from '@shared/types/History';

export type SortField = 'timestamp' | 'solutions' | 'run' | 'version' | 'duration';

interface HistoryStore {
  entries: HistoryEntry[];
  total: number;
  page: number;
  loading: boolean;
  activeEntries: HistoryEntry[];
  search: string;
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';

  fetchHistory: (page?: number, limit?: number) => Promise<void>;
  setSearch: (search: string) => void;
  setSort: (field: SortField) => void;
  setActiveEntries: (entries: HistoryEntry[]) => void;
  deleteEntry: (runId: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  entries: [],
  total: 0,
  page: 1,
  loading: false,
  activeEntries: [],
  search: '',
  sortBy: 'timestamp',
  sortOrder: 'desc',

  fetchHistory: async (page = 1, limit = 10) => {
    set({ loading: true });
    try {
      const { search, sortBy, sortOrder } = get();
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortOrder,
      });
      if (search) params.set('search', search);
      const res = await fetch(`/api/history?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ entries: data.entries, total: data.total, page, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setSearch: (search: string) => {
    set({ search });
    // Reset to page 1 and re-fetch
    get().fetchHistory(1);
  },

  setSort: (field: SortField) => {
    const { sortBy, sortOrder } = get();
    if (sortBy === field) {
      // Toggle order
      set({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sortBy: field, sortOrder: field === 'timestamp' ? 'desc' : 'asc' });
    }
    get().fetchHistory(1);
  },

  setActiveEntries: (entries) => set({ activeEntries: entries }),

  deleteEntry: async (runId: string) => {
    try {
      const res = await fetch(`/api/history/${runId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { page } = get();
      await get().fetchHistory(page);
    } catch {
      // Best effort
    }
  },

  clearAll: async () => {
    try {
      const res = await fetch('/api/history', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({ entries: [], total: 0, page: 1, search: '' });
    } catch {
      // Best effort
    }
  },
}));
