import { Loader2Icon } from "lucide-react"
import { ThemeProvider } from "next-themes"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AuthProvider, useAuth } from "@/auth/AuthContext"
import { AppLayout } from "@/components/app-layout"
import { Catalogo } from "@/pages/Catalogo"
import { Dashboard } from "@/pages/Dashboard"
import { ControlAsignacion } from "@/pages/ControlAsignacion"
import { Login } from "@/pages/Login"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

function Rutas() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!user) return <Login />
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="control" element={<ControlAsignacion />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="generar" element={<Navigate to="/control" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <Rutas />
          </AuthProvider>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}
