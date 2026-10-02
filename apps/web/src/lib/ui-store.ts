'use client';

import { create } from 'zustand';

type Panel = 'cart' | 'menu' | 'search' | null;

interface UiState {
  panel: Panel;
  open: (panel: Exclude<Panel, null>) => void;
  close: () => void;
}

export const useUi = create<UiState>()((set) => ({
  panel: null,
  open: (panel) => set({ panel }),
  close: () => set({ panel: null }),
}));
