import { createContext, useContext, type ReactNode } from 'react'
import type {
  TerminalEvent,
  TerminalRequest,
  TerminalResponse,
} from '@/base/protocol'

export type TerminalApi = {
  request(request: TerminalRequest): Promise<TerminalResponse>
  onEvent(callback: (event: TerminalEvent) => void): () => void
}

const TerminalApiContext = createContext<TerminalApi | null>(null)

export function TerminalApiProvider({
  api,
  children,
}: {
  api: TerminalApi
  children: ReactNode
}) {
  return (
    <TerminalApiContext.Provider value={api}>
      {children}
    </TerminalApiContext.Provider>
  )
}

export function useTerminalApi(): TerminalApi {
  const api = useContext(TerminalApiContext)
  if (!api) {
    throw new Error(
      'useTerminalApi must be used inside a TerminalApiProvider. ' +
        'Wrap your app with <TerminalApiProvider api={...}>.',
    )
  }
  return api
}
