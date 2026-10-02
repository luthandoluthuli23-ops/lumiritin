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
  description: "Private jet charter, empty-leg deals and SACAA-verified crew credentials.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Navbar session={session ? { name: session.name, role: session.role } : null} demoSwitcher={process.env.NODE_ENV !== "production"} />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
