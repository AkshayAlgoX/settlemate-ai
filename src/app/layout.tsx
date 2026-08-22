import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SettleMate AI — AI Finance Controller",
  description:
    "Deterministic payment reconciliation with controlled AI, human approval, and complete auditability.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#070b12] antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}