'use client';

import { create } from 'zustand';

export interface Toast {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: Toast['tone'], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, tone, message }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 3000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string) => useToasts.getState().push('success', message),
  error: (err: unknown) =>
    useToasts.getState().push('error', err instanceof Error ? err.message : 'Something went wrong'),
};
