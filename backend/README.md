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
│   ├── periodo.py       # Periodos YYYYMM, hora local (APP_TIMEZONE), próxima fecha mensual
│   ├── repo.py          # TODO el SQL: tablas de la app + objetos de negocio (SPs, insumos)
│   ├── repo_demo.py     # Misma interfaz que repo.py pero en memoria (modo demo, DEMO_MODE=true)
│   ├── insumos.py       # Definición de Bajas / Cambio de tecnología y su validación
│   ├── exportar.py      # Tabla de asignación → .xlsx (openpyxl write_only)
│   ├── procesos.py      # Ejecutor de procesos en segundo plano (un proceso a la vez)
│   ├── planificador.py  # Hilo que dispara las programaciones vencidas cada 30 s
│   └── routers/
│       ├── auth.py      # /api/auth: login, logout, me
│       └── control.py   # /api/control: estado del periodo, acciones, historial, programaciones
├── scripts/create_user.py   # Crea/actualiza un usuario (hash bcrypt)
├── scripts/demo.py          # Arranca el backend en modo demo (ENV_FILE=.env.demo) y abre el navegador
├── sql/
│   ├── 001_tablas_app.sql   # AppUsuarios
│   ├── 002_control.sql      # AppProcesos, AppValidaciones, AppBitacora, AppProgramaciones
│   └── 003_cierre.sql       # AppCierres
├── .env.example             # Plantilla documentada de configuración
├── .env.demo                # Configuración ficticia del modo demo (sí se versiona)
└── requirements.txt
```

**Regla de capas**: solo `repo.py` (y `routers/auth.py` para el login) escriben SQL. `insumos`, `procesos` y
`planificador` llaman a `repo.*`, lo que permite reemplazar `repo` por una versión en memoria para probar sin BD.

**Modo demo**: con `DEMO_MODE=true`, el final de `repo.py` hace `from .repo_demo import *` y todas las funciones
públicas pasan a operar sobre estado en memoria (procesos, validaciones, bitácora, programaciones, cierre,
asignación y agencias de ejemplo; `ejecutar_sp` simula el SP con una pausa). Incluye `usuario_hash` (login
`demo`/`demo`). Si se agrega una función pública a `repo.py`, hay que agregarla también a `repo_demo.py` (y a su
`__all__`). `GET /api/auth/config` (pública) informa `{demo}` al front. Se arranca con `npm run demo` (compila el front y lo sirve en :8000; una sola terminal) o `npm run dev:demo` (solo backend, para usar con `dev:front`)
(`ENV_FILE=.env.demo`, que también permite elegir otro archivo de entorno).

## Procesos en segundo plano (`procesos.py`)

Tipos (`TIPOS`): `EXTRAER_BAJAS`, `EXTRAER_CAMBIO_TEC`, `MORA`, `ASIGNACION`.

1. `iniciar(tipo, usuario, origen)` toma un `threading.Lock` sin bloquear y además verifica en BD que no haya
   otro proceso `EN_PROCESO`. Si lo hay → `ProcesoEnCurso` (el router responde `409`).
2. Crea la fila en `AppProcesos` y lanza un hilo daemon que:
   - registra "Inició …" en la bitácora,
   - guarda el `@@SPID` de la sesión (para ver el detalle en vivo en `sys.dm_exec_requests`),
   - ejecuta el SP (las extracciones reciben el periodo de insumos si `SP_EXTRAER_*_PARAM_PERIODO` está configurado),
   - en **MORA** cuenta las filas de `MORA_TABLA` al terminar; en el resto usa las filas que reporta el SP,
   - finaliza el proceso (`OK`/`ERROR`, duración, filas, error) y escribe en bitácora,
   - si fue una **extracción OK**, **revalida** el insumo automáticamente,
   - libera el lock.
3. Al arrancar la app (`lifespan`), `recuperar_al_iniciar()` marca como `ERROR` ("Interrumpido por reinicio del
   servidor") los procesos que quedaron `EN_PROCESO`.

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
| No hay filas del periodo → se consulta `MAX(columna)` | `ERROR` "Se esperaba 202609, la tabla tiene 202608" |
| Falla la consulta | `ERROR` "No se pudo consultar la tabla del insumo" |

Cada validación se guarda en `AppValidaciones` y en la bitácora. `es_valida()` = `OK` o `ADVERTENCIA`.

## Planificador (`planificador.py`)

Hilo daemon iniciado en `lifespan`; cada 30 s busca programaciones activas con `ProximaEjecucion <= ahora`.
Una programación por tipo (`MORA`, `EXTRAER_BAJAS`, `EXTRAER_CAMBIO_TEC`), modo `UNICA` o `MENSUAL`.

| Situación al disparar | Qué hace | `UltimoResultado` |
|---|---|---|
| Retraso > `PROGRAMACION_TOLERANCIA_MIN` | No ejecuta; avanza a la siguiente (o desactiva) | "No se ejecutó … superó la tolerancia" (warn) |
| Extracción y el insumo **ya es válido** | No ejecuta; avanza | "Omitida … el insumo ya tenía el periodo …" (info) |
| Hay otro proceso en curso | Reintenta en 5 min (conserva `VencimientoOriginal`) | "En espera desde … se reintenta cada 5 min" (warn) |
| Normal | `procesos.iniciar(..., origen="PROGRAMADO")` | "Se ejecutó el …" (ok) |

- **Mensual**: día del mes + hora; si el mes es más corto (ej. 31 en febrero) se usa el último día.
- **Única**: al dispararse queda `Activa = 0` ("ya procesada" en la UI).
- `VencimientoOriginal` guarda la hora pactada para medir la tolerancia aunque haya reintentos.
- Usuario registrado: `programador (<quien la creó>)`.

> Requiere **un solo worker** de uvicorn: con varios, cada worker tendría su propio planificador y su propio lock.

## Equipos sin agencia (paso 5)

`SP_ASIGNACION` deja `NULL` la agencia cuando los datos del equipo no cuadran. Funciones en `repo.py`:

- `sin_asignar_contar` / `sin_asignar_listar`: `WHERE {ASIGNACION_COLUMNA_AGENCIA} IS NULL` sobre **toda** la tabla
  (es lo mismo que se exporta). Columnas visibles de `ASIGNACION_COLUMNAS_VISIBLES`.
- `agencias_listar`: `AGENCIAS_COLUMNA_VALOR` / `AGENCIAS_COLUMNA_NOMBRE` de `AGENCIAS_TABLA`.
- `asignar_agencia`: `UPDATE … SET agencia = ? WHERE agencia IS NULL AND id IN (…)` en bloques de 500 ids (límite
  de ~2100 parámetros de SQL Server), una transacción. El `IS NULL` evita pisar lo que asignó otro usuario.

El router valida que la agencia exista en el catálogo y registra en bitácora cuántos equipos se actualizaron (y un
`warn` si alguno ya tenía agencia). Con el periodo completado responde `409`.

## Completar y exportar (paso 6)

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
| GET | `/api/control` | Estado completo del periodo: insumos, mora, asignación, `sin_asignar` (equipos sin agencia; `null` si no hay asignación OK), `cierre`, `bloqueos_completar`, `puede_completar`, proceso en curso (con promedio y detalle SQL), bloqueos, `puede_generar`, bitácora |
| POST | `/api/control/validar/{BAJAS\|CAMBIO_TEC}` | Valida un insumo |
| POST | `/api/control/extraer/{BAJAS\|CAMBIO_TEC}` | Inicia la extracción (202, 409 si hay proceso) |
| POST | `/api/control/mora` | Inicia la mora (202 / 409) |
| POST | `/api/control/asignacion?regenerar=` | Revalida insumos y genera (202 / 409 / 422 con `{mensaje, motivos}`) |
| GET | `/api/control/procesos?tipo=&limite=` | Historial de procesos |
| GET | `/api/control/procesos/{id}` | Un proceso |
| GET | `/api/control/resumen` | Datos del Dashboard (asignación y mora del periodo, procesos por día) |
| PUT | `/api/control/programaciones/{tipo}` | Crea/reemplaza: `{modo:"UNICA", fecha_hora}` o `{modo:"MENSUAL", dia_mes, hora:"HH:MM"}` |
| PATCH | `/api/control/programaciones/{tipo}` | `{activa}` — pausar/reanudar |
| DELETE | `/api/control/programaciones/{tipo}` | Eliminar |
| POST | `/api/control/completar` | Cierra el periodo (409 si ya está, 422 con `{mensaje, motivos}`) |
| POST | `/api/control/reabrir` | Reabre el periodo |
| GET | `/api/control/exportar` | Descarga `Asignacion_YYYYMM.xlsx` (409 si el periodo no está completado) |
| GET | `/api/control/sin-asignar` | Equipos con agencia NULL: `{columnas, filas (con _id), total}` (máx. 5000 filas) |
| GET | `/api/control/agencias` | Catálogo `[{valor, nombre}]` |
| POST | `/api/control/sin-asignar` | `{ids, agencia}` → `{actualizados}` (409 si hay proceso, 422 si la agencia no existe) |

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

Las fechas se guardan en **hora local** de `APP_TIMEZONE`, sin zona horaria. `002_control.sql` es idempotente
(`IF OBJECT_ID … IS NULL`) e incluye un `ALTER` para columnas agregadas después.

## Configuración

Ver `.env.example`: cada variable está comentada. Los nombres de tablas y SPs aceptan de 1 a 4 partes
(`dbo.Tabla` o `[LINKED_SRV].[Base].[dbo].[Tabla]`) y se validan con regex al arrancar.

## Notas técnicas

- `tzdata` está en `requirements.txt` porque Windows no trae la base de zonas horarias IANA que usa `zoneinfo`.
- Al ejecutar un SP se consumen todos sus result sets (`nextset()`) para que termine; si el SP usa `SET NOCOUNT ON`
  las filas reportadas quedan en `None` ("—" en la UI).
- `sesion_detalle()` lee `sys.dm_exec_requests`; sin el permiso `VIEW SERVER STATE` devuelve `None` sin fallar.
