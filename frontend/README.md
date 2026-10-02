# Frontend — Asignación REQ

React 19 + TypeScript + Vite, Tailwind v4 y shadcn (estilo `base-nova`, sobre Base UI) partiendo del bloque
**`dashboard-01`**. Es una **web** que además tiene capacidades de **PWA** (instalable en escritorio).

Contexto del negocio y reglas: ver el [README raíz](../README.md). API: ver [backend/README.md](../backend/README.md).

## Vistas

| Ruta | Vista | Qué muestra |
|---|---|---|
| (sin sesión) | `pages/Login.tsx` | Usuario y contraseña |
| `/` | `pages/Dashboard.tsx` | Cards del periodo (asignación, mora), gráfico de procesos por día, historial con filtro por tipo |
| `/control` | `pages/ControlAsignacion.tsx` | Control del periodo: los 4 pasos, bitácora y programaciones |
| `/generar` | — | Redirige a `/control` (ruta anterior) |

### Control de asignación

- **Encabezado**: mes de la asignación, periodo esperado de los insumos, estado general (*Bloqueado: motivo* /
  *Listo para generar* / *En curso* / *Asignación generada*) y barra "N de 4".
- **Pasos** (`components/control/pasos.tsx`), cada uno dentro de `Paso` (`paso.tsx`):
  1–2. **Insumos** (`PasoInsumo`): periodo encontrado, filas, variación vs. periodo anterior, quién validó.
     Botones *Revalidar*, *Extraer del servidor* y *Programar*.
  3. **Mora** (`PasoMora`): *Ejecutar mora* / *Volver a ejecutar* y *Programar*.
  4. **Asignación** (`PasoAsignacion`): deshabilitada con la lista de bloqueos; *Generar* o *Regenerar*.
- **Proceso en curso** (`proceso-progreso.tsx`): cronómetro, barra estimada con el promedio de las últimas 5
  corridas OK, fin estimado y estado de la sesión SQL.
- **Programación** (`programacion.tsx`): diálogo *Una vez* (fecha y hora) / *Cada mes* (día y hora), y la línea
  con la próxima ejecución, el **último disparo** (ejecutada, omitida, en espera, fuera de tolerancia) y las
  acciones pausar/reanudar/eliminar.
- **Bitácora** (`bitacora.tsx`).
- Al entrar se validan automáticamente los insumos que aún no tienen validación en el periodo.

## Estructura

```
src/
├── App.tsx                    # ThemeProvider + Router + AuthProvider + rutas
├── auth/AuthContext.tsx       # Sesión vía /api/auth/me; login/logout
├── lib/
│   ├── api.ts                 # fetch con credentials + X-Requested-With; tipos de la API; ApiError(status, motivos)
│   └── formato.ts             # nombrePeriodo, fmtFecha, fmtDuracion, NOMBRE_PROCESO…
├── hooks/use-control.ts       # Estado de /api/control con polling y avisos al terminar un proceso
├── pages/                     # Login, Dashboard, ControlAsignacion
├── components/
│   ├── control/               # Pasos, progreso, programación, bitácora, badges, ConfirmarAccion
│   ├── app-layout.tsx         # Sidebar + header + <Outlet/>; dispara el tour la primera vez
│   ├── app-sidebar.tsx, nav-*.tsx, site-header.tsx, mode-toggle.tsx   # adaptados de dashboard-01
│   ├── section-cards.tsx, chart-area-interactive.tsx, data-table.tsx  # adaptados de dashboard-01
│   └── ui/                    # Componentes shadcn (generados por la CLI)
├── pwa/                       # Registro del service worker y prompt de instalación
└── tour/tour.ts               # Recorrido guiado con driver.js
```

## Comportamientos clave

- **Polling** (`use-control.ts`): cada 10 s si hay un proceso en curso, 30 s si no. Al detectar que un proceso
  terminó, muestra un toast y, si la pestaña está oculta y hay permiso, una **notificación del sistema**. El permiso
  se pide al lanzar un proceso.
- **Reloj del servidor**: el backend devuelve `ahora` y el hook calcula el desfase para que los cronómetros usen la
  hora del servidor.
- **Confirmaciones** (`control/confirmar-accion.tsx`): todo proceso o borrado pide confirmación. Cerrar sesión
  también (`nav-user.tsx`).
- **Tema**: `next-themes` con `defaultTheme="system"` (sigue al navegador) y selector Claro/Oscuro/Sistema en el header.
- **Tour** (`tour/tour.ts`): se lanza solo la primera vez (`localStorage`) y desde *Ayuda*. Solo muestra los pasos
  cuyos elementos existen en la vista actual. Los anclajes son ids `tour-*` en los componentes.

## PWA

- `vite-plugin-pwa` con `registerType: 'prompt'`: al haber una versión nueva aparece un toast con *Actualizar*.
- Manifest con `display: standalone` e íconos generados desde `public/logo.svg`
  (`npx pwa-assets-generator --preset minimal-2023 public/logo.svg`).
- El service worker precachea los assets; **`/api/*` es `NetworkOnly`** (nunca se cachean datos ni la sesión).
- `devOptions.enabled: true`: el SW también funciona con `npm run dev` para probar la instalación.
- Botón *Instalar app* en el sidebar vía `beforeinstallprompt` (`pwa/use-install-prompt.ts`).
- En producción la instalación requiere HTTPS (en `localhost` funciona sin HTTPS).

## Desarrollo

```bash
npm run dev      # http://localhost:5173, proxy /api → http://localhost:8000
npm run build    # tsc -b + vite build → dist/ (lo sirve FastAPI en producción)
npm run lint     # oxlint
```

Agregar componentes shadcn: `npx shadcn@latest add <componente>`.

## Cosas a saber (gotchas)

- **`AlertDialogAction` no cierra el diálogo**: en el estilo `base-nova` es un `Button` normal; solo
  `AlertDialogCancel` cierra. Por eso `ConfirmarAccion` y `NavUser` controlan `open` y lo cierran al confirmar.
- **`cn` viene del paquete `cn`** (oficial de shadcn, `import { cn } from "cn"`), no de `@/lib/utils`.
- **TanStack Table v9**: la API usa `useTable` + `tableFeatures(...)` (no `useReactTable`).
- **Error 504 "Outdated Optimize Dep"**: pasa si se instala una dependencia con Vite corriendo o quedó un Vite viejo
  vivo en el puerto. Cerrar todos los procesos de Vite y arrancar con `npx vite --force`.
- **Aviso "Encountered a script tag…"** en consola: viene de `next-themes` con React 19; es inofensivo.
