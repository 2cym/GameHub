import { create } from 'zustand'

export interface ToastItem {
  id: number
  kind: 'info' | 'success' | 'error'
  text: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (text: string, kind?: ToastItem['kind']) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = nextId++
    set({ toasts: [...get().toasts, { id, kind, text }] })
    setTimeout(() => get().dismiss(id), 3200)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const toast = (text: string, kind: ToastItem['kind'] = 'info') =>
  useToast.getState().push(text, kind)
