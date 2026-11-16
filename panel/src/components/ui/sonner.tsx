"use client"

import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from "lucide-react"

/**
 * Notificações do produto (Sonner via shadcn). O tema acompanha a classe "dark" da página (escolha da pessoa); o visual (cores e
 * raio) é travado no globals.css, sem tokens do sistema. A animação é só CSS (transform/opacity) e o empilhamento é limitado.
 */
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}
const currentTheme = () => (document.documentElement.classList.contains("dark") ? "dark" : "light")

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark" as const)
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          actionButton: "!bg-[#1AC43D] !text-white !font-medium",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
