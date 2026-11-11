import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ScrollbarActivity } from "@/components/scrollbar-activity";
import { ThemeProvider } from "@/components/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SPLASH_SCRIPT } from "@/lib/splash";
import { ACCENT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "QA Hub", template: "%s · QA Hub" },
  description: "QA tickets and QA↔developer communication for the in-house ERP",
  // An iPhone reads these instead of the manifest: opened from the Home Screen, QA Hub fills the screen under this name.
  appleWebApp: { capable: true, title: "QA Hub", statusBarStyle: "default" },
};

// viewportFit "cover" lets the page reach under an iPhone's notch and home bar; the top bar, bottom tab bar and sheets
// pad themselves with env(safe-area-inset-*). The theme colours tint the phone's status bar to match the page.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    // The dark page (--grouped in app/_styles/colors-dark.css) with the default indigo.
    { media: "(prefers-color-scheme: dark)", color: "#14151d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme scripts set the `dark` class and data-accent on <html> before React loads, so the server markup
    // differs from the first client render on purpose.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_SCRIPT }} />
        {/* Marks the first visit this session, so the QA Hub preloader shows from the first frame (components/app-splash.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <ScrollbarActivity />
      </body>
    </html>
  );
}
