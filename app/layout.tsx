import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/src/components/Toast";
import { RetryWatcher } from "@/src/components/RetryWatcher";
import { PendingTransactionsBanner } from "@/src/components/PendingTransactionsBanner";
import { FeatureFlagProvider } from "@/src/components/FeatureFlagProvider";
import { CapacitySheddingProvider } from "@/src/components/CapacitySheddingProvider";
import { CapacityIndicator } from "@/src/components/CapacityIndicator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VeriNode - Staking",
  description: "Decentralized savings circles (ROSCA) protocol on Stellar Soroban",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FeatureFlagProvider>
          <CapacitySheddingProvider>
            <ToastProvider>
              <CapacityIndicator />
              <PendingTransactionsBanner />
              <RetryWatcher />
              {children}
            </ToastProvider>
          </CapacitySheddingProvider>
        </FeatureFlagProvider>
      </body>
    </html>
  );
}
