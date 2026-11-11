import { CheckIcon, FlaskConicalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The QA Hub preloader, after the DCWD ERP's Module preloader: QA Hub's emblem (a lab flask for the QA workshop, with a check) in a
// white ring that fills with water as loading goes on, inside slowly rippling rings, with waves along the bottom. The
// rings, ripples, float and waves reuse the sign-in brand pane's styles and colours (.auth-brand in app/_styles/sign-in-brand.css). With a
// theme colour other than the default indigo picked, the preloader takes its colours from it (.qa-splash in app/_styles/motion.css);
// the colour is on <html> before the first paint (ACCENT_SCRIPT), so it never shows indigo first.

/** How long a wave is drawn, in px, and the length of one rise or one fall. */
const WAVE_LONG = 4000;
const WAVE_REPEAT = 400;

/**
 * A wave WAVE_LONG units long, drawn at true scale (viewBox and width both 4000, .auth-brand .wave). Each curve is
 * WAVE_REPEAT long and every `T` mirrors the one before, so it goes rise, fall, rise: the shape only repeats every
 * 2 × WAVE_REPEAT = 800 px. auth-drift must slide exactly that far, or each loop jumps a crest into a trough. Sliding 800 px
 * still leaves a 3200 px-wide screen covered (the preloader fills the window).
 */
export const wavePath = (y: number, crest: number) => {
  const tail = Array.from({ length: WAVE_LONG / WAVE_REPEAT - 1 }, (_, i) => ` T ${(i + 2) * WAVE_REPEAT} ${y}`).join("");
  return `M0 ${y} Q ${WAVE_REPEAT / 2} ${crest} ${WAVE_REPEAT} ${y}${tail} V220 H0 Z`;
};
export const WAVE_VIEWBOX = `0 0 ${WAVE_LONG} 220`;

/** Back to front: a slow tall swell, a middle one, and a quick low one in front. */
export const WAVES = [
  { cls: "w1", d: wavePath(104, 54), fill: "var(--ab-wave-1)" },
  { cls: "w2", d: wavePath(146, 112), fill: "var(--ab-wave-2)" },
  { cls: "w3", d: wavePath(184, 160), fill: "var(--ab-wave-3)" },
];

/** A wavy water surface, twice as wide as the ring so it can slide sideways forever. */
const SLOSH = "M0 12 Q 35 2 70 12 T 140 12 T 210 12 T 280 12 T 350 12 T 420 12 T 490 12 T 560 12 V320 H0 Z";

export function Preloader({ progress, status, done, className }: { progress: number; status: string; done?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div
      className={cn("auth-brand qa-splash fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-(--ab-bg) text-(--ab-ink)", done && "is-done", className)}
      role="progressbar"
      aria-label="Loading QA Hub"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={status}
    >
      <div className="relative z-10 -mt-16 flex flex-col items-center px-6 text-center">
        <div className="relative size-[11.25rem]">
          <div className="absolute top-1/2 left-1/2 size-[45rem] -translate-1/2 rounded-full bg-[radial-gradient(circle,var(--ab-glow)_0,color-mix(in_srgb,var(--ab-glow)_70%,transparent)_28%,transparent_62%)]" />
          <div className="absolute top-1/2 left-1/2 size-0" aria-hidden>
            {[
              [236, "var(--ab-ring-1)"],
              [330, "var(--ab-ring-2)"],
              [440, "var(--ab-ring-3)"],
              [570, "var(--ab-ring-4)"],
            ].map(([s, c]) => (
              <span key={s} className="rg" style={{ width: `${(s as number) / 16}rem`, height: `${(s as number) / 16}rem`, borderColor: c as string }} />
            ))}
          </div>
          <div className="absolute top-1/2 left-1/2 size-0" aria-hidden>
            <span className="rip" />
            <span className="rip" />
            <span className="rip" />
          </div>
          <div className="seal relative size-full">
            <div className="absolute inset-0 overflow-hidden rounded-full bg-white shadow-(--ab-seal-shadow)">
              <div className="water" style={{ transform: `translate3d(0, ${94 - pct * 0.86}%, 0)` }} aria-hidden>
                <svg className="slosh s2" viewBox="0 0 560 320" preserveAspectRatio="none">
                  <path d={SLOSH} style={{ fill: "var(--ab-emblem)" }} fillOpacity={0.14} />
                </svg>
                <svg className="slosh s1" viewBox="0 0 560 320" preserveAspectRatio="none">
                  <path d={SLOSH.replaceAll(" 12", " 10").replace("Q 35 2", "Q 35 20")} style={{ fill: "var(--ab-emblem)" }} fillOpacity={0.22} />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full shadow-[inset_0_0_0_0.375rem_rgba(30,42,120,0.08)]" />
            </div>
            {/* The emblem: a disc in the theme colour, a lab flask (the QA workshop), and a green check for "verified". */}
            <div className="absolute top-1/2 left-1/2 z-[2] flex size-[7.75rem] -translate-1/2 items-center justify-center rounded-full bg-white shadow-[0_0_0_0.1875rem_#fff,0_0.375rem_1.125rem_rgba(30,42,120,0.18)]">
              <div className="flex size-[7rem] items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--ab-emblem),var(--ab-emblem-deep))] ring-4 ring-[color-mix(in_srgb,var(--ab-emblem)_25%,transparent)] ring-inset">
                <FlaskConicalIcon className="size-12 text-white" strokeWidth={1.6} aria-hidden />
              </div>
              <span className="absolute right-0.5 bottom-1.5 flex size-8 items-center justify-center rounded-full bg-[#0f9f6e] text-white shadow-[0_0_0_0.1875rem_#fff]">
                <CheckIcon className="size-4.5" strokeWidth={3} aria-hidden />
              </span>
            </div>
          </div>
        </div>

        <span className="mt-12 inline-flex h-8 items-center gap-2 rounded-full border border-(--ab-chip-line) bg-(--ab-chip-bg) px-3.5 font-mono text-[0.7813rem] font-semibold tracking-[0.06em] text-(--ab-chip-ink)">
          <FlaskConicalIcon className="size-4 text-(--ab-chip-icon)" aria-hidden />
          QA HUB · DCWD ERP
        </span>
        <h1 className="mt-4 text-[2.125rem] leading-tight font-bold tracking-[-0.02em]">QA Hub</h1>
        <p className="mt-2 text-[0.9375rem] text-(--ab-text)" aria-live="polite">
          {status}
        </p>
      </div>

      {WAVES.map((w) => (
        <div key={w.cls} className="absolute inset-x-0 bottom-0 h-[13.75rem] overflow-hidden" aria-hidden>
          <svg className={`wave ${w.cls}`} viewBox={WAVE_VIEWBOX} preserveAspectRatio="none">
            <path d={w.d} style={{ fill: w.fill }} />
          </svg>
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-[1.625rem] z-10 text-center text-[0.8125rem] text-(--ab-foot)">© Davao City Water District</div>
    </div>
  );
}
