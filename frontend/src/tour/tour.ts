import { driver, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"

const VISTO_KEY = "tour-asignacion-visto"

// Pasos de todas las vistas; solo se muestran los que existen en la página actual
const PASOS: DriveStep[] = [
  {
    popover: {
      title: "Bienvenido a Asignación REQ",
      description: "Te mostramos rápidamente cómo usar la aplicación.",
    },
  },
  {
    element: "#tour-nav",
    popover: {
      title: "Navegación",
      description: "Cambia entre el Dashboard y el control de la asignación.",
    },
  },
  {
    element: "#tour-nav-control",
    popover: {
      title: "Control de asignación",
      description: "Extrae los insumos, genera la asignación y cierra el periodo en 4 pasos.",
    },
  },
  {
    element: "#tour-periodo",
    popover: {
      title: "Periodo",
      description: "Mes de la asignación, periodo esperado de los insumos (mes anterior) y avance de los 4 pasos.",
    },
  },
  {
    element: "#tour-insumos",
    popover: {
      title: "1. Extracción de insumos",
      description:
        "Reúne los 3 insumos de la asignación: Bajas, Cambio de tecnología y Mora. “Extraer y generar asignación” los extrae a la vez (los que ya están listos se omiten) y, si Bajas y Mora quedan OK y Cambio de tecnología OK o sin datos, genera la asignación automáticamente. Si alguno falla, el flujo se detiene y la bitácora indica el motivo. “Programar” agenda ese mismo flujo completo para una fecha y hora.",
    },
  },
  {
    element: "#tour-insumo-BAJAS",
    popover: {
      title: "Cada insumo por separado",
      description:
        "Despliega un insumo para ver su detalle (periodo, filas, variación) y sus propias acciones: Extraer (reintentar solo ese, por ejemplo el que dio error), Revalidar y Programar. Extraer uno suelto no genera la asignación. Si las filas varían más de 30% respecto al periodo anterior verás OK y, al lado, una Advertencia: es solo un aviso, no bloquea.",
    },
  },
  {
    element: "#tour-insumo-CAMBIO_TEC",
    popover: {
      title: "Obligatorios y opcional",
      description:
        "Bajas y Mora son obligatorios: si fallan, la asignación no se genera. Cambio de tecnología es opcional solo cuando el periodo no trae datos (queda “OK · sin datos”); si su extracción falla, también detiene el flujo.",
    },
  },
  {
    element: "#tour-asignacion",
    popover: {
      title: "2. Asignación",
      description:
        "La genera el flujo automáticamente. Si los insumos se extrajeron por separado, aquí aparece “Lista para generar” y la generas con el botón. “Regenerar” rehace una asignación ya generada (con confirmación).",
    },
  },
  {
    element: "#tour-sin-asignar",
    popover: {
      title: "3. Equipos sin asignar",
      description:
        "Equipos que el SP dejó sin agencia por datos inconsistentes. Asígnales una agencia uno a uno o varios a la vez.",
    },
  },
  {
    element: "#tour-completar",
    popover: {
      title: "4. Completar asignación",
      description:
        "Cuando no quedan equipos sin agencia, completa la asignación para cerrar el periodo y exportarla a Excel.",
    },
  },
  {
    element: "#tour-bitacora",
    popover: {
      title: "Bitácora",
      description: "Todo lo que pasó en el periodo: validaciones, ejecuciones y programaciones.",
    },
  },
  {
    element: "#tour-demo-periodo",
    popover: {
      title: "Siguiente periodo (solo demo)",
      description:
        "Simula que empezó el mes siguiente para recorrer varios periodos: hay que volver a extraer los insumos y las cantidades varían, así el histórico del Dashboard se va llenando.",
    },
  },
  {
    element: "#tour-cards",
    popover: {
      title: "Resumen",
      description: "Estado de la asignación y la mora del periodo actual.",
    },
  },
  {
    element: "#tour-chart-insumos",
    popover: {
      title: "Insumos por periodo",
      description:
        "Filas de Bajas, Cambio de tecnología y Mora en los últimos 12 periodos. En ámbar, los que quedaron en Advertencia al validarse (su variación respecto al periodo anterior superó el umbral); en la Mora, que no se valida, los que variaron más del umbral respecto a la mora anterior.",
    },
  },
  {
    element: "#tour-chart-calidad",
    popover: {
      title: "Equipos asignados a mano",
      description:
        "Porcentaje de equipos que el SP dejó sin agencia porque sus datos no cuadran y hubo que asignar a mano. Si sube, conviene revisar la calidad de los datos de origen.",
    },
  },
  {
    element: "#tour-chart",
    popover: {
      title: "Procesos por día",
      description: "Evolución de los procesos exitosos y con error.",
    },
  },
  {
    element: "#tour-historial",
    popover: {
      title: "Historial",
      description: "Detalle de cada proceso: quién lo lanzó, cuándo, duración y resultado. Filtra por tipo de proceso.",
    },
  },
  {
    element: "#tour-tema",
    popover: {
      title: "Tema",
      description: "Elige tema claro, oscuro o el del sistema (por defecto).",
    },
  },
  {
    element: "#tour-usuario",
    popover: {
      title: "Tu cuenta",
      description: "Desde aquí puedes cerrar sesión.",
    },
  },
  {
    element: "#tour-ayuda",
    popover: {
      title: "Ayuda",
      description: "Vuelve a ver este recorrido cuando quieras.",
    },
  },
]

export function iniciarTour() {
  const steps = PASOS.filter((p) => typeof p.element !== "string" || document.querySelector(p.element))
  driver({
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Siguiente",
    prevBtnText: "Anterior",
    doneBtnText: "Listo",
    steps,
  }).drive()
}

export function iniciarTourSiPrimeraVez() {
  try {
    if (localStorage.getItem(VISTO_KEY)) return
    localStorage.setItem(VISTO_KEY, "1")
  } catch {
    return
  }
  iniciarTour()
}
