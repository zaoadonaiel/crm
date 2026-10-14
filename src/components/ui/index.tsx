import * as React from "react";
import Link from "next/link";
import { cn, initials } from "@/lib/utils";

/* Button ------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-600 shadow-sm",
  secondary: "bg-brand-50 text-brand-600 hover:bg-brand-100",
  outline: "bg-surface border border-border text-foreground hover:bg-surface-2",
  ghost: "text-muted hover:bg-black/5 hover:text-foreground",
  danger: "bg-danger text-white hover:opacity-90",
};
const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof sizes;
};

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", className?: string) {
  return cn(
    "inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap cursor-pointer",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: keyof typeof sizes; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/* Form fields ------------------------------------------------------- */

const field =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted/70 outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15 disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(field, "h-10", className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(field, "py-2.5 min-h-24 resize-y", className)} {...props} />;
  },
);

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-10 pr-8 cursor-pointer", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-[13px] font-medium text-foreground mb-1.5", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/* Surfaces ---------------------------------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand">{icon}</div>}
        <div>
          <h3 className="font-semibold text-[15px]">{title}</h3>
          {description && <p className="text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, icon, actions }: { title: string; description?: string; icon?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
      <div>
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          {icon && <span className="text-brand">{icon}</span>}
          {title}
        </h1>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* Small bits -------------------------------------------------------- */

const tones = {
  gray: "bg-black/5 text-muted",
  brand: "bg-brand-50 text-brand-600",
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize", tones[tone], className)}>
      {children}
    </span>
  );
}

const avatarColors = ["#f26b4e", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6"];
export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const color = avatarColors[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} className={cn("rounded-full object-cover shrink-0", className)} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
    >
      {initials(name) || "?"}
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-5">
      {icon && <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand">{icon}</div>}
      <div>
        <p className="text-[13px] text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("border-b border-border bg-surface-2 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-4 py-3 align-middle", className)} {...props} />;
}
