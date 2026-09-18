import type { Metadata } from "next";
import WizardHome from "@/components/wizard/WizardHome";
import { PublicReportHeader } from "@/components/editions/PublicReportHeader";
import { ReportLanding } from "@/components/editions/ReportLanding";

export const metadata: Metadata = {
  title: "DataBard — Reports worth sharing",
  description: "Explore public ecosystem data, understand the story, and publish a dated report with an evidence receipt. Start with Superteam Earn.",
  openGraph: { title: "DataBard — Reports worth sharing", description: "Public ecosystem data, explained in a report worth sharing." },
  twitter: { title: "DataBard — Reports worth sharing", description: "Public ecosystem data, explained in a report worth sharing." },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.start || params.workspace || params.persona) return <WizardHome />;
  return (
    <>
      <PublicReportHeader />
      <ReportLanding />
    </>
  );
}
