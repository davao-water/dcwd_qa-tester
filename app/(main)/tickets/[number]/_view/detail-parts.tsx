// The pieces of the Details spec sheet: a group heading, a field, an empty value, and the quiet line under the fields.
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

/** One column of the Details sheet: a small heading over its fields. */
export function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-[0.75rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="mt-3 grid gap-4">{children}</dl>
    </div>
  );
}

/** A field: the label on top, the value under it. The label always shows in full; only the value wraps. `control`: a value people can change. */
export function Detail({
  label,
  tip,
  control,
  children,
}: {
  label: string;
  tip?: string;
  control?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[0.8125rem] text-body2">
        {label}
        {tip ? <InfoTip label={label} text={tip} /> : null}
      </dt>
      <dd
        className={cn(
          "mt-1 min-w-0 text-[0.9375rem] font-medium wrap-anywhere",
          control && "font-normal",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** An empty value, quieter than a real one. */
export function Unset({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-muted-foreground">{children}</span>;
}

export function FootFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

