import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ferry — Stellar Remittance Orchestration",
  description: "Non-custodial cross-border remittance orchestration on Stellar Testnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#040404] text-white">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-[-20%] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-500/15 via-sky-500/10 to-transparent blur-[120px]" />
          <div className="absolute right-[-15%] top-[10%] h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-violet-500/10 via-fuchsia-500/5 to-transparent blur-[110px]" />
          <div className="absolute bottom-[-25%] left-[-10%] h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-sky-500/10 to-transparent blur-[110px]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.03),transparent_60%)]" />
        </div>
        {children}
      </body>
    </html>
  );
}
