import * as React from "react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/** Expone el prompt nativo de instalación de la PWA (Chrome/Edge). */
export function useInstallPrompt() {
  const [evento, setEvento] = React.useState<BeforeInstallPromptEvent | null>(null)

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setEvento(null)
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null)
  }

  return { puedeInstalar: evento !== null, instalar }
}
