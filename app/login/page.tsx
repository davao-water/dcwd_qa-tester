import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BugIcon, MessagesSquareIcon, PenToolIcon } from "lucide-react";
import { LoadingBlock } from "@/components/page-header";
import { WAVE_VIEWBOX, WAVES } from "@/components/preloader";
import { AccentPicker } from "@/components/accent-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";
import { signupStatus } from "./actions";
import { AuthTabs } from "./auth-tabs";
import { ClaimCard } from "./claim-card";
import { ForgotForm } from "./forgot-form";
import { LoginForm } from "./login-form";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign in" };

// Layout and brand pane follow the DCWD Careers sign-in screen: brand pane left (800 of 1920 px), form right, footer bar.

const CHIPS = [
  { icon: BugIcon, label: "Report a bug" },
  { icon: PenToolIcon, label: "Mark up screenshots" },
  { icon: MessagesSquareIcon, label: "Talk it through" },
];

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    // The page itself never scrolls; only the form column does. A page scrollbar (it appears on the taller Sign up
    // form) would narrow the window, resize the brand pane and make its text jump when switching tabs.
    <div className="auth-page flex h-dvh overflow-hidden bg-background text-foreground">
      <BrandPane />
      <div className="relative flex h-dvh min-w-0 flex-1 flex-col">
        {/* The look, before signing in: theme colour and light or dark, remembered in this browser like inside the app. */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2.5 md:top-6 md:right-6">
          <AccentPicker />
          <ThemeToggle />
        </div>
        <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pt-20 pb-8 md:pt-12">
          <div className="m-auto w-full max-w-[27.5rem]">
            <MobileBrand />
            <Suspense fallback={<LoadingBlock />}>
              <LoginBody searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
        <footer className="flex min-h-[4.25rem] shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line2 px-6 py-3 text-[0.8125rem] text-muted-foreground md:px-16">
          <span>Need help? Ask a QA Hub admin.</span>
          <span>Davao City Water District</span>
        </footer>
      </div>
    </div>
  );
}

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  if (await getCurrentUser()) redirect("/");
  const { next, mode } = await searchParams;
  const signup = mode === "signup";
  // A sign-up request this browser made: shown above the sign-in form (waiting, or approved with its temporary password).
  const request = await signupStatus();
  return (
    <>
      <AuthTabs active={signup ? "signup" : "signin"} />
      {signup ? (
        <SignupForm />
      ) : mode === "forgot" ? (
        <ForgotForm />
      ) : (
        <LoginForm next={typeof next === "string" ? next : "/"}>{request ? <ClaimCard status={request} /> : null}</LoginForm>
      )}
    </>
  );
}

function BrandPane() {
  return (
    // The seal and text are centred in the space above a reserved strip for the waves, and drawn above them, so the
    // waves can never cover the chips, however short the window is. On short windows the seal and title shrink.
    <section aria-label="QA Hub" className="auth-brand relative hidden h-dvh w-[41.6%] max-w-[50rem] shrink-0 flex-col overflow-hidden bg-(--ab-bg) text-(--ab-ink) lg:flex">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-10 pt-8 pb-[9.375rem] xl:px-20 [@media(max-height:760px)]:pb-[7.5rem]">
        <div className="relative size-[11.25rem] shrink-0 [@media(max-height:760px)]:size-[8.125rem]">
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
            <span className="rip" />
            <span className="rip" />
            <span className="rip" />
            <span className="rip" />
          </div>
          <div className="seal relative flex size-full items-center justify-center rounded-full bg-white shadow-(--ab-seal-shadow)">
            <Image src="/dcwd-seal.png" alt="Davao City Water District seal" width={140} height={140} priority className="size-[78%]" />
          </div>
        </div>
        <BrandText />
      </div>
      {WAVES.map((w) => (
        <div key={w.cls} className="absolute inset-x-0 bottom-0 h-[13.75rem] overflow-hidden" aria-hidden>
          <svg className={`wave ${w.cls}`} viewBox={WAVE_VIEWBOX} preserveAspectRatio="none">
            <path d={w.d} style={{ fill: w.fill }} />
          </svg>
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-[1.625rem] z-10 text-center text-[0.8125rem] text-(--ab-foot)">© Davao City Water District · Est. 1973</div>
    </section>
  );
}

function BrandText() {
  return (
    <div className="auth-enter relative mt-14 w-full text-center [@media(max-height:760px)]:mt-8">
      <div className="text-[0.8125rem] font-semibold tracking-[0.16em] text-(--ab-eyebrow) uppercase">Davao City Water District</div>
      <h1 className="mt-3.5 text-[2.75rem] leading-[1.1] font-bold tracking-[-0.02em] [@media(max-height:760px)]:mt-2 [@media(max-height:760px)]:text-[2.25rem]">QA Hub</h1>
      <p className="mx-auto mt-4 max-w-[31.25rem] text-[1.0625rem] leading-relaxed text-(--ab-text) [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:text-[0.9688rem]">
        Report ERP bugs, suggestions and improvements with marked-up screenshots and videos, and talk them through with the developers who own each module.
      </p>
      <div className="mt-[1.875rem] flex flex-wrap justify-center gap-2.5 [@media(max-height:760px)]:mt-5">
        {CHIPS.map(({ icon: Icon, label }) => (
          <span key={label} className="flex h-10 items-center gap-2 rounded-full border border-(--ab-chip-line) bg-(--ab-chip-bg) px-4 text-[0.9063rem] font-medium text-(--ab-chip-ink)">
            <Icon className="size-4 text-(--ab-chip-icon)" aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Below the lg breakpoint the brand pane is hidden, so the form carries a small seal and name insd. */
function MobileBrand() {
  return (
    <div className="mb-8 flex items-center gap-3 lg:hidden">
      <Image src="/dcwd-seal.png" alt="" width={44} height={44} />
      <div>
        <div className="text-[0.6875rem] font-semibold tracking-[0.14em] text-acc uppercase">Davao City Water District</div>
        <div className="text-xl leading-tight font-bold text-brand">QA Hub</div>
      </div>
    </div>
  );
}
