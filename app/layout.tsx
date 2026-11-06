import type { Metadata } from "next";
import Image from "next/image";
import { Geist_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Body copy: Inter — highly legible at small sizes, with tabular figures for amounts.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

// Headings: Oswald (SIL OFL 1.1, see app/fonts/oswald/OFL.txt).
const oswald = localFont({
  src: "./fonts/oswald/Oswald-VariableFont_wght.ttf",
  variable: "--font-oswald",
  weight: "200 700",
  display: "swap",
});

// "Ferry" wordmark next to the logo: Archivo Black (SIL OFL 1.1, see app/fonts/archivo-black/OFL.txt).
const archivoBlack = localFont({
  src: "./fonts/archivo-black/ArchivoBlack-Regular.ttf",
  variable: "--font-wordmark",
  weight: "400",
  display: "swap",
});

// Hashes, addresses and other machine values.
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
      className={`${inter.variable} ${oswald.variable} ${archivoBlack.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-white">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          {/* Viewport-sized box shifted 30% right so the ferry (centered in the
              artwork) sits beside the cards instead of behind them; the left
              edge fades into black so the artwork's cut-off edge never shows. */}
          <div className="absolute inset-y-0 left-[30%] w-full [mask-image:linear-gradient(to_right,transparent,black_25%)]">
            <Image
              src="/brand/ferry-background.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center brightness-150"
            />
          </div>
          {/* Light vignette only — the artwork itself is already very dark. */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45))]" />
        </div>
        {children}
      </body>
    </html>
  );
}
