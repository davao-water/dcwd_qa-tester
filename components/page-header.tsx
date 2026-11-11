export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    // Phones: a large bold title like a phone app's, without the description; on inner pages (no tab bar) the slim
    // top bar names the page instead (app/_styles/phone.css).
    <div data-page-header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 max-md:flex-nowrap max-md:items-center">
      <div data-page-title className="min-w-0">
        <h1 className="text-[1.625rem] leading-tight font-semibold tracking-[-0.015em] max-md:text-[2rem] max-md:font-bold max-md:tracking-[-0.025em]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[0.9063rem] text-muted-foreground max-md:hidden">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2.5 max-md:ml-auto">{actions}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-acc-b border-t-acc" aria-hidden />
      {label}
    </div>
  );
}
