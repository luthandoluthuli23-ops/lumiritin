import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Providers } from "@/components/Providers";
import { isAssistantConfigured } from "@/lib/assistant";
import { getSession } from "@/lib/session";
import "./globals.css";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-cormorant" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Lumiritin — Private aviation, South Africa",
  description: "Private aircraft charter and SACAA-verified crew credentials across South Africa.",
};

// viewport-fit=cover lets the page extend under notches/home indicators (the pt-safe/pb-safe utilities keep content clear of them).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f17",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <Providers>
          {/* Fade scrim: page content dissolves into the page colour as it scrolls up to the fixed
              navbar, instead of sliding visibly behind it. Solid over the bar's band, then fades out. */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[calc(7rem+env(safe-area-inset-top))]"
            style={{ background: "linear-gradient(to bottom, var(--color-obsidian) 0%, var(--color-obsidian) 64%, transparent 100%)" }}
          />
          <Navbar session={session ? { name: session.name, role: session.role } : null} demoSwitcher={process.env.NODE_ENV !== "production"} />
          <div className="flex-1">{children}</div>
          <Footer />
          {/* Hidden until ANTHROPIC_API_KEY is set, like the other Lumi features. */}
          {isAssistantConfigured() && <AssistantWidget role={session?.role ?? null} />}
        </Providers>
      </body>
    </html>
  );
}
