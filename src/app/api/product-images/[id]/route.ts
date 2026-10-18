import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const asset = await prisma.productImageAsset.findUnique({
    where: { id },
    select: {
      contentType: true,
      sizeBytes: true,
      data: true,
    },
  });

  if (!asset) {
    return new Response("Image not found", { status: 404 });
  }

  return new Response(Buffer.from(asset.data), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(asset.sizeBytes),
      "Content-Type": asset.contentType,
    },
  });
}
