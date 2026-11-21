import type { Metadata } from "next";
import WizardHome from "@/components/wizard/WizardHome";
import { ReportLanding } from "@/components/editions/ReportLanding";
import { hasWizardParam } from "@/lib/product/workspaces";

export const metadata: Metadata = {
  title: "DataBard — Superteam Earn · Public reports",
  description: "Find your organization's report — listings, rewards and builder submissions on Superteam Earn. The same engine can analyze your own data.",
  openGraph: { title: "DataBard — Superteam Earn · Public reports", description: "Listings, rewards and builder submissions on Superteam Earn — and your own data estate." },
  twitter: { title: "DataBard — Superteam Earn · Public reports", description: "Listings, rewards and builder submissions on Superteam Earn — and your own data estate." },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (hasWizardParam(Object.keys(params))) return <WizardHome />;
  return <ReportLanding />;
}
