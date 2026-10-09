import type { Metadata } from "next";
import WizardHome from "@/components/wizard/WizardHome";
import { ReportLanding } from "@/components/editions/ReportLanding";
import { hasWizardParam } from "@/lib/product/workspaces";

export const metadata: Metadata = {
  title: "DataBard — Reports worth sharing",
  description: "One engine turns any data estate — public listings, your warehouse, your protocol — into a report worth sharing. Public division 01: Superteam Earn.",
  openGraph: { title: "DataBard — Reports worth sharing", description: "Any data estate, explained in a report worth sharing." },
  twitter: { title: "DataBard — Reports worth sharing", description: "Any data estate, explained in a report worth sharing." },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (hasWizardParam(Object.keys(params))) return <WizardHome />;
  return <ReportLanding />;
}
