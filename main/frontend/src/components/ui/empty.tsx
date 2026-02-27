import { cn } from "@/lib/utils";

export function EmptyTitle({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm font-medium text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}
