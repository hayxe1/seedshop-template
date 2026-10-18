import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  const checkedAt = new Date().toISOString();
  const release = (process.env.APP_REVISION ?? "unknown").trim() || "unknown";

  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json(
      {
        ok: true,
        status: "ready",
        database: "available",
        release,
        checkedAt,
      },
      { headers: noStoreHeaders }
    );
  } catch {
    return Response.json(
      {
        ok: false,
        status: "unavailable",
        database: "unavailable",
        release,
        checkedAt,
      },
      {
        status: 503,
        headers: noStoreHeaders,
      }
    );
  }
}
