import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Affordance: la acción principal es azul sólida con sombra (se eleva al pasar el mouse y se hunde al presionar);
// las secundarias (outline) tienen borde y sombra visibles. Las transiciones respetan "reducir movimiento".
// En oscuro el destructivo usa el rojo del tema claro: con el rojo oscuro del tema, el texto blanco no llega a AA.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:transform-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:saturate-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm shadow-primary/30 hover:-translate-y-px hover:shadow-md hover:shadow-primary/30 hover:brightness-110 active:translate-y-px active:shadow-xs active:brightness-95",
        outline:
          "border-input bg-background shadow-xs hover:-translate-y-px hover:border-primary/60 hover:bg-primary/5 hover:text-primary hover:shadow-sm active:translate-y-px active:shadow-none aria-expanded:border-primary/60 aria-expanded:bg-primary/5 aria-expanded:text-primary dark:bg-input/20 dark:hover:bg-primary/15 dark:hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:translate-y-px aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground active:translate-y-px aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive text-white shadow-sm shadow-destructive/30 dark:bg-[oklch(0.577_0.245_27.325)] hover:-translate-y-px hover:shadow-md hover:brightness-110 active:translate-y-px active:shadow-xs active:brightness-95 focus-visible:border-destructive/40 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[min(var(--radius-md),12px)] px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs":
          "size-7 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
