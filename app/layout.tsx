import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/src/components/providers/Providers";
import { PwaProvider } from "@/src/components/providers/PwaProvider";
import "./globals.css";

// next/font self-hosts Inter and emits <link rel="preload"> automatically.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "VeriNode - Inspection Dashboard",
  description: "Physical node inspection and audit management for infrastructure operators",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Preload the framework runtime so it's fetched in parallel with HTML parse */}
        <link rel="modulepreload" href="/_next/static/chunks/webpack.js" />
      </head>
      <body className={`antialiased ${inter.className}`}>
        <Providers>
          <PwaProvider>{children}</PwaProvider>
        </Providers>
      </body>
    </html>
  );
}
