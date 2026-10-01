import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AppState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
  /** Show a toast when new mail arrives (inboxes refresh either way) */
  newMailToasts: boolean
  setNewMailToasts: (enabled: boolean) => void
}

/** Layout UI state: the desktop sidebar preference (persisted) and the mobile sidebar sheet. */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      mobileSidebarOpen: false,
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      newMailToasts: true,
      setNewMailToasts: (enabled) => set({ newMailToasts: enabled }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
      // Preferences only; the mobile sheet always starts closed
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        newMailToasts: state.newMailToasts,
      }),
    },
  ),
)
