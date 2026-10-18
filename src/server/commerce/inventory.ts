import "server-only";
import {
  InventoryMovementReason,
  InventoryPolicy,
  InventoryReservationStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { CommerceError } from "@/server/commerce/errors";

type InventoryClient = Prisma.TransactionClient;
type RootInventoryClient = PrismaClient;

export const RESERVATION_TTL_MS = 20 * 60 * 1000;

export type InventoryRequirement = {
  productId: string;
  quantity: number;
};

function aggregateRequirements(requirements: InventoryRequirement[]) {
  const quantities = new Map<string, number>();

  for (const requirement of requirements) {
    if (requirement.quantity <= 0) {
      continue;
    }
    quantities.set(
      requirement.productId,
      (quantities.get(requirement.productId) ?? 0) + requirement.quantity
    );
  }

  return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity })).sort(
    (left, right) => left.productId.localeCompare(right.productId)
  );
}

async function lockProducts(tx: InventoryClient, productIds: string[]) {
  if (productIds.length === 0) {
    return;
  }

  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(
      productIds
    )}) ORDER BY "id" FOR UPDATE`
  );
}

export async function createInventoryReservations(
  tx: InventoryClient,
  input: {
    orderId: string;
    requirements: InventoryRequirement[];
    expiresAt: Date;
  }
) {
  const requirements = aggregateRequirements(input.requirements);
  const productIds = requirements.map((requirement) => requirement.productId);

  if (productIds.length === 0) {
    return;
  }

  await lockProducts(tx, productIds);

  const now = new Date();
  await tx.inventoryReservation.updateMany({
    where: {
      productId: { in: productIds },
      status: InventoryReservationStatus.ACTIVE,
      expiresAt: { lte: now },
    },
    data: { status: InventoryReservationStatus.EXPIRED },
  });

  const [products, activeReservations] = await Promise.all([
    tx.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        stock: true,
        inventoryPolicy: true,
        isPublished: true,
      },
    }),
    tx.inventoryReservation.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        status: InventoryReservationStatus.ACTIVE,
        expiresAt: { gt: now },
        orderId: { not: input.orderId },
      },
      _sum: { quantity: true },
    }),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const reservedByProductId = new Map(
    activeReservations.map((reservation) => [
      reservation.productId,
      reservation._sum.quantity ?? 0,
    ])
  );
  const preorderProductIds: string[] = [];
  const trackedRequirements: (InventoryRequirement & { backorderQuantity: number })[] = [];
  let newShortage = false;
  const previous = await tx.inventoryReservation.findMany({ where: { orderId: input.orderId } });

  for (const requirement of requirements) {
    const product = productById.get(requirement.productId);
    if (!product?.isPublished) {
      throw new CommerceError(409, "PRODUCTS_UNAVAILABLE", "Товар больше не доступен.");
    }

    if (product.inventoryPolicy !== InventoryPolicy.TRACKED) {
      if (product.inventoryPolicy === InventoryPolicy.PREORDER) preorderProductIds.push(product.id);
      continue;
    }

    const available = Math.max(0, (product.stock ?? 0) - (reservedByProductId.get(product.id) ?? 0));
    const quantity = Math.min(requirement.quantity, available);
    const backorderQuantity = requirement.quantity - quantity;
    if (backorderQuantity > 0) preorderProductIds.push(product.id);
    if (backorderQuantity > (previous.find((row) => row.productId === product.id)?.backorderQuantity ?? 0)) {
      newShortage = true;
    }
    trackedRequirements.push({ productId: product.id, quantity, backorderQuantity });
  }

  if (preorderProductIds.length > 0) {
    await tx.order.update({
      where: { id: input.orderId },
      data: { preorderRequired: true, ...(newShortage ? { preorderConfirmedAt: null, preorderNote: null } : {}) },
    });
    await tx.orderItem.updateMany({
      where: {
        orderId: input.orderId,
        OR: [
          { productId: { in: preorderProductIds } },
          { components: { some: { productId: { in: preorderProductIds } } } },
        ],
      },
      data: { isPreorder: true },
    });
  }

  for (const requirement of trackedRequirements) {
    await tx.inventoryReservation.upsert({
      where: {
        orderId_productId: {
          orderId: input.orderId,
          productId: requirement.productId,
        },
      },
      create: {
        orderId: input.orderId,
        productId: requirement.productId,
        quantity: requirement.quantity,
        backorderQuantity: requirement.backorderQuantity,
        expiresAt: input.expiresAt,
      },
      update: {
        quantity: requirement.quantity,
        backorderQuantity: requirement.backorderQuantity,
        status: InventoryReservationStatus.ACTIVE,
        expiresAt: input.expiresAt,
      },
    });
  }
}

export async function commitInventoryReservations(tx: InventoryClient, orderId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
  );

  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId },
    orderBy: { productId: "asc" },
  });

  await lockProducts(
    tx,
    reservations.map((reservation) => reservation.productId)
  );
  const policies = new Map(
    (
      await tx.product.findMany({
        where: { id: { in: reservations.map((reservation) => reservation.productId) } },
        select: { id: true, inventoryPolicy: true, stock: true },
      })
    ).map((product) => [product.id, product])
  );

  let requiresStockReview = false;

  for (const reservation of reservations) {
    if (reservation.status === InventoryReservationStatus.COMMITTED) {
      continue;
    }

    if (policies.get(reservation.productId)?.inventoryPolicy !== InventoryPolicy.TRACKED) {
      if (reservation.quantity > 0) requiresStockReview = true;
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: InventoryReservationStatus.COMMITTED },
      });
      continue;
    }

      const now = new Date();
      const otherReservations = await tx.inventoryReservation.aggregate({
        where: {
          productId: reservation.productId,
          orderId: { not: orderId },
          status: InventoryReservationStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        _sum: { quantity: true },
      });
      const freeStock = Math.max(0,
        (policies.get(reservation.productId)?.stock ?? 0) - (otherReservations._sum.quantity ?? 0)
      );
      // Late payment cannot take stock promised by an active reservation.
      if (reservation.status !== InventoryReservationStatus.ACTIVE || reservation.expiresAt <= now) {
        requiresStockReview = true;
      }
      const quantity = Math.min(reservation.quantity, freeStock);
    if (quantity < reservation.quantity) requiresStockReview = true;
    const updated = quantity === 0 ? { count: 1 } : await tx.product.updateMany({
      where: {
        id: reservation.productId,
        inventoryPolicy: InventoryPolicy.TRACKED,
        stock: { gte: quantity },
      },
      data: { stock: { decrement: quantity } },
    });

    if (updated.count === 0) {
      requiresStockReview = true;
      continue;
    }

    if (quantity > 0) await tx.inventoryMovement.create({
      data: {
        productId: reservation.productId,
        orderId,
        delta: -quantity,
        reason: InventoryMovementReason.SALE,
        note: "Списание после подтвержденной оплаты",
      },
    });
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: {
        status: InventoryReservationStatus.COMMITTED,
        quantity,
        backorderQuantity: { increment: reservation.quantity - quantity },
      },
    });
  }

  if (requiresStockReview) {
    await tx.order.update({
      where: { id: orderId },
      data: { requiresStockReview: true },
    });
  }

  return { requiresStockReview };
}

export async function releaseOrderReservations(
  tx: InventoryClient,
  orderId: string,
  status: InventoryReservationStatus = InventoryReservationStatus.RELEASED
) {
  await tx.inventoryReservation.updateMany({
    where: {
      orderId,
      status: InventoryReservationStatus.ACTIVE,
    },
    data: { status },
  });
}

export async function fulfillOrderBackorders(tx: InventoryClient, orderId: string) {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, status: InventoryReservationStatus.COMMITTED, backorderQuantity: { gt: 0 } },
    orderBy: { productId: "asc" },
  });
  await lockProducts(tx, reservations.map((row) => row.productId));
  for (const reservation of reservations) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: reservation.productId } });
    if (product.inventoryPolicy !== InventoryPolicy.TRACKED || product.stock === null) {
      throw new CommerceError(409, "STOCK_POLICY_CHANGED", `Проверьте правило учёта товара «${product.name}» перед сборкой.`);
    }
    const active = await tx.inventoryReservation.aggregate({
      where: { productId: product.id, status: InventoryReservationStatus.ACTIVE, expiresAt: { gt: new Date() }, orderId: { not: orderId } },
      _sum: { quantity: true },
    });
    const available = Math.max(0, product.stock - (active._sum.quantity ?? 0));
    if (available < reservation.backorderQuantity) {
      throw new CommerceError(409, "BACKORDER_NOT_AVAILABLE", `Для сборки «${product.name}» нужно ещё ${reservation.backorderQuantity} ед., свободно ${available}. Сначала внесите поступление на склад.`);
    }
    await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: reservation.backorderQuantity } } });
    await tx.inventoryMovement.create({ data: {
      productId: product.id, orderId, delta: -reservation.backorderQuantity,
      reason: InventoryMovementReason.SALE, note: "Списание поступившего товара под заказ при сборке",
    } });
    await tx.inventoryReservation.update({ where: { id: reservation.id }, data: {
      quantity: { increment: reservation.backorderQuantity }, backorderQuantity: 0,
    } });
  }
}

export async function reserveInventoryForExistingOrder(
  tx: InventoryClient,
  orderId: string,
  expiresAt = new Date(Date.now() + RESERVATION_TTL_MS)
) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      items: {
        select: {
          kind: true,
          productId: true,
          quantity: true,
          components: {
            select: { productId: true, quantity: true },
          },
        },
      },
    },
  });

  if (!order) {
    throw new CommerceError(404, "ORDER_NOT_FOUND", "Заказ не найден.");
  }

  const requirements: InventoryRequirement[] = [];
  for (const item of order.items) {
    if (item.productId) {
      requirements.push({ productId: item.productId, quantity: item.quantity });
    }
    for (const component of item.components) {
      if (component.productId) {
        requirements.push({
          productId: component.productId,
          quantity: component.quantity * item.quantity,
        });
      }
    }
  }

  await createInventoryReservations(tx, { orderId, requirements, expiresAt });
}

export async function expireStaleReservations(prisma: RootInventoryClient) {
  return prisma.inventoryReservation.updateMany({
    where: {
      status: InventoryReservationStatus.ACTIVE,
      expiresAt: { lte: new Date() },
      order: { paymentStatus: { not: "SUCCEEDED" } },
    },
    data: { status: InventoryReservationStatus.EXPIRED },
  });
}
