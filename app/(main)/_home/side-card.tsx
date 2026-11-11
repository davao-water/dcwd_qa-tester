import { Card } from "@/components/ui/card";
import { CardHead } from "./card-head";

/** The small card beside the ticket list (modules, or people without one), and one row of it. */
export function SideCard({ title, link, empty, children }: { title: string; link: { href: string; label: string }; empty: string; children: React.ReactNode[] }) {
  return (
    <Card role="region" aria-labelledby="side-title">
      <CardHead id="side-title" title={title} link={link} />
      {children.length === 0 ? (
        <p className="border-t border-line2 px-5 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="stagger pb-2">{children}</ul>
      )}
    </Card>
  );
}

export function SideRow({ name, children }: { name: string; children?: React.ReactNode }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 border-t border-line2 px-5 py-2 text-sm">
      <span className="min-w-0 truncate font-medium" title={name}>{name}</span>
      {children}
    </li>
  );
}
