import { createAttestationRoute } from "@/lib/attestation/http";

export const runtime = "nodejs";
export const POST = createAttestationRoute("anchor");
