import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { getSession } from "@/lib/session";
import "./globals.css";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-cormorant" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Lumiritin — Private aviation, South Africa",
  description: "Private aircraft charter and SACAA-verified crew credentials across South Africa.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        {/* Fade scrim: page content dissolves into the page colour as it scrolls up to the fixed
            navbar, instead of sliding visibly behind it. Solid over the bar's band, then fades out. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-30 h-28"
          style={{ background: "linear-gradient(to bottom, var(--color-obsidian) 0%, var(--color-obsidian) 64%, transparent 100%)" }}
        />
        <Navbar session={session ? { name: session.name, role: session.role } : null} demoSwitcher={process.env.NODE_ENV !== "production"} />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
