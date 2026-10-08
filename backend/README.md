# Backend — Asignación REQ

FastAPI + pyodbc sobre SQL Server. Expone la API, ejecuta los SPs largos en segundo plano, dispara las
programaciones y, en producción, sirve el build del frontend (`frontend/dist`) en el mismo origen.

Contexto del negocio y reglas: ver el [README raíz](../README.md).

## Estructura

```
backend/
├── app/
│   ├── main.py          # App FastAPI, CORS, lifespan (recupera procesos + arranca planificador), sirve el SPA
│   ├── config.py        # Settings desde .env (pydantic-settings); valida nombres SQL con regex
│   ├── db.py            # Conexión pyodbc (ODBC Driver 18, usuario/contraseña SQL)
│   ├── security.py      # bcrypt, JWT en cookie httpOnly, get_current_user, require_csrf_header
│   ├── periodo.py       # Periodos YYYYMM, hora local (APP_TIMEZONE), próxima fecha mensual; desfase de la demo
│   ├── repo.py          # TODO el SQL: tablas de la app + objetos de negocio (SPs, insumos)
│   ├── repo_demo.py     # Misma interfaz que repo.py pero en memoria (modo demo, DEMO_MODE=true)
│   ├── insumos.py       # Definición de Bajas / Cambio de tecnología y su validación
│   ├── exportar.py      # Tabla de asignación → .xlsx (openpyxl write_only)
│   ├── procesos.py      # Ejecutor en segundo plano (una operación a la vez) y flujo extraer (en paralelo) + generar
│   ├── planificador.py  # Hilo que dispara las programaciones vencidas cada 30 s
│   └── routers/
│       ├── auth.py      # /api/auth: login, logout, me
│       ├── control.py   # /api/control: estado del periodo, acciones, historial, programaciones
│       └── demo.py      # /api/demo: siguiente periodo (solo se incluye con DEMO_MODE=true)
├── scripts/create_user.py   # Crea/actualiza un usuario (hash bcrypt)
├── scripts/demo.py          # Arranca el backend en modo demo (ENV_FILE=.env.demo) y abre el navegador
├── sql/
│   ├── 001_tablas_app.sql   # AppUsuarios
│   ├── 002_control.sql      # AppProcesos, AppValidaciones, AppBitacora, AppProgramaciones
│   ├── 003_cierre.sql       # AppCierres
│   └── 004_asignaciones_manuales.sql  # AppAsignacionesManuales
├── .env.example             # Plantilla documentada de configuración
├── .env.demo                # Configuración ficticia del modo demo (sí se versiona)
└── requirements.txt
```

**Regla de capas**: solo `repo.py` escribe SQL (también el login, con `repo.usuario_hash`). Los routers, `insumos`,
`procesos` y `planificador` llaman a `repo.*`, lo que permite reemplazar `repo` por una versión en memoria para probar
sin BD.

**Modo demo**: con `DEMO_MODE=true`, el final de `repo.py` hace `from .repo_demo import *` y todas las funciones
públicas pasan a operar sobre estado en memoria (procesos, validaciones, bitácora, programaciones, cierre,
asignación y agencias de ejemplo; `ejecutar_sp` simula el SP con una pausa). Incluye `usuario_hash` (login
`demo`/`demo`). Si se agrega una función pública a `repo.py`, hay que agregarla también a `repo_demo.py` (y a su
`__all__`). `GET /api/auth/config` (pública) informa `{demo}` al front. Se arranca con `npm run demo` (compila el front y lo sirve en :8000; una sola terminal) o `npm run dev:demo` (solo backend, para usar con `dev:front`)
(`ENV_FILE=.env.demo`, que también permite elegir otro archivo de entorno).

**Siguiente periodo (demo)**: `periodo.py` guarda un desfase de meses en memoria (`_meses_simulados`, siempre 0 en
producción) que solo suma `periodo_actual()`; `ahora()` y las fechas siguen siendo reales para no desfasar
cronómetros, planificador ni "Procesos por día". `POST /api/demo/siguiente-periodo` lo avanza (409 si
`procesos.ocupado()`). Fuera del periodo real, `repo_demo.ejecutar_sp` usa `random.Random(f"{periodo}-{clave}")`:
Bajas y Cambio de tecnología varían sobre el periodo anterior (a veces más del umbral); la Mora y los equipos sobre
el último proceso OK de un periodo anterior (`_filas_previas`), sin superarlo; los sin agencia sobre los asignados a
mano del periodo anterior (`_manuales_previos`), con algún salto.

## Procesos en segundo plano (`procesos.py`)

Tipos (`TIPOS`): `EXTRAER_BAJAS`, `EXTRAER_CAMBIO_TEC`, `MORA`, `ASIGNACION`.

1. `iniciar(tipo, usuario, origen)` toma un `threading.Lock` sin bloquear y además verifica en BD que no haya
   otro proceso `EN_PROCESO`. Si lo hay → `ProcesoEnCurso` (el router responde `409`).
2. Crea la fila en `AppProcesos` y lanza un hilo daemon que:
   - registra "Inició …" en la bitácora,
   - guarda el `@@SPID` de la sesión (para ver el detalle en vivo en `sys.dm_exec_requests`),
   - ejecuta el SP (las extracciones reciben el periodo de insumos si `SP_EXTRAER_*_PARAM_PERIODO` está configurado),
   - en **MORA** cuenta las filas de `MORA_TABLA` al terminar y en **ASIGNACION** las de `ASIGNACION_TABLA` (toda la
     base, lo mismo que se exporta; así no depende de `SET NOCOUNT`); en las extracciones usa las filas que reporta el SP,
   - finaliza el proceso (`OK`/`ERROR`, duración, filas, error) y escribe en bitácora,
   - si fue una **extracción OK**, **revalida** el insumo automáticamente,
   - libera el lock.
3. Al arrancar la app (`lifespan`), `recuperar_al_iniciar()` marca como `ERROR` ("Interrumpido por reinicio del
   servidor") los procesos que quedaron `EN_PROCESO`.

### Flujo "Extraer y generar asignación" (pasos 1 y 2)

`procesos.iniciar_secuencia(usuario, origen)` toma el lock (o `ProcesoEnCurso` → 409), comprueba que el periodo no
esté completado (`PeriodoCerrado` → 409) y que haya algo por hacer (`NadaPorHacer` → 409 si los 3 insumos están
listos y la asignación ya está generada), y lanza `_ejecutar_flujo` en un hilo que **retiene el lock hasta el final**
(`procesos.ocupado()` = lock tomado o proceso en curso; lo usan la asignación, la asignación manual y la demo):

1. `_pendientes`: revalida Bajas y Cambio de tecnología contra su tabla y mira la mora por su proceso; los vigentes se
   **omiten** (queda en bitácora).
2. `_extraer_en_paralelo`: crea una fila en `AppProcesos` por pendiente y los corre **a la vez** con
   `ThreadPoolExecutor(max_workers=3)`, cada uno con `_correr` (el mismo código que un proceso suelto; cada llamada a
   `repo` abre su conexión, así que es seguro en paralelo). `wait()` espera a **todos**: también a Cambio de
   tecnología, porque si su extracción falla bloquea (igual termina mucho antes que la mora, que domina el tiempo).
3. `_motivos_flujo`: si una extracción del flujo falló, el motivo es "La extracción de X falló: <error>" (o "La mora
   falló: …"); el resto sale de `insumos.bloqueos_generar` (Bajas válida, Cambio de tecnología válida o vacía, Mora OK
   con filas; la Advertencia no bloquea). Con motivos → bitácora `error` "Flujo detenido: no se generó la asignación.
   …" y termina.
4. Sin motivos: si ya hay una asignación OK en el periodo no la rehace (bitácora: usa *Regenerar*); si no, crea el
   proceso `ASIGNACION` y lo corre con `_correr` en el mismo hilo, **solo** (lee las tablas que cargan los otros).

El estado en vuelo sale en `GET /api/control` como `secuencia = {fase: "EXTRACCION"|"ASIGNACION", actuales: [tipos]}`
y `en_curso` es la **lista** de procesos `EN_PROCESO` (`repo.procesos_en_curso()`).

Las extracciones y la mora sueltas (`/extraer/{insumo}`, `/mora`) no tienen dependencias (cualquiera en cualquier
orden) pero siguen siendo de a una; no generan la asignación: si con ellas los insumos quedan listos,
`_avisar_si_listo` lo deja en bitácora y el estado devuelve `listo_para_generar`.

Timeouts por tipo: `EXTRACCION_TIMEOUT_SECONDS`, `MORA_TIMEOUT_SECONDS`, `ASIGNACION_TIMEOUT_SECONDS` (`0` = sin límite).

## Validación de insumos (`insumos.py`)

`validar(clave, usuario)` para `BAJAS` o `CAMBIO_TEC`:

```sql
SELECT {columna}, COUNT(*) FROM {tabla} WHERE {columna} IN (?, ?) GROUP BY {columna}
-- con el periodo esperado (mes anterior) y el previo, para calcular la variación
```

| Resultado | Estado |
|---|---|
| Hay filas del periodo esperado y la variación ≤ `VARIACION_ALERTA_PCT` | `OK` |
| Hay filas pero la variación es mayor | `ADVERTENCIA` (válido, no bloquea) |
| No hay filas del periodo, el insumo es `opcional_si_vacio` (Cambio de tecnología) y su última extracción del periodo terminó OK | `OK` "Sin cambio de tecnología en el periodo 202609 (0 filas)" |
| No hay filas del periodo (resto de casos) → se consulta `MAX(columna)` | `ERROR` "Se esperaba 202609, la tabla tiene 202608" |
| Falla la consulta | `ERROR` "No se pudo consultar la tabla del insumo" |

Cada validación se guarda en `AppValidaciones` y en la bitácora. `es_valida()` = `OK` o `ADVERTENCIA`. El "vacío
permitido" exige una extracción OK en el periodo para no confundir "aún no se extrajo" con "el mes no trae datos".

## Planificador (`planificador.py`)

Hilo daemon iniciado en `lifespan`; cada 30 s busca programaciones activas con `ProximaEjecucion <= ahora`.
Una programación por tipo (`MORA`, `EXTRAER_BAJAS`, `EXTRAER_CAMBIO_TEC` e `INSUMOS` = el flujo completo, generación incluida), modo `UNICA` o `MENSUAL`.

| Situación al disparar | Qué hace | `UltimoResultado` |
|---|---|---|
| Retraso > `PROGRAMACION_TOLERANCIA_MIN` | No ejecuta; avanza a la siguiente (o desactiva) | "No se ejecutó … superó la tolerancia" (warn) |
| Extracción suelta y el insumo **ya es válido** | No ejecuta; avanza | "Omitida … el insumo ya tenía el periodo …" (info) |
| `INSUMOS` con todo listo y la asignación generada | No ejecuta; avanza | "Omitida … la asignación ya estaba generada" (info) |
| `INSUMOS` con el periodo completado | No ejecuta; avanza | "No se ejecutó … la asignación del periodo está completada" (warn) |
| Hay otro proceso en curso | Reintenta en 5 min (conserva `VencimientoOriginal`) | "En espera desde … se reintenta cada 5 min" (warn) |
| Normal | `procesos.iniciar(...)` o, para `INSUMOS`, `procesos.iniciar_secuencia(...)` con `origen="PROGRAMADO"` | "Se ejecutó el …" (ok) |

- **Mensual**: día del mes + hora; si el mes es más corto (ej. 31 en febrero) se usa el último día.
- **Única**: al dispararse queda `Activa = 0` ("ya procesada" en la UI).
- `VencimientoOriginal` guarda la hora pactada para medir la tolerancia aunque haya reintentos.
- Usuario registrado: `programador (<quien la creó>)`.

> Requiere **un solo worker** de uvicorn: con varios, cada worker tendría su propio planificador y su propio lock.

## Equipos sin agencia (paso 3)

`SP_ASIGNACION` deja `NULL` la agencia cuando los datos del equipo no cuadran. Funciones en `repo.py`:

- `sin_asignar_contar` / `sin_asignar_listar`: `WHERE {ASIGNACION_COLUMNA_AGENCIA} IS NULL` sobre **toda** la tabla
  (es lo mismo que se exporta). Columnas visibles de `ASIGNACION_COLUMNAS_VISIBLES`.
- `agencias_listar`: `AGENCIAS_COLUMNA_VALOR` / `AGENCIAS_COLUMNA_NOMBRE` de `AGENCIAS_TABLA`.
- `asignar_agencia(ids, agencia, periodo, usuario)`: en bloques de 500 ids (límite de ~2100 parámetros de SQL
  Server), una transacción. Primero lee (`UPDLOCK`) los equipos que **siguen con agencia `NULL` o ya se asignaron a
  mano en el periodo con otra agencia**; solo esos se actualizan (lo que puso el SP no se pisa) y cada cambio se
  inserta en `AppAsignacionesManuales` con la agencia anterior.
- `asignados_manual_listar`: equipos con asignación manual en el periodo (con `_agencia` actual), para corregirlos.
- `asignaciones_reaplicar(periodo)`: tras **regenerar**, `procesos.py` la llama antes de marcar el proceso como
  terminado: pone la última agencia manual de cada equipo que el SP dejó en `NULL` y devuelve
  `(reaplicadas, total)`; el resto (el SP ya les asignó agencia o ya no están) se informa en bitácora.

El router valida que la agencia exista en el catálogo y registra en bitácora cuántos equipos se actualizaron (y un
`warn` si alguno no cambió). Con el periodo completado responde `409`.

## Histórico del Dashboard

`repo.historico_periodos(desde)` devuelve por periodo (de la asignación): filas de Bajas y Cambio de tecnología (última
validación `OK`/`ADVERTENCIA` en `AppValidaciones`, con su `FilasPeriodoAnterior` y su `Estado`), de la mora y de la
asignación (último proceso `OK` en `AppProcesos`) y equipos asignados a mano (`COUNT(DISTINCT EquipoId)` de
`AppAsignacionesManuales`). Usa solo los registros de la app: los periodos anteriores a su puesta en marcha no
aparecen.

`GET /resumen` lo devuelve en `historico` (12 periodos seguidos, `null` donde no hay dato), con la variación calculada
en el back (`_historico` en `routers/control.py`):

- **Bajas / Cambio de tecnología**: `{x}_variacion` = la de su validación (contra el periodo previo de la tabla de
  origen) y `{x}_alerta` = la validación quedó en `ADVERTENCIA`. Coincide siempre con lo que se vio en Control,
  aunque falten periodos en el histórico.
- **Mora**: no se valida; se compara con el último periodo anterior que tenga mora (salta los huecos) y
  `mora_alerta` = la variación supera `VARIACION_ALERTA_PCT`. Es solo informativa.

## Generar la asignación

`insumos.bloqueos_generar` concentra las reglas (validaciones + mora) que usan el flujo, el estado y el aviso. La
generación ocurre sola al final del flujo; a mano, `POST /asignacion` (paso 2) revalida en el servidor y genera, y
con `regenerar=true` rehace una existente. `GET /api/control` devuelve `listo_para_generar` = sin bloqueos, sin
asignación OK y sin cierre (caso de extracciones sueltas o de un flujo que no llegó a generar).

## Completar y exportar (paso 4)

- `AppCierres` (una fila por periodo completado). `POST /completar` revalida con `_motivos_completar` (asignación OK,
  `sin_asignar_contar() == 0`, sin proceso en curso) → `422 {mensaje, motivos}`; `POST /reabrir` borra la fila.
- Con cierre: `POST /sin-asignar` y `POST /asignacion` → `409`.
- `exportar.py`: `openpyxl` en modo `write_only` (memoria constante). `repo.asignacion_exportar` hace
  `SELECT * FROM {ASIGNACION_TABLA}` y entrega filas en bloques de 5000. Encabezado en negrita, fila 1 congelada y
  autofiltro. Se escribe a un temporal que se borra tras enviarlo (`FileResponse` + `BackgroundTask`).

## API

Todas las rutas de `/api/control` requieren la cookie de sesión. Las de escritura exigen `X-Requested-With: XMLHttpRequest`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → pone la cookie `access_token` |
| POST | `/api/auth/logout` | Borra la cookie |
| GET | `/api/auth/me` | Usuario de la sesión (401 si no hay) |
| GET | `/api/auth/config` | Pública: `{demo}` (el front muestra la etiqueta de modo demo) |
| GET | `/api/control` | Estado completo del periodo: insumos, mora, asignación, `sin_asignar` (equipos sin agencia; `null` si no hay asignación OK), `cierre`, `bloqueos_completar`, `puede_completar`, `en_curso` (lista de procesos en curso, con promedio y detalle SQL), `secuencia` (flujo en curso: `fase` y `actuales`), `opcional_si_vacio` por insumo, `insumos_programacion`, bloqueos, `puede_generar`, `listo_para_generar`, bitácora |
| POST | `/api/control/validar/{BAJAS\|CAMBIO_TEC}` | Valida un insumo |
| POST | `/api/control/insumos/extraer` | Inicia el flujo: extrae a la vez los insumos que falten y genera la asignación si quedan válidos (202 / 409 si hay proceso, el periodo está completado o no hay nada por hacer) |
| POST | `/api/control/extraer/{BAJAS\|CAMBIO_TEC}` | Extrae solo uno, sin generar (202 / 409 si hay proceso) |
| POST | `/api/control/mora` | Ejecuta solo la mora, sin generar (202 / 409 si hay proceso) |
| POST | `/api/control/asignacion?regenerar=` | Revalida insumos y genera (202 / 409 / 422 con `{mensaje, motivos}`) |
| GET | `/api/control/procesos?tipo=&limite=` | Historial de procesos |
| GET | `/api/control/procesos/{id}` | Un proceso |
| GET | `/api/control/resumen` | Datos del Dashboard: asignación y mora del periodo, procesos por día, `historico` (12 periodos: `bajas`, `cambio_tec`, `mora` con su `_variacion` y `_alerta`; `equipos`, `manuales`) y `variacion_alerta_pct` |
| PUT | `/api/control/programaciones/{tipo}` | `tipo` = `MORA`, `EXTRAER_BAJAS`, `EXTRAER_CAMBIO_TEC` o `INSUMOS`. Crea/reemplaza: `{modo:"UNICA", fecha_hora}` o `{modo:"MENSUAL", dia_mes, hora:"HH:MM"}` |
| PATCH | `/api/control/programaciones/{tipo}` | `{activa}` — pausar/reanudar |
| DELETE | `/api/control/programaciones/{tipo}` | Eliminar |
| POST | `/api/control/completar` | Cierra el periodo (409 si ya está, 422 con `{mensaje, motivos}`) |
| POST | `/api/control/reabrir` | Reabre el periodo |
| GET | `/api/control/exportar` | Descarga `Asignacion_YYYYMM.xlsx` (409 si el periodo no está completado) |
| GET | `/api/control/sin-asignar` | Equipos con agencia NULL: `{columnas, filas (con _id), total, editables}` (máx. 5000 filas) |
| GET | `/api/control/asignados-manual` | Equipos asignados a mano en el periodo: `{columnas, filas (con _id y _agencia), total}` |
| GET | `/api/control/agencias` | Catálogo `[{valor, nombre}]` |
| POST | `/api/control/sin-asignar` | `{ids, agencia}` → `{actualizados}`: asigna o corrige (409 si hay proceso o periodo completado, 422 si la agencia no existe) |
| PATCH | `/api/control/sin-asignar/{id}` | `{valores: {columna: valor}}` → `{actualizados}`: corrige columnas de `ASIGNACION_COLUMNAS_EDITABLES` de un equipo sin agencia; queda en bitácora (409 si hay proceso o periodo completado, 404 si no existe o ya tiene agencia, 422 si la columna no es editable) |
| POST | `/api/demo/siguiente-periodo` | **Solo demo**: pasa al mes siguiente → `{periodo}` (409 si hay proceso en curso) |

Documentación interactiva en `http://localhost:8000/docs`.

## Tablas (`sql/`)

| Tabla | Contenido |
|---|---|
| `AppUsuarios` | Usuario, hash bcrypt, activo |
| `AppProcesos` | Cada ejecución: periodo, tipo, origen (`MANUAL`/`PROGRAMADO`), estado, usuario, inicio/fin, duración, filas, SPID, error |
| `AppValidaciones` | Cada validación de insumo: estado, periodo encontrado, filas, filas del periodo anterior, detalle |
| `AppBitacora` | Eventos del periodo (nivel `info`/`ok`/`warn`/`error`, mensaje, usuario) |
| `AppProgramaciones` | Una fila por tipo: modo, fecha/día/hora, activa, próxima ejecución, vencimiento original, último disparo y su resultado |
| `AppCierres` | Periodos completados: periodo, usuario, fecha (`003_cierre.sql`) |
| `AppAsignacionesManuales` | Historial de agencias asignadas a mano: periodo, equipo, agencia anterior/nueva, usuario, fecha; la vigente es la de `Id` mayor (`004_asignaciones_manuales.sql`) |

Las fechas se guardan en **hora local** de `APP_TIMEZONE`, sin zona horaria. `002_control.sql` es idempotente
(`IF OBJECT_ID … IS NULL`) e incluye un `ALTER` para columnas agregadas después.

## Configuración

Ver `.env.example`: cada variable está comentada. Los nombres de tablas y SPs aceptan de 1 a 4 partes
(`dbo.Tabla` o `[LINKED_SRV].[Base].[dbo].[Tabla]`) y se validan con regex al arrancar.

## Notas técnicas

- `tzdata` está en `requirements.txt` porque Windows no trae la base de zonas horarias IANA que usa `zoneinfo`.
- Al ejecutar un SP se consumen todos sus result sets (`nextset()`) para que termine; si un SP de **extracción** usa
  `SET NOCOUNT ON` sus filas quedan en `None` ("—" en la UI). La mora y la asignación no dependen de eso: cuentan las
  filas de su tabla al terminar.
- `sesion_detalle()` lee `sys.dm_exec_requests`; sin el permiso `VIEW SERVER STATE` devuelve `None` sin fallar.
