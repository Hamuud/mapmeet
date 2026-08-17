import { create } from 'zustand';

import type { EventFilter } from '@/types';

/** An inclusive day range, both 'YYYY-MM-DD'. Null when the viewer has
 *  not picked one. */
export type DateRange = { from: string; to: string } | null;

type FiltersState = {
  query: string;
  filter: EventFilter;
  /** Only meaningful while `filter === 'dates'`. Kept when the viewer
   *  switches away and back, so "next weekend" survives a detour through
   *  Today. */
  dateRange: DateRange;
  setQuery: (query: string) => void;
  setFilter: (filter: EventFilter) => void;
  setDateRange: (range: DateRange) => void;
  reset: () => void;
};

export const useFiltersStore = create<FiltersState>((set) => ({
  query: '',
  filter: 'all',
  dateRange: null,
  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
  setDateRange: (dateRange) => set({ dateRange }),
  reset: () => set({ query: '', filter: 'all', dateRange: null }),
}));
