import { create } from 'zustand'

/** State of the server-sent events connection, shown on the Settings page. */
export type LiveStatus = 'connecting' | 'connected' | 'disconnected'

interface LiveState {
  status: LiveStatus
  setStatus: (status: LiveStatus) => void
}

export const useLiveStore = create<LiveState>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}))
