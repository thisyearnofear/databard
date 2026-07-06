import type { Metadata } from "next";
import { AppProviders } from "@/components/AppProviders";
import { ClientProviders } from "@/components/ClientProviders";
import { ToastProvider } from "@/components/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "http://localhost:3000"),
  title: "DataBard — An AI analyst for your data estate",
  description: "Point DataBard at any data catalog and one engine computes health scores, lineage risk, and PII flags — delivered as two-host podcast episodes, dashboards, reports, and on-chain attestations.",
  openGraph: {
    title: "🎙️ DataBard",
    description: "An AI analyst for your data estate. Health scores, lineage risk, and governance flags — delivered as podcasts, dashboards, and reports.",
    type: "website",
    siteName: "DataBard",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "DataBard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "🎙️ DataBard",
    description: "An AI analyst for your data estate — podcasts, dashboards, and reports from one analysis engine.",
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
          <ClientProviders>
            <ToastProvider>
              <ThemeToggle />
              <SiteNav />
              {children}
            </ToastProvider>
          </ClientProviders>
        </AppProviders>
      </body>
    </html>
  );
}
