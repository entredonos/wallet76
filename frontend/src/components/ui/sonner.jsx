import { useTheme } from "../../context/ThemeContext"
import { Toaster as Sonner, toast } from "sonner"

const Toaster = ({
  ...props
}) => {
  // Was reading next-themes' useTheme(), whose ThemeProvider is never
  // mounted in this app (we use our own ThemeContext) — so toasts always
  // rendered with theme="system" regardless of the user's actual dark/light
  // choice. Use the app's real theme hook instead.
  const { theme = "dark" } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
