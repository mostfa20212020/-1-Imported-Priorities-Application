import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-900 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg dark:group-[.toaster]:bg-slate-950 dark:group-[.toaster]:text-slate-50",
          description: "group-[.toast]:text-slate-500 dark:group-[.toast]:text-slate-400",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:bg-emerald-50 group-[.toaster]:text-emerald-950 group-[.toaster]:border-emerald-200 dark:group-[.toaster]:bg-emerald-950/40 dark:group-[.toaster]:text-emerald-200",
          error: "group-[.toaster]:bg-rose-50 group-[.toaster]:text-rose-950 group-[.toaster]:border-rose-200 dark:group-[.toaster]:bg-rose-950/40 dark:group-[.toaster]:text-rose-200",
          warning: "group-[.toaster]:bg-amber-50 group-[.toaster]:text-amber-950 group-[.toaster]:border-amber-200 dark:group-[.toaster]:bg-amber-950/40 dark:group-[.toaster]:text-amber-200",
          info: "group-[.toaster]:bg-sky-50 group-[.toaster]:text-sky-950 group-[.toaster]:border-sky-200 dark:group-[.toaster]:bg-sky-950/40 dark:group-[.toaster]:text-sky-200",
        },
      }}
      icons={{
        success: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
        error: <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />,
        warning: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
        info: <Info className="w-5 h-5 text-sky-600 dark:text-sky-400" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
