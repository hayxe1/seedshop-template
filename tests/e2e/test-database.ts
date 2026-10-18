import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

function getTestDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for E2E cleanup.");
  }

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL for E2E cleanup.");
  }

  const databaseIdentity = `${parsedDatabaseUrl.hostname}/${decodeURIComponent(parsedDatabaseUrl.pathname)}`;

  if (!/(^|[-_./])(test|testing|e2e)([-_./]|$)/i.test(databaseIdentity)) {
    throw new Error("Refusing E2E cleanup outside a database whose host or name contains test/e2e.");
  }

  return databaseUrl;
}

async function withTestDatabase<T>(task: (prisma: PrismaClient) => Promise<T>) {
  const databaseUrl = getTestDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    return await task(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

export async function deleteUnlinkedTestProducts(slugs: Iterable<string>) {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return;

  await withTestDatabase((prisma) => prisma.product.deleteMany({
      where: {
        slug: { in: uniqueSlugs },
        orderItems: { none: {} },
        seedSetItems: { none: {} },
        inventoryReservations: { none: {} },
        inventoryMovements: { none: {} },
      },
    })
  );
}

export async function createCatalogPaginationFixtures(categoryId: string, prefix: string) {
  if (!prefix.startsWith("e2e-pagination-")) throw new Error("Expected isolated pagination fixture prefix.");
  const slugs = Array.from({ length: 105 }, (_, index) => `${prefix}-${index}`);
  await withTestDatabase((prisma) => prisma.product.createMany({
    data: slugs.map((slug, index) => ({
      slug, categoryId, name: `${prefix} ${String(index).padStart(3, "0")}`,
      description: "Disposable pagination fixture", price: 100, stock: 10,
      inventoryPolicy: "TRACKED" as const, isPublished: true,
    })),
  }));
  return slugs;
}

export async function deleteTestProductFixtures(slugs: Iterable<string>) {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return;

  await withTestDatabase(async (prisma) => {
    const products = await prisma.product.findMany({
      where: { slug: { in: uniqueSlugs } },
      select: { id: true, seedSetItems: { select: { id: true }, take: 1 } },
    });
    const removableProductIds = products
      .filter((product) => product.seedSetItems.length === 0)
      .map((product) => product.id);

    if (removableProductIds.length === 0) return;

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { items: { some: { productId: { in: removableProductIds } } } },
          { inventoryReservations: { some: { productId: { in: removableProductIds } } } },
        ],
      },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);

    await prisma.$transaction([
      prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
      prisma.inventoryMovement.deleteMany({ where: { productId: { in: removableProductIds } } }),
      prisma.product.deleteMany({ where: { id: { in: removableProductIds } } }),
    ]);
  });
}

export async function getTestOrderInventory(orderNumber: string, productId: string) {
  return withTestDatabase(async (prisma) => ({
    product: await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } }),
    reservations: await prisma.inventoryReservation.findMany({ where: { order: { orderNumber } } }),
    movements: await prisma.inventoryMovement.findMany({ where: { order: { orderNumber } } }),
  }));
}

export async function expireTestOrderReservations(orderNumber: string) {
  return withTestDatabase(prisma => prisma.inventoryReservation.updateMany({
    where: { order: { orderNumber }, status: "ACTIVE" },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  }));
}

export async function createTestNotificationFailure() {
  return withTestDatabase(prisma => prisma.notificationOutbox.create({ data: {
    channel: "EMAIL", template: "order-created", recipient: "qa@example.invalid",
    deduplicationKey: `e2e-notification-${Date.now()}`, payload: {},
  } }));
}

export async function readTestNotification(id: string) {
  return withTestDatabase(prisma => prisma.notificationOutbox.findUniqueOrThrow({ where: { id } }));
}

export async function deleteTestNotification(id: string) {
  return withTestDatabase(prisma => prisma.notificationOutbox.delete({ where: { id } }));
}

export async function deleteTestSeedSetFixture(seedSetId: string) {
  await withTestDatabase(async (prisma) => {
    await prisma.order.deleteMany({ where: { items: { some: { seedSetId } } } });
    await prisma.seedSet.delete({ where: { id: seedSetId } });
  });
}
