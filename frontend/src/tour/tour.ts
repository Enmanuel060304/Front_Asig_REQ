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
      title: "Insumos",
      description:
        "Bajas y Cambio de tecnología deben tener el periodo del mes anterior. Si no lo tienen, usa “Extraer del servidor”. También puedes programar la extracción.",
    },
  },
  {
    element: "#tour-mora",
    popover: {
      title: "Mora",
      description:
        "Ejecuta el SP de mora (~40 min) y sigue su avance. Puedes programarlo para una fecha y hora o cada mes.",
    },
  },
  {
    element: "#tour-asignacion",
    popover: {
      title: "Asignación",
      description: "Se habilita cuando todos los insumos están OK. Pide confirmación antes de ejecutar.",
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
