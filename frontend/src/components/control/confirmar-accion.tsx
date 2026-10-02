import * as React from "react"
import { Loader2Icon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

type Props = {
  titulo: string
  descripcion: React.ReactNode
  textoConfirmar: string
  destructiva?: boolean
  onConfirmar: () => Promise<unknown>
  children: React.ReactNode // contenido del botón disparador
} & Omit<React.ComponentProps<typeof Button>, "children" | "onClick">

/** Botón que pide confirmación antes de ejecutar una acción asíncrona. */
export function ConfirmarAccion({ titulo, descripcion, textoConfirmar, destructiva, onConfirmar, children, disabled, ...boton }: Props) {
  const [abierto, setAbierto] = React.useState(false)
  const [enviando, setEnviando] = React.useState(false)

  async function confirmar() {
    // AlertDialogAction (Base UI) no cierra el diálogo por sí solo
    setAbierto(false)
    setEnviando(true)
    try {
      await onConfirmar()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <AlertDialogTrigger render={<Button {...boton} disabled={disabled || enviando} />}>
        {enviando && <Loader2Icon className="animate-spin" />}
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant={destructiva ? "destructive" : "default"} onClick={confirmar}>
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
