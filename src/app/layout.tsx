import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import { ClientProviders } from "@/components/ClientProviders";
import { ToastProvider } from "@/components/Toast";
import { HeaderBar } from "@/components/HeaderBar";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});

/** Applies the persisted theme before first paint — ThemeToggle is not mounted
 *  on "/" or "/episode/*", so without this those routes flash the wrong theme. */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("databard:theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "http://localhost:3000"),
  title: "DataBard — An AI analyst for your data",
  description: "Health scores, what changed, and a 2-minute briefing your team actually hears. Protocol teams get an attestation trail behind every claim.",
  openGraph: {
    title: "DataBard",
    description: "An AI analyst for protocol and warehouse data. Health scores, trend narratives, and a briefing you can forward in Slack.",
    type: "website",
    siteName: "DataBard",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "DataBard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DataBard",
    description: "An AI analyst for your data — health scores, what changed, and a briefing you can forward.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={display.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate" type="application/rss+xml" title="DataBard Podcast Feed" href="/api/feed" />
        {/* Plausible analytics — only loads if NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set */}
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js"}
          />
        )}
      </head>
      <body>
        {/* Aurora — global ambient gradient mesh on every page */}
        <div className="aurora" aria-hidden />
        <AppProviders>
          <ClientProviders>
            <ToastProvider>
              <HeaderBar />
              {children}
            </ToastProvider>
          </ClientProviders>
        </AppProviders>
      </body>
    </html>
  );
}
