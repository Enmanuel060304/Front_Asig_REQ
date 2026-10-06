# Asignación REQ

Aplicación web (con capacidades PWA, instalable en escritorio) para controlar la **asignación de retiro de equipos**:
valida los insumos del periodo (Bajas y Cambio de tecnología), ejecuta y monitorea la Mora, genera la asignación en
SQL Server y permite programar los procesos largos desde la web.

| Carpeta | Contenido | Documentación |
|---|---|---|
| `backend/` | FastAPI + pyodbc: API, ejecutor de procesos, planificador, autenticación | [backend/README.md](backend/README.md) |
| `frontend/` | React + Vite + Tailwind + shadcn (`dashboard-01`), driver.js, PWA | [frontend/README.md](frontend/README.md) |

---

## Contexto del negocio

La **asignación** es una base de equipos que deben retirarse y que se envía a **empresas contratistas** para que
hagan el retiro. Se genera **una vez al mes** con un stored procedure en SQL Server (`SP_ASIGNACION`).

Ese SP depende de **3 insumos** que deben estar listos antes de ejecutarlo:

| Insumo | De dónde sale | Cómo se valida | Si no está listo |
|---|---|---|---|
| **Bajas** | Una BD externa (linked server). Un SP de extracción la trae a una tabla | La tabla debe tener datos del **periodo del mes anterior** | Ejecutar el SP de extracción (`SP_EXTRAER_BAJAS`) y revalidar |
| **Cambio de tecnología** | Mismo servidor que Bajas, con su propio SP de extracción | Igual: periodo del mes anterior | Ejecutar `SP_EXTRAER_CAMBIO_TEC` y revalidar |
| **Mora** | SP propio (`SP_MORA`, **~40 min**) que **trunca** una tabla e inserta los datos nuevos | El SP de mora terminó OK en el mes actual y la tabla tiene filas | Ejecutar (o programar) la mora |

### Periodos

- Formato `YYYYMM`: los 4 primeros dígitos son el año y los 2 últimos el mes (`202609` = septiembre 2026).
- **Periodo de la asignación** = mes en curso (ej. octubre 2026 → `202610`).
- **Periodo de los insumos** = mes anterior al de la asignación (→ `202609`).
- Todo lo que registra la app (procesos, validaciones, bitácora) se agrupa por el periodo de la asignación.

### Flujo del periodo

```
① Bajas ──┐
② Cambio de tecnología ──┼──► ④ Asignación ──► ⑤ Equipos sin asignar ──► ⑥ Completar ──► Excel para las empresas
③ Mora (~40 min) ──┘
```

1. Al abrir **Control de asignación** se validan los insumos que aún no se validaron en el periodo.
2. Si un insumo no tiene el periodo esperado → **Extraer del servidor** (o programar la extracción).
3. Ejecutar o programar la **Mora**.
4. Cuando los 3 insumos están OK se habilita **Generar asignación**.
5. **Equipos sin asignar**: el SP deja la agencia en `NULL` cuando los datos del equipo no cuadran (p. ej. un barrio
   que no pertenece al municipio registrado). Aquí se listan y el usuario les asigna una agencia a mano, uno a uno o
   varios a la vez, eligiendo del catálogo de agencias (tabla SQL, siempre las vigentes). Revisa **toda** la tabla
   de asignación (lo nuevo y lo pendiente de periodos anteriores).
6. **Completar asignación**: cuando no queda ningún equipo sin agencia se puede completar (cerrar) el periodo y
   entonces **Exportar a Excel** toda la tabla de asignación.
7. Todo queda en la **bitácora del periodo** y en el historial del Dashboard.

### Reglas de negocio

- **Un solo proceso a la vez** (extracción, mora o asignación). La asignación lee las tablas que los otros procesos
  truncan/cargan, por eso nunca se pisan. Si ya hay uno en curso → `409`.
- **La asignación revalida los insumos en el servidor** justo antes de ejecutarse; no confía en lo que muestra la
  pantalla. Si falta algo → `422` con la lista de motivos.
- **Regenerar**: si ya hay una asignación OK en el periodo, generar otra exige confirmación reforzada (`regenerar=true`).
- **Variación de filas**: si un insumo varía más de `VARIACION_ALERTA_PCT` (30% por defecto) respecto al periodo
  anterior, queda en **Advertencia**. No bloquea, solo avisa.
- **Mora OK** = el último proceso de mora del periodo terminó OK y la tabla de mora tiene filas.
- **Extracciones programadas**: si al llegar la hora el insumo **ya** tiene el periodo correcto, la extracción se
  **omite** (no se recarga un insumo válido) y la tarjeta muestra "Último disparo: Omitida…". Decisión del negocio.
- **Asignación manual de agencia**: solo se actualizan equipos que siguen con agencia `NULL` (no se pisa lo que
  asignó otro usuario) y solo con agencias que existen en el catálogo (se valida en el servidor). **Se pierde al
  regenerar** la asignación — decisión del negocio; la confirmación de *Regenerar* lo advierte. No se puede asignar
  mientras corre un proceso (`409`).
- **Completar (cierre del periodo)**: exige asignación OK en el periodo, **0 equipos sin agencia** y ningún proceso
  en curso (se revalida en el servidor → `422` con motivos). Con el periodo completado se bloquean la asignación
  manual y *Regenerar* (`409`); se puede **Reabrir** con confirmación. La exportación solo funciona con el periodo
  completado.
- **Excel**: una hoja con `SELECT *` de la tabla de asignación completa (ya viene trabajada por el SP: lo nuevo + los
  pendientes de periodos anteriores), columnas tal cual. Cada exportación queda en bitácora.
- **Programaciones vencidas**: si no pudieron ejecutarse dentro de `PROGRAMACION_TOLERANCIA_MIN` (120 min por
  defecto) — servidor apagado u otro proceso en curso — se registran como no ejecutadas.

---

## Requisitos

- Node 20+
- Python 3.11+
- [ODBC Driver 18 for SQL Server](https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server)

## Configuración

1. **Variables de entorno** — copia `backend/.env.example` a `backend/.env` y completa (cada variable está documentada ahí):
   - **Conexión**: `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - **Insumos** (Bajas y Cambio de tecnología): tabla donde se valida el periodo, columna del periodo (`YYYYMM`)
     y SP de extracción (opcionalmente con parámetro de periodo, p. ej. `@Periodo`)
   - **Mora**: `SP_MORA` y `MORA_TABLA`
   - **Asignación**: `SP_ASIGNACION`; y para el paso 5, la tabla que llena (`ASIGNACION_TABLA`), su columna
     identificadora, la de agencia y las columnas a mostrar (se usa la tabla completa, también para el Excel)
   - **Agencias**: `AGENCIAS_TABLA` (puede ser una vista que filtre las activas), columna del valor que se escribe y
     columna del nombre visible
   - **Programación**: `APP_TIMEZONE` y `PROGRAMACION_TOLERANCIA_MIN`
   - `JWT_SECRET` — secreto largo y aleatorio (`python -c "import secrets; print(secrets.token_urlsafe(64))"`)
   - `COOKIE_SECURE=true` en producción (HTTPS)

   Si falta una variable o un nombre SQL no es válido, el backend no arranca e indica cuál.

2. **Tablas de la app** — ejecuta en la base de datos, en orden:
   - `backend/sql/001_tablas_app.sql` (usuarios)
   - `backend/sql/002_control.sql` (procesos, validaciones, bitácora y programaciones)
   - `backend/sql/003_cierre.sql` (periodos completados)

   El usuario SQL necesita leer las tablas de insumos (también vía linked server) y ejecutar los SPs de extracción,
   mora y asignación; además `SELECT` en el catálogo de agencias y `SELECT`/`UPDATE` en la tabla de la asignación
   (paso 5). Para ver el detalle en vivo de la sesión SQL mientras corre un proceso necesita además
   `VIEW SERVER STATE` (opcional).

3. **Backend**
   ```bash
   cd backend
   python -m venv .venv
   .venv/Scripts/python -m pip install -r requirements.txt
   .venv/Scripts/python -m scripts.create_user <usuario>   # crea un usuario
   ```

4. **Frontend**
   ```bash
   npm install
   ```

## Desarrollo

En dos terminales:

```bash
npm run dev:back    # FastAPI en http://localhost:8000 (docs en /docs)
npm run dev:front   # Vite en http://localhost:5173 (proxy /api → :8000)
```

## Modo demo (sin SQL Server)

Para presentar o probar la app sin base de datos ni ODBC:

```bash
npm run demo        # compila el front, levanta todo en :8000 y abre el navegador (una sola terminal)
```

Para desarrollar el front con recarga en caliente: `npm run dev:demo` + `npm run dev:front` (en otra terminal) y abrir `:5173`.

Usuario **`demo`** / contraseña **`demo`**. Usa `backend/.env.demo` (no hace falta `backend/.env`) y muestra la
etiqueta **Modo demo** en el header.

- **Qué está simulado**: todo lo que toca SQL (`backend/app/repo_demo.py` reemplaza a `repo.py` con `DEMO_MODE=true`).
  Los SPs "tardan" segundos (extracción ~5 s, mora ~20 s, asignación ~5 s; constantes `PAUSA` en `repo_demo.py`).
- **Punto de partida**: Bajas está en el periodo anterior (Error → hay que extraer; al extraer queda en *Advertencia*
  por la variación), Cambio de tecnología está OK y la Mora vacía. La asignación genera 60 equipos, 14 sin agencia.
- La lógica real (un proceso a la vez, revalidaciones, completar, Excel, programaciones) corre igual sobre ese estado.
- El estado vive en memoria: se reinicia al reiniciar el backend. No usar en producción.

## Producción

```bash
npm run build       # genera frontend/dist
npm start           # FastAPI sirve la API y el frontend en :8000
```

**Importante**: los procesos largos y las programaciones corren dentro del backend, así que debe ejecutarse como **servicio permanente** (p. ej. servicio de Windows con NSSM) y con **un solo worker** de uvicorn. Si el servidor se reinicia con un proceso en curso, ese proceso queda marcado como interrumpido.

Sirve detrás de HTTPS (IIS/nginx) para que la PWA sea instalable y las cookies `Secure` funcionen.
En Chrome/Edge aparece el ícono **Instalar app** en la barra de direcciones (o la opción "Instalar app" en el menú lateral).

## Seguridad

- El token JWT viaja solo en una cookie `httpOnly; SameSite=Strict` (inaccesible desde JS).
- Los POST/PUT/PATCH/DELETE exigen el header `X-Requested-With` (protección CSRF adicional).
- Los nombres de tablas y SPs solo se leen de `.env` (validados con regex); el cliente nunca los envía.
- Cada proceso, validación y programación queda registrado en la bitácora del periodo, con el usuario.

---

## Decisiones de diseño

| Decisión | Por qué |
|---|---|
| Monorepo (npm workspaces) con `frontend/` y `backend/` | Un solo repo para versionar API y UI juntas |
| FastAPI (no Flask) | Async, validación con Pydantic, documentación OpenAPI en `/docs` |
| JWT en cookie httpOnly | El token no es accesible desde JavaScript (mitiga XSS) |
| Usuarios en tabla de SQL Server con bcrypt | No depender de AD/LDAP para el MVP |
| Procesos en hilos de fondo + estado en BD (`AppProcesos`) | La mora tarda ~40 min: no puede vivir en una petición HTTP; el estado sobrevive al cierre del navegador |
| Planificador **dentro** de la app (no SQL Server Agent) | Mismo monitoreo y bitácora que las ejecuciones manuales; no requiere permisos en `msdb`. Contra: el backend debe estar siempre encendido |
| Polling (10 s con proceso en curso, 30 s en reposo) en vez de WebSockets/SSE | Simple y suficiente para procesos de minutos |
| Web primero, PWA como mejora | Funciona por URL en cualquier navegador; además se instala como app, tiene caché de assets y avisos de nueva versión |
| `/api/*` nunca se cachea en el service worker | Los datos y la sesión siempre vienen de la red |
| Tema claro/oscuro/sistema, por defecto el del navegador | Pedido del usuario |

## Pendiente / ideas para siguientes fases

1. ~~Exportar la base a Excel y cerrar el periodo~~ (hecho: paso 6). Idea: una hoja o archivo por empresa.
2. **Encadenar la asignación**: al terminar la mora OK y validar insumos, generar automáticamente.
3. **Roles**: operador (ejecuta) vs. consulta (solo ve).
4. **Avisos por correo/Teams** al terminar procesos o detectar insumos faltantes.
5. Probar contra la BD real: llenar `.env` con los nombres reales de tablas/SPs y validar por linked server.
