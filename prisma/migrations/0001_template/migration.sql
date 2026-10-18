-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('product', 'seed_set', 'service');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('not_started', 'pending', 'waiting_for_capture', 'succeeded', 'canceled', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('new', 'processing', 'packed', 'shipped', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "InventoryPolicy" AS ENUM ('tracked', 'preorder', 'unlimited');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('active', 'committed', 'released', 'expired');

-- CreateEnum
CREATE TYPE "InventoryMovementReason" AS ENUM ('sale', 'return', 'adjustment');

-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('manager_quote', 'cdek_pickup', 'local_courier', 'self_pickup');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('awaiting_details', 'ready', 'shipped', 'delivered', 'canceled');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'telegram');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "SeedDifficulty" AS ENUM ('beginner', 'intermediate', 'experienced');

-- CreateEnum
CREATE TYPE "LightRequirement" AS ENUM ('full_sun', 'partial_shade', 'shade');

-- CreateEnum
CREATE TYPE "SeedSetRevisionRole" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT,
    "price" INTEGER NOT NULL,
    "mainImageUrl" TEXT,
    "plantingTips" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isPopularToday" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "inventoryPolicy" "InventoryPolicy" NOT NULL DEFAULT 'tracked',
    "manufacturer" TEXT,
    "packSize" TEXT,
    "growingPlaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficulty" "SeedDifficulty",
    "maturityDays" INTEGER,
    "sowMonths" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "transplantMonths" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "harvestMonths" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "lightRequirement" "LightRequirement",
    "regionTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryId" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImageAsset" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedSet" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedSetRevision" (
    "id" TEXT NOT NULL,
    "seedSetId" TEXT NOT NULL,
    "role" "SeedSetRevisionRole" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT,
    "imageUrl" TEXT,
    "price" INTEGER NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedSetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedSetRevisionItem" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedSetRevisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "comment" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'new',
    "totalPrice" INTEGER NOT NULL,
    "subtotalPrice" INTEGER NOT NULL DEFAULT 0,
    "discountPrice" INTEGER NOT NULL DEFAULT 0,
    "giftWrapPrice" INTEGER NOT NULL DEFAULT 0,
    "shippingPrice" INTEGER NOT NULL DEFAULT 0,
    "shippingMethod" "ShippingMethod" NOT NULL DEFAULT 'self_pickup',
    "isRepeatCustomer" BOOLEAN,
    "requiresStockReview" BOOLEAN NOT NULL DEFAULT false,
    "preorderRequired" BOOLEAN NOT NULL DEFAULT false,
    "preorderConfirmedAt" TIMESTAMP(3),
    "preorderNote" TEXT,
    "requiresPaymentReview" BOOLEAN NOT NULL DEFAULT false,
    "checkoutKey" TEXT,
    "checkoutFingerprint" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'not_started',
    "yookassaPaymentId" TEXT,
    "yookassaConfirmationUrl" TEXT,
    "paymentResultTokenHash" TEXT,
    "paymentResultTokenExpiresAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "legalVersion" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderItemKind" NOT NULL DEFAULT 'product',
    "productId" TEXT,
    "seedSetId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "imageUrlSnapshot" TEXT,
    "serviceCode" TEXT,
    "quantity" INTEGER NOT NULL,
    "isPreorder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemComponentSnapshot" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemComponentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'yookassa',
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'not_started',
    "amount" INTEGER NOT NULL,
    "confirmationUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentAttemptId" TEXT,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "backorderQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" "InventoryMovementReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "from" "FulfillmentStatus",
    "to" "FulfillmentStatus" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "ShippingMethod" NOT NULL DEFAULT 'self_pickup',
    "status" "ShipmentStatus" NOT NULL DEFAULT 'awaiting_details',
    "price" INTEGER NOT NULL DEFAULT 0,
    "addressSnapshot" TEXT,
    "trackingNumber" TEXT,
    "managerNote" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_isPublished_updatedAt_idx" ON "Product"("categoryId", "isPublished", "updatedAt");

-- CreateIndex
CREATE INDEX "Product_isPublished_isPopularToday_updatedAt_idx" ON "Product"("isPublished", "isPopularToday", "updatedAt");

-- CreateIndex
CREATE INDEX "Product_inventoryPolicy_stock_idx" ON "Product"("inventoryPolicy", "stock");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductImageAsset_createdAt_idx" ON "ProductImageAsset"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeedSet_slug_key" ON "SeedSet"("slug");

-- CreateIndex
CREATE INDEX "SeedSet_isPublished_updatedAt_idx" ON "SeedSet"("isPublished", "updatedAt");

-- CreateIndex
CREATE INDEX "SeedSetRevision_seedSetId_idx" ON "SeedSetRevision"("seedSetId");

-- CreateIndex
CREATE INDEX "SeedSetRevision_role_updatedAt_idx" ON "SeedSetRevision"("role", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeedSetRevision_seedSetId_role_key" ON "SeedSetRevision"("seedSetId", "role");

-- CreateIndex
CREATE INDEX "SeedSetRevisionItem_revisionId_idx" ON "SeedSetRevisionItem"("revisionId");

-- CreateIndex
CREATE INDEX "SeedSetRevisionItem_productId_idx" ON "SeedSetRevisionItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SeedSetRevisionItem_revisionId_productId_key" ON "SeedSetRevisionItem"("revisionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_yookassaPaymentId_key" ON "Order"("yookassaPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentResultTokenHash_key" ON "Order"("paymentResultTokenHash");

-- CreateIndex
CREATE INDEX "Order_phone_idx" ON "Order"("phone");

-- CreateIndex
CREATE INDEX "Order_phoneNormalized_idx" ON "Order"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_fulfillmentStatus_createdAt_idx" ON "Order"("fulfillmentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_seedSetId_idx" ON "OrderItem"("seedSetId");

-- CreateIndex
CREATE INDEX "OrderItemComponentSnapshot_orderItemId_idx" ON "OrderItemComponentSnapshot"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemComponentSnapshot_productId_idx" ON "OrderItemComponentSnapshot"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerPaymentId_key" ON "PaymentAttempt"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_updatedAt_idx" ON "PaymentAttempt"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_orderId_attemptNumber_key" ON "PaymentAttempt"("orderId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_eventKey_key" ON "PaymentEvent"("eventKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_orderId_createdAt_idx" ON "PaymentEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_providerPaymentId_idx" ON "PaymentEvent"("providerPaymentId");

-- CreateIndex
CREATE INDEX "InventoryReservation_productId_status_expiresAt_idx" ON "InventoryReservation"("productId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_status_expiresAt_idx" ON "InventoryReservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_orderId_productId_key" ON "InventoryReservation"("orderId", "productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_orderId_idx" ON "InventoryMovement"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_deduplicationKey_key" ON "NotificationOutbox"("deduplicationKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_idx" ON "NotificationOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_orderId_idx" ON "NotificationOutbox"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedSetRevision" ADD CONSTRAINT "SeedSetRevision_seedSetId_fkey" FOREIGN KEY ("seedSetId") REFERENCES "SeedSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedSetRevisionItem" ADD CONSTRAINT "SeedSetRevisionItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "SeedSetRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedSetRevisionItem" ADD CONSTRAINT "SeedSetRevisionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_seedSetId_fkey" FOREIGN KEY ("seedSetId") REFERENCES "SeedSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComponentSnapshot" ADD CONSTRAINT "OrderItemComponentSnapshot_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Runtime objects outside Prisma's schema language. Required by checkout and inventory.
CREATE SEQUENCE "Order_orderNumber_seq" AS INTEGER START WITH 1 INCREMENT BY 1;
ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_quantity_nonnegative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "InventoryReservation_backorder_nonnegative" CHECK ("backorderQuantity" >= 0),
  ADD CONSTRAINT "InventoryReservation_total_positive" CHECK ("quantity" + "backorderQuantity" > 0);
ALTER TABLE "OrderItemComponentSnapshot" ADD CONSTRAINT "OrderItemComponentSnapshot_quantity_positive" CHECK ("quantity" > 0);
