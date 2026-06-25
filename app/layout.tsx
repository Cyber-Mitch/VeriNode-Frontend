import type { Metadata } from "next";
import { Providers } from "@/src/components/providers/Providers";
import { PwaProvider } from "@/src/components/providers/PwaProvider";
import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased">
        <Providers>
          <PwaProvider>{children}</PwaProvider>
        </Providers>
      </body>
    </html>
  );
}
