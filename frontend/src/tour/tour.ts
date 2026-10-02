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
      description: "Valida los insumos, genera la mora y la asignación del periodo.",
    },
  },
  {
    element: "#tour-periodo",
    popover: {
      title: "Periodo",
      description: "Mes de la asignación, periodo esperado de los insumos (mes anterior) y avance de los pasos.",
    },
  },
  {
    element: "#tour-insumo-BAJAS",
    popover: {
      title: "1. Bajas",
      description:
        "Primer insumo: la tabla de Bajas debe tener el periodo del mes anterior. Si no lo tiene, usa “Extraer del servidor” o programa la extracción. “Revalidar” vuelve a revisarla.",
    },
  },
  {
    element: "#tour-insumo-CAMBIO_TEC",
    popover: {
      title: "2. Cambio de tecnología",
      description:
        "Segundo insumo: igual que Bajas, debe tener el periodo del mes anterior; se extrae del mismo servidor con su propio SP. Si las filas varían más de 30% respecto al periodo anterior queda en Advertencia: avisa, pero no bloquea.",
    },
  },
  {
    element: "#tour-mora",
    popover: {
      title: "3. Mora",
      description:
        "Ejecuta el SP de mora (~40 min) y sigue su avance. Puedes programarlo para una fecha y hora o cada mes.",
    },
  },
  {
    element: "#tour-asignacion",
    popover: {
      title: "4. Asignación",
      description: "Se habilita cuando todos los insumos están OK. Pide confirmación antes de ejecutar.",
    },
  },
  {
    element: "#tour-sin-asignar",
    popover: {
      title: "5. Equipos sin asignar",
      description:
        "Equipos que el SP dejó sin agencia por datos inconsistentes. Asígnales una agencia uno a uno o varios a la vez.",
    },
  },
  {
    element: "#tour-completar",
    popover: {
      title: "6. Completar asignación",
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
    element: "#tour-cards",
    popover: {
      title: "Resumen",
      description: "Estado de la asignación y la mora del periodo actual.",
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
