import { useEffect } from 'react'
import { useTerminalApi } from './terminal-api'
import { useTerminalStore } from './use-terminal-store'

/**
 * Wire the IPC event stream into the store. Mount once
 * near the root of your app, inside a TerminalApiProvider.
 */
export function TerminalEvents() {
  const api = useTerminalApi()
  const applyEvent = useTerminalStore(state => state.applyEvent)
  const setApi = useTerminalStore(state => state.setApi)

  useEffect(() => {
    setApi(api)
    return api.onEvent(event => {
      applyEvent(event)
    })
  }, [api, applyEvent, setApi])

  return null
}
