import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { url, token } = await req.json();

  try {
    const res = await fetch(`${url}/api/v1/databases?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `OpenMetadata returned ${res.status}` });
    }

    const databases = await res.json();
    const schemas: string[] = [];

    for (const db of databases.data ?? []) {
      const schemaRes = await fetch(
        `${url}/api/v1/databaseSchemas?database=${db.fullyQualifiedName}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (schemaRes.ok) {
        const schemaData = await schemaRes.json();
        for (const s of schemaData.data ?? []) {
          schemas.push(s.fullyQualifiedName);
        }
      }
    }

    return NextResponse.json({ ok: true, schemas });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg });
  }
}
