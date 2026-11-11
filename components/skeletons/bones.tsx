import { cn } from "@/lib/utils";

// Loading placeholders shaped like each page, shown while its data loads (the pages' <Suspense> fallbacks). A soft light
// sweeps across them (.skeleton-shine in app/globals.css); screen readers hear "Loading…" once.

export function Bone({ className, width }: { className?: string; width?: string }) {
  return <div aria-hidden className={cn("skeleton-shine rounded-md", className)} style={width ? { width } : undefined} />;
}

/** Wraps a skeleton: announced once as "Loading…" to screen readers. */
export function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Loading…" className={cn("grid gap-4", className)}>
      {children}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** The card frame most skeletons sit in. */
export const card = "rounded-[0.75rem] border border-line bg-card";
