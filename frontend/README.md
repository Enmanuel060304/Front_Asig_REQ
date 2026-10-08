# Frontend — Asignación REQ

React 19 + TypeScript + Vite, Tailwind v4 y shadcn (estilo `base-nova`, sobre Base UI) partiendo del bloque
**`dashboard-01`**. Es una **web** que además tiene capacidades de **PWA** (instalable en escritorio).

Contexto del negocio y reglas: ver el [README raíz](../README.md). API: ver [backend/README.md](../backend/README.md).

## Vistas

| Ruta | Vista | Qué muestra |
|---|---|---|
| (sin sesión) | `pages/Login.tsx` | Usuario y contraseña |
| `/` | `pages/Dashboard.tsx` | Cards del periodo (asignación, mora), **insumos por periodo** y **equipos asignados a mano** (últimos 12 periodos), gráfico de procesos por día, historial con filtro por tipo |
| `/control` | `pages/ControlAsignacion.tsx` | Control del periodo: los 4 pasos, bitácora y programaciones |
| `/generar` | — | Redirige a `/control` (ruta anterior) |

### Control de asignación

- **Encabezado**: mes de la asignación, periodo esperado de los insumos, estado general (*Bloqueado: motivo* /
  *Lista para generar* / *Extrayendo insumos (N en curso)* / *Generando la asignación* / *<Proceso> en curso* /
  *Pendiente: N equipo(s) sin agencia* / *Lista para completar* / *Asignación completada*) y barra "N de 4".
- **Pasos** (`components/control/pasos.tsx`), cada uno dentro de `Paso` (`paso.tsx`):
  1. **Extracción de insumos para generar asignación** (`PasoInsumos`): cabecera con **Extraer y generar
     asignación** (flujo en el servidor: extrae a la vez los que falten y, si Bajas y Mora quedan OK y Cambio de
     tecnología OK o sin datos, genera la asignación sola; si no, se detiene) y **Programar** (el mismo flujo).
     Dentro, 3 filas desplegables (`FilaInsumo`: Bajas, Cambio de tecnología, Mora) con estado, resumen, detalle,
     última ejecución y sus acciones *Extraer* / *Revalidar* / *Programar* (un insumo suelto, sin generar). Cada fila
     muestra su propia barra de progreso: puede haber 3 a la vez. La **Advertencia** se muestra como badge *OK* más un
     badge ámbar *Advertencia ▲N%* al lado (no bloquea); Cambio de tecnología vacío queda *OK · sin datos*. La fila
     con error se despliega sola.
  2. **Asignación** (`PasoAsignacion`): la genera el flujo. Deshabilitada con la lista de bloqueos; si los insumos se
     extrajeron por separado muestra *Lista para generar* y el botón *Generar asignación*. *Regenerar* avisa que las
     agencias asignadas a mano se reaplican a los equipos que sigan sin agencia.
  3. **Equipos sin asignar** (`paso-sin-asignar.tsx`): dos vistas. *Sin agencia*: tabla de equipos con agencia NULL,
     buscador, combobox de agencia por fila y barra de lote al marcar varios. *Asignados a mano*: los equipos del
     periodo asignados a mano, con la agencia actual, para **corregirlos** (*Cambiar*). Pendiente hasta que haya
     asignación; *Advertencia* "N sin agencia" o *OK*. Cuenta como hecho con 0 pendientes. Dibuja máx. 100 filas (el
     resto, con el buscador). Con el periodo completado queda en solo lectura.
  4. **Exportar asignación** (`paso-completar.tsx`): siempre muestra **Exportar a Excel** y *Reabrir*. Exportar
     está deshabilitado (con `bloqueos_completar`) hasta que se pueda completar; si el periodo no está cerrado, llama
     `api.completar` y luego `api.exportar` (fetch → blob → descarga). *Reabrir* solo se habilita con el periodo
     completado, que muestra quién/cuándo.
     Con el periodo completado, *Regenerar* del paso 2 queda deshabilitado (con el aviso "reábrela en el paso 4")
     hasta que se pulse *Reabrir*.
- **Proceso en curso** (`proceso-progreso.tsx`): cronómetro, barra estimada con el promedio de las últimas 5
  corridas OK, fin estimado y estado de la sesión SQL.
- **Programación** (`programacion.tsx`): el mismo diálogo sirve para el flujo completo (`tipo="INSUMOS"`, genera la asignación) y para cada insumo. Diálogo *Una vez* (fecha y hora, **en hora del servidor**: usa `desfaseMs` y muestra la zona `zona_horaria`; mínimo 1 minuto en el futuro, validado antes de enviar) / *Cada mes* (día y hora), y la línea
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
│   ├── chart-insumos.tsx      # Filas por periodo de Bajas / Cambio de tecnología / Mora; ámbar si supera el umbral
│   ├── chart-calidad.tsx      # % de equipos asignados a mano por periodo (sin agencia del SP)
│   └── ui/                    # Componentes shadcn (generados por la CLI)
├── pwa/                       # Registro del service worker y prompt de instalación
└── tour/tour.ts               # Recorrido guiado con driver.js
```

## Comportamientos clave

- **Polling** (`use-control.ts`): cada 10 s si hay un proceso en curso, 30 s si no. `en_curso` es una **lista**: al
  detectar que uno o varios procesos terminaron, muestra un toast por cada uno y, si la pestaña está oculta y hay
  permiso, una **notificación del sistema**. Al terminar el flujo avisa su resultado (completo o "El flujo se
  detuvo" con el motivo, tomado del último evento de la bitácora). El permiso se pide al lanzar un proceso. También
  avisa cuando `listo_para_generar` pasa a `true` (extracciones sueltas).
- **Reloj del servidor**: el backend devuelve `ahora` y el hook calcula el desfase para que los cronómetros usen la
  hora del servidor.
- **Confirmaciones** (`control/confirmar-accion.tsx`): todo proceso o borrado pide confirmación. Cerrar sesión
  también (`nav-user.tsx`).
- **Modo demo**: `AuthContext` lee `/api/auth/config`; con `demo` el login indica las credenciales y el header muestra
  la etiqueta *Modo demo* y el botón *Siguiente periodo* (`site-header.tsx`, con confirmación; recarga la página).
- **Dashboard histórico**: `historico` de `/resumen`. La variación y la alerta (ámbar) vienen calculadas del back: en
  Bajas y Cambio de tecnología son las de la validación (ámbar = quedó en *Advertencia*); en la Mora, contra la mora
  anterior y el umbral `variacion_alerta_pct`. El front no calcula nada. Un insumo a la vez porque las escalas
  son muy distintas. El ámbar es literal (`oklch`), porque los tokens `--chart-*` del tema son grises.
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
npm run demo     # (desde la raíz) build + backend demo en :8000, abre el navegador
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
- **Botones** (`components/ui/button.tsx`, modificado respecto al de shadcn): `default` = acción principal azul con
  sombra (hover: más brillo y se eleva 1 px; active: se hunde), `outline` = secundaria con borde y sombra visibles,
  `destructive` sólido (en oscuro usa el rojo del tema claro para que el texto blanco llegue a AA). `cursor-pointer`,
  tamaños más altos (`sm` 32 px, `default` 36 px) y `motion-reduce` sin desplazamientos. Regla: **un solo botón
  `default` por paso**; el resto, `outline`.
- **Ves estilos viejos tras un build**: el service worker sirve los assets precacheados; recarga forzada
  (Ctrl+Shift+R) o acepta el toast *Actualizar*.
- **Aviso "Encountered a script tag…"** en consola: viene de `next-themes` con React 19; es inofensivo.
