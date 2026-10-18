import { z } from "zod";

export const metaSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export type ApiMeta = z.infer<typeof metaSchema>;

export type ApiResponse<T> =
  | { ok: true; data: T; meta?: ApiMeta }
  | { ok: false; code?: string; error: string };

export function apiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.union([
    z.object({
      ok: z.literal(true),
      data: dataSchema,
      meta: metaSchema.optional(),
    }),
    z.object({
      ok: z.literal(false),
      code: z.string().optional(),
      error: z.string(),
    }),
  ]);
}

export function ok<T = undefined>(data?: T, init?: ResponseInit, meta?: ApiMeta) {
  return Response.json({ ok: true, data, ...(meta ? { meta } : {}) }, init);
}

export function fail(status: number, code: string, error: string) {
  return Response.json({ ok: false, code, error }, { status });
}

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  error = "Некорректные данные запроса."
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      return {
        ok: false,
        response: fail(400, "VALIDATION_ERROR", error),
      };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return {
      ok: false,
      response: fail(400, "INVALID_JSON", "Не удалось прочитать JSON запроса."),
    };
  }
}

export class ApiResponseError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly status: number) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export async function parseApiResponse<T extends z.ZodType>(
  response: Response,
  dataSchema: T
): Promise<{ data: z.infer<T>; meta?: ApiMeta }> {
  const parsed = apiResponseSchema(dataSchema).safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new Error("Сервер вернул неожиданный формат ответа.");
  }

  const result = parsed.data as ApiResponse<z.infer<T>>;

  if (!response.ok || !result.ok) {
    throw new ApiResponseError(result.ok ? "Не удалось выполнить запрос." : result.error, result.ok ? undefined : result.code, response.status);
  }

  return result.meta ? { data: result.data, meta: result.meta } : { data: result.data };
}

export const optionalTextInputSchema = z.string().optional();
export const nullableTextSchema = z.string().nullable();
export const isoDateStringSchema = z.string();

export const productImageInputSchema = z.object({
  url: z.string().optional(),
  position: z.number().nullable().optional(),
});

export const productBodySchema = z.object({
  name: optionalTextInputSchema,
  slug: optionalTextInputSchema,
  description: optionalTextInputSchema,
  shortDescription: optionalTextInputSchema,
  price: z.union([z.string(), z.number()]).optional(),
  mainImageUrl: optionalTextInputSchema,
  plantingTips: optionalTextInputSchema,
  categoryId: optionalTextInputSchema,
  isPublished: z.boolean().optional(),
  isPopularToday: z.boolean().optional(),
  isNew: z.boolean().optional(),
  seoTitle: optionalTextInputSchema,
  seoDescription: optionalTextInputSchema,
  stock: z.union([z.string(), z.number(), z.null()]).optional(),
  inventoryPolicy: z.enum(["TRACKED", "PREORDER", "UNLIMITED"]).optional(),
  manufacturer: optionalTextInputSchema,
  packSize: optionalTextInputSchema,
  growingPlaces: z.array(z.string()).optional(),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "EXPERIENCED"]).nullable().optional(),
  maturityDays: z.union([z.string(), z.number(), z.null()]).optional(),
  sowMonths: z.array(z.number()).optional(),
  transplantMonths: z.array(z.number()).optional(),
  harvestMonths: z.array(z.number()).optional(),
  lightRequirement: z.enum(["FULL_SUN", "PARTIAL_SHADE", "SHADE"]).nullable().optional(),
  regionTags: z.array(z.string()).optional(),
  images: z.array(productImageInputSchema).optional(),
});

export const categoryBodySchema = z.object({
  name: optionalTextInputSchema,
  slug: optionalTextInputSchema,
  description: optionalTextInputSchema,
  seoTitle: optionalTextInputSchema,
  seoDescription: optionalTextInputSchema,
});

export const seedSetItemInputSchema = z.object({
  productId: z.string().optional(),
  position: z.number().nullable().optional(),
});

export const seedSetBodySchema = z.object({
  name: optionalTextInputSchema,
  slug: optionalTextInputSchema,
  description: optionalTextInputSchema,
  shortDescription: optionalTextInputSchema,
  imageUrl: optionalTextInputSchema,
  price: z.union([z.string(), z.number()]).optional(),
  isPublished: z.boolean().optional(),
  seoTitle: optionalTextInputSchema,
  seoDescription: optionalTextInputSchema,
  items: z.array(seedSetItemInputSchema).optional(),
});

export const orderStatusSchema = z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"]);
export const fulfillmentStatusSchema = z.enum([
  "NEW",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);
export const paymentStatusSchema = z.enum([
  "NOT_STARTED",
  "PENDING",
  "WAITING_FOR_CAPTURE",
  "SUCCEEDED",
  "CANCELED",
  "FAILED",
  "REFUNDED",
]);
export const shippingMethodSchema = z.enum([
  "MANAGER_QUOTE",
  "CDEK_PICKUP",
  "LOCAL_COURIER",
  "SELF_PICKUP",
]);
export const checkoutShippingMethodSchema = z.enum(["SELF_PICKUP", "LOCAL_COURIER"]);

export const updateOrderStatusBodySchema = z.object({
  status: z.string().optional(),
  note: z.string().max(500).optional(),
});

export const refundOrderBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const updateShipmentBodySchema = z.object({
  method: shippingMethodSchema,
  price: z.number().int().min(0).max(1_000_000),
  address: z.string().trim().max(500).nullable().optional(),
  trackingNumber: z.string().trim().max(120).optional(),
  managerNote: z.string().trim().max(1000).optional(),
});

export const adjustStockBodySchema = z.object({
  stock: z.number().int().min(0).max(1_000_000),
  note: z.string().trim().max(500).optional(),
});

export const stockAdjustmentResultSchema = z.object({
  productId: z.string(),
  stock: z.number(),
  delta: z.number(),
  updatedAt: isoDateStringSchema,
});

export const shipmentResultSchema = z.object({
  method: shippingMethodSchema,
  status: z.enum(["AWAITING_DETAILS", "READY", "SHIPPED", "DELIVERED", "CANCELED"]),
  price: z.number(),
  addressSnapshot: nullableTextSchema,
  trackingNumber: nullableTextSchema,
  managerNote: nullableTextSchema,
  updatedAt: isoDateStringSchema,
});

export const loginBodySchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
});

const orderQuantityInputSchema = z.union([z.string(), z.number()]).refine(
  (value) => {
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 && quantity <= 99;
  },
  { message: "Order item quantity must be between 1 and 99." }
);

export const createOrderItemBodySchema = z.object({
  kind: z.enum(["product", "seedSet"]).optional(),
  productId: z.string().max(128).optional(),
  seedSetId: z.string().max(128).optional(),
  quantity: orderQuantityInputSchema.optional(),
});

export const createOrderBodySchema = z.object({
  customerName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().trim().min(1).max(254).email(),
  address: z.string().max(500).optional(),
  shippingMethod: checkoutShippingMethodSchema.optional(),
  comment: z.string().max(1000).optional(),
  giftWrap: z.boolean().optional(),
  termsAccepted: z.literal(true),
  items: z.array(createOrderItemBodySchema).max(30).optional(),
});

export const productImageRecordSchema = z.object({
  id: z.string(),
  url: z.string(),
  position: z.number().nullable(),
});

export const categoryRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: nullableTextSchema,
  seoTitle: nullableTextSchema,
  seoDescription: nullableTextSchema,
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
  _count: z.object({ products: z.number() }),
});

export const productRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  shortDescription: nullableTextSchema,
  price: z.number(),
  mainImageUrl: nullableTextSchema,
  plantingTips: nullableTextSchema,
  categoryId: z.string(),
  isPublished: z.boolean(),
  isPopularToday: z.boolean(),
  isNew: z.boolean(),
  seoTitle: nullableTextSchema,
  seoDescription: nullableTextSchema,
  stock: z.number().nullable(),
  inventoryPolicy: z.enum(["TRACKED", "PREORDER", "UNLIMITED"]),
  manufacturer: nullableTextSchema,
  packSize: nullableTextSchema,
  growingPlaces: z.array(z.string()),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "EXPERIENCED"]).nullable(),
  maturityDays: z.number().nullable(),
  sowMonths: z.array(z.number()),
  transplantMonths: z.array(z.number()),
  harvestMonths: z.array(z.number()),
  lightRequirement: z.enum(["FULL_SUN", "PARTIAL_SHADE", "SHADE"]).nullable(),
  regionTags: z.array(z.string()),
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema,
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  images: z.array(productImageRecordSchema),
  _count: z.object({ orderItems: z.number(), seedSetItems: z.number() }),
});

export const seedSetPublicationStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "PUBLISHED_WITH_CHANGES",
  "HIDDEN",
]);

export const seedSetReadinessItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  passed: z.boolean(),
});

export const seedSetRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  shortDescription: nullableTextSchema,
  imageUrl: nullableTextSchema,
  price: z.number(),
  isPublished: z.boolean(),
  publicationStatus: seedSetPublicationStatusSchema,
  hasPublishedVersion: z.boolean(),
  hasUnpublishedChanges: z.boolean(),
  isReadyToPublish: z.boolean(),
  isSlugLocked: z.boolean(),
  readiness: z.array(seedSetReadinessItemSchema),
  draftVersion: z.number(),
  publishedVersion: z.number(),
  publishedAt: isoDateStringSchema.nullable(),
  seoTitle: nullableTextSchema,
  seoDescription: nullableTextSchema,
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema,
  items: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      position: z.number().nullable(),
      product: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        price: z.number(),
        stock: z.number().nullable(),
        mainImageUrl: nullableTextSchema,
        isPublished: z.boolean(),
      }),
    })
  ),
});

export const assetRecordSchema = z.object({
  url: z.string(),
  fileName: z.string(),
  folder: z.string(),
});

export const checkoutOrderRecordSchema = z.object({
  preorderPending: z.boolean(),
  orderNumber: z.string(),
  createdAt: isoDateStringSchema,
  paymentStatus: paymentStatusSchema,
  paymentConfirmationUrl: z.string().url().nullable(),
  paymentError: nullableTextSchema,
  orderUrl: z.string(),
  reservationExpiresAt: isoDateStringSchema.nullable(),
});

export const adminOrderItemSchema = z.object({
  isPreorder: z.boolean(),
  id: z.string(),
  kind: z.enum(["PRODUCT", "SEED_SET", "SERVICE"]),
  productId: z.string().nullable(),
  seedSetId: z.string().nullable(),
  productNameSnapshot: z.string(),
  priceSnapshot: z.number(),
  quantity: z.number(),
  stock: z.number().nullable(),
  requiresStockConfirmation: z.boolean(),
  contents: z.array(z.string()),
});

export const adminOrderSchema = z.object({
  backorders: z.array(z.object({ name: z.string(), quantity: z.number().int().positive() })),
  preorderRequired: z.boolean(),
  preorderConfirmedAt: isoDateStringSchema.nullable(),
  preorderNote: nullableTextSchema,
  id: z.string(),
  orderNumber: z.string(),
  customerName: z.string(),
  phone: z.string(),
  email: nullableTextSchema,
  address: nullableTextSchema,
  comment: nullableTextSchema,
  status: orderStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  totalPrice: z.number(),
  isRepeatCustomer: z.boolean().nullable(),
  requiresStockReview: z.boolean(),
  requiresPaymentReview: z.boolean(),
  subtotalPrice: z.number(),
  discountPrice: z.number(),
  giftWrapPrice: z.number(),
  shippingPrice: z.number(),
  shippingMethod: shippingMethodSchema,
  paymentStatus: paymentStatusSchema,
  yookassaPaymentId: z.string().nullable(),
  paidAt: isoDateStringSchema.nullable(),
  paymentUpdatedAt: isoDateStringSchema.nullable(),
  shipment: z
    .object({
      method: shippingMethodSchema,
      status: z.enum(["AWAITING_DETAILS", "READY", "SHIPPED", "DELIVERED", "CANCELED"]),
      price: z.number(),
      addressSnapshot: nullableTextSchema,
      trackingNumber: nullableTextSchema,
      managerNote: nullableTextSchema,
      shippedAt: isoDateStringSchema.nullable(),
      deliveredAt: isoDateStringSchema.nullable(),
    })
    .nullable(),
  statusHistory: z.array(
    z.object({
      id: z.string(),
      from: fulfillmentStatusSchema.nullable(),
      to: fulfillmentStatusSchema,
      actorType: z.string(),
      note: nullableTextSchema,
      createdAt: isoDateStringSchema,
    })
  ),
  paymentAttempts: z.array(
    z.object({
      id: z.string(),
      attemptNumber: z.number(),
      status: paymentStatusSchema,
      providerPaymentId: nullableTextSchema,
      errorMessage: nullableTextSchema,
      createdAt: isoDateStringSchema,
      updatedAt: isoDateStringSchema,
    })
  ),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
  items: z.array(adminOrderItemSchema),
});

export const loginResultSchema = z.object({
  admin: z.object({
    id: z.string(),
    email: z.string(),
  }),
});

export const orderStatusResultSchema = z.object({
  id: z.string(),
  status: fulfillmentStatusSchema,
  updatedAt: isoDateStringSchema,
});

export const confirmPreorderBodySchema = z.object({
  note: z.string().trim().min(3).max(500),
});

export const confirmPreorderResultSchema = z.object({ id: z.string() });

export const refundOrderResultSchema = z.object({
  id: z.string(),
  paymentStatus: paymentStatusSchema,
  refundStatus: z.enum(["pending", "succeeded", "canceled"]),
  refundId: z.string(),
  fullRefund: z.boolean(),
  paymentUpdatedAt: isoDateStringSchema.nullable(),
});

export const publicOrderSchema = z.object({
  preorderPending: z.boolean(),
  preorderNote: nullableTextSchema,
  orderNumber: z.string(),
  customerName: z.string(),
  phone: z.string(),
  email: nullableTextSchema,
  address: nullableTextSchema,
  comment: nullableTextSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  paymentStatus: paymentStatusSchema,
  subtotalPrice: z.number(),
  discountPrice: z.number(),
  giftWrapPrice: z.number(),
  shippingPrice: z.number(),
  totalPrice: z.number(),
  shippingMethod: shippingMethodSchema,
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
  paymentConfirmationUrl: z.string().url().nullable(),
  canRetryPayment: z.boolean(),
  reservationExpiresAt: isoDateStringSchema.nullable(),
  shipment: z
    .object({
      status: z.enum(["AWAITING_DETAILS", "READY", "SHIPPED", "DELIVERED", "CANCELED"]),
      trackingNumber: nullableTextSchema,
      shippedAt: isoDateStringSchema.nullable(),
      deliveredAt: isoDateStringSchema.nullable(),
    })
    .nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["PRODUCT", "SEED_SET", "SERVICE"]),
      isPreorder: z.boolean(),
      productId: nullableTextSchema,
      seedSetId: nullableTextSchema,
      category: nullableTextSchema,
      name: z.string(),
      imageUrl: nullableTextSchema,
      price: z.number(),
      quantity: z.number(),
      contents: z.array(z.string()),
    })
  ),
  timeline: z.array(
    z.object({
      status: fulfillmentStatusSchema,
      note: nullableTextSchema,
      createdAt: isoDateStringSchema,
    })
  ),
});

export const paymentRefreshResultSchema = z.object({
  orderNumber: z.string(),
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  paymentConfirmationUrl: z.string().url().nullable(),
  canRetryPayment: z.boolean(),
});

export const seedSetCartItemProductSchema = z.object({
  stock: z.number().nullable().optional(),
  inventoryPolicy: z.enum(["TRACKED", "PREORDER", "UNLIMITED"]).optional(),
  productId: z.string(),
  slug: z.string(),
  name: z.string(),
  price: z.number(),
  imageUrl: z.string().optional(),
});

export const cartItemSchema = z
  .object({
    itemKey: z.string(),
    kind: z.enum(["product", "seedSet"]),
    productId: z.string().optional(),
    seedSetId: z.string().optional(),
    slug: z.string(),
    name: z.string(),
    category: z.string().optional(),
    price: z.number(),
    imageUrl: z.string().optional(),
    quantity: z.number(),
    stock: z.number().nullable().optional(),
    inventoryPolicy: z.enum(["TRACKED", "PREORDER", "UNLIMITED"]).optional(),
    sourceSeedSetId: z.string().optional(),
    sourceSeedSetName: z.string().optional(),
    items: z.array(seedSetCartItemProductSchema).optional(),
  })
  .superRefine((item, context) => {
    if (item.kind === "product" && !item.productId) {
      context.addIssue({
        code: "custom",
        path: ["productId"],
        message: "productId is required for product cart items.",
      });
    }

    if (item.kind === "seedSet" && !item.seedSetId) {
      context.addIssue({
        code: "custom",
        path: ["seedSetId"],
        message: "seedSetId is required for seed set cart items.",
      });
    }
  });

export type ProductBody = z.infer<typeof productBodySchema>;
export type ProductImageInput = z.infer<typeof productImageInputSchema>;
export type CategoryBody = z.infer<typeof categoryBodySchema>;
export type SeedSetBody = z.infer<typeof seedSetBodySchema>;
export type SeedSetItemInput = z.infer<typeof seedSetItemInputSchema>;
export type ProductRecord = z.infer<typeof productRecordSchema>;
export type CategoryRecord = z.infer<typeof categoryRecordSchema>;
export type SeedSetRecord = z.infer<typeof seedSetRecordSchema>;
export type SeedSetPublicationStatus = z.infer<typeof seedSetPublicationStatusSchema>;
export type SeedSetReadinessItem = z.infer<typeof seedSetReadinessItemSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type ShippingMethod = z.infer<typeof shippingMethodSchema>;
export type PublicOrder = z.infer<typeof publicOrderSchema>;
export type CartItemRecord = z.infer<typeof cartItemSchema>;
export const cartQuoteBodySchema = z.object({
  items: z.array(z.object({
    kind: z.enum(["product", "seedSet"]),
    id: z.string().trim().min(1).max(128),
  })).min(1).max(100),
});

export const cartQuoteLineSchema = z.object({
  itemKey: z.string(),
  data: z.object({
    name: z.string(), slug: z.string(), price: z.number(),
    stock: z.number().nullable(),
    inventoryPolicy: z.enum(["TRACKED", "PREORDER", "UNLIMITED"]).optional(),
    items: z.array(seedSetCartItemProductSchema).optional(),
  }).nullable(),
});
export type SeedSetCartItemProduct = z.infer<typeof seedSetCartItemProductSchema>;
