import type { Metadata } from "next";
import { AppProviders } from "@/components/AppProviders";
import { SolanaProvider } from "@/components/SolanaProvider";
import { ToastProvider } from "@/components/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "http://localhost:3000"),
  title: "DataBard — Podcast-style audio docs for your data catalog",
  description: "Point DataBard at any data catalog and it generates a two-host podcast episode walking through your schemas, tables, data quality, and lineage.",
  openGraph: {
    title: "🎙️ DataBard",
    description: "Podcast-style audio documentation for your data catalog. Two AI hosts discuss your schemas, flag quality issues, and trace lineage.",
    type: "website",
    siteName: "DataBard",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "DataBard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "🎙️ DataBard",
    description: "Podcast-style audio documentation for your data catalog.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate" type="application/rss+xml" title="DataBard Podcast Feed" href="/api/feed" />
      </head>
      <body>
        <AppProviders>
          <SolanaProvider>
            <ToastProvider>
              <ThemeToggle />
              {children}
            </ToastProvider>
          </SolanaProvider>
        </AppProviders>
      </body>
    </html>
  );
}
