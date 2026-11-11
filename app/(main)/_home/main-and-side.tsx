/** The ticket list beside the modules card; the side card drops under it when they no longer fit. */
export function MainAndSide({ children }: { children: [React.ReactNode, React.ReactNode] }) {
  return (
    // Phones put Module progress right under the stats (HANDOFF section 7), so this goes after it there.
    <div className="flex flex-wrap items-start gap-6 max-md:order-2 max-md:gap-5">
      <div className="min-w-0 flex-[999_1_35rem] max-md:basis-full">{children[0]}</div>
      <div className="min-w-0 flex-[1_1_20rem] max-md:basis-full">{children[1]}</div>
    </div>
  );
}
