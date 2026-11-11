import Link from "next/link";
import { InfoTip } from "@/components/info-tip";

/** A dashboard card's title row: the title, an optional info tip, and a link on the right. */
export function CardHead({ id, title, tip, link }: { id: string; title: string; tip?: string; link: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 id={id} className="truncate text-[1.125rem] font-semibold">{title}</h2>
        {tip ? <InfoTip label={title} text={tip} /> : null}
      </div>
      <Link href={link.href} className="shrink-0 text-sm font-medium text-primary-text hover:text-primary-hover hover:underline">{link.label}</Link>
    </div>
  );
}
