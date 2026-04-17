import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataBard",
  description: "Podcast-style audio documentation for your data catalog",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
