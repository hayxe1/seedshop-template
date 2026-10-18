# Data Model
## Online Seed Store

> Historical baseline. The current production model includes payment attempts/events, inventory reservations/movements, shipment, notification outbox, order history and immutable set-component snapshots. Use `prisma/schema.prisma` and `docs/commerce-operations.md` as the authoritative references.

---

## 1. Purpose

This document defines the core data entities of the project, their fields, and relationships.

It serves as a bridge between:
- requirements.md
- arch-rules.md
- Prisma schema
- API design

The data model must remain simple and aligned with initial release scope.

---

## 2. Modeling Principles

- Keep the data model minimal
- Include only entities required for initial release
- Do not introduce user accounts for customers
- Do not introduce bonus or loyalty tables for initial release
- Use phone number in orders as the main customer identifier for repeat purchases
- Keep SEO fields only where they are truly needed
- Keep category structure flat for initial release unless nested categories become necessary later

---

## 3. Core Entities

The initial release includes the following entities:
- Product
- ProductImage
- Category
- SeedSet
- SeedSetItem
- Order
- OrderItem
- AdminUser

Optional future entities (not part of initial release):
- Payment
- PromoCode
- Customer
- BlogPost
- LoyaltyRecord

---

## 4. Entity: Product

### Purpose
Represents a product sold in the store.

### Fields
- `id` — unique identifier
- `name` — product name
- `slug` — unique URL-friendly product identifier
- `description` — main product description
- `shortDescription` — optional short text for cards and previews
- `price` — product price
- `mainImageUrl` — optional main image for cards and previews
- `plantingTips` — optional planting recommendations
- `isPublished` — whether product is visible in storefront
- `stock` — optional stock amount
- `categoryId` — reference to category
- `seoTitle` — optional SEO title
- `seoDescription` — optional SEO description
- `createdAt` — creation timestamp
- `updatedAt` — update timestamp

### Rules
- `name` is required
- `slug` is required and must be unique
- `price` is required and must be non-negative
- `categoryId` is required
- `isPublished` defaults to true or false depending on implementation choice
- `seoTitle` and `seoDescription` may be empty for initial release, but fields should exist
- product variants are out of scope for initial release unless packaging options become required

### Relationships
- belongs to one `Category`
- has many `ProductImage`
- can appear in many `OrderItem`
- can belong to many `SeedSet` through `SeedSetItem`

---

## 5. Entity: ProductImage

### Purpose
Represents an image attached to a product.

### Fields
- `id` — unique identifier
- `productId` — reference to `Product`
- `url` — image URL
- `position` — optional sort order
- `createdAt` — creation timestamp

### Rules
- a product may have multiple images
- at least one image should exist for published products
- images are ordered by `position`

### Relationships
- belongs to one `Product`

---

## 6. Entity: Category

### Purpose
Represents a product category.

### Fields
- `id` — unique identifier
- `name` — category name
- `slug` — unique URL-friendly identifier
- `description` — optional category description
- `seoTitle` — optional SEO title
- `seoDescription` — optional SEO description
- `createdAt` — creation timestamp
- `updatedAt` — update timestamp

### Rules
- `name` is required
- `slug` is required and must be unique
- category hierarchy is flat for initial release
- no parentCategoryId for initial release unless explicitly needed later

### Relationships
- has many `Product`

---

## 7. Entity: SeedSet

### Purpose
Represents a ready-made seed set shown on the storefront.

### Fields
- `id` — unique identifier
- `name` — set name
- `slug` — unique URL-friendly identifier
- `description` — full set description
- `shortDescription` — optional short text for previews
- `imageUrl` — optional main image
- `price` — set price stored explicitly for storefront and discount flexibility
- `isPublished` — whether set is visible in storefront
- `seoTitle` — optional SEO title
- `seoDescription` — optional SEO description
- `createdAt` — creation timestamp
- `updatedAt` — update timestamp

### Rules
- `name` is required
- `slug` is required and must be unique
- seed sets are fixed and managed manually during initial release
- set price is stored explicitly and is not computed dynamically from product prices
- admin CRUD for seed sets is out of scope for initial release

### Relationships
- contains many `Product` through `SeedSetItem`

---

## 8. Entity: SeedSetItem

### Purpose
Join entity for the many-to-many relationship between `SeedSet` and `Product`.

### Fields
- `id` — unique identifier
- `seedSetId` — reference to `SeedSet`
- `productId` — reference to `Product`
- `position` — optional sort order inside the set
- `createdAt` — creation timestamp

### Rules
- each row links one product to one seed set
- duplicate product links inside the same seed set should not be allowed

### Relationships
- belongs to one `SeedSet`
- belongs to one `Product`

---

## 9. Entity: Order

### Purpose
Represents a customer order created without registration.

### Fields
- `id` — unique identifier
- `customerName` — customer name
- `phone` — customer phone number
- `email` — optional email
- `address` — delivery address stored as a single free-text field
- `comment` — optional customer comment
- `status` — order status
- `totalPrice` — total order amount
- `isRepeatCustomer` — optional derived/admin-help flag
- `createdAt` — creation timestamp
- `updatedAt` — update timestamp

### Rules
- orders are created without customer accounts
- `phone` is required and used as the main identifier for repeat customers
- `status` is required
- allowed status values for initial release:
  - `pending`
  - `confirmed`
  - `completed`
  - `cancelled`
- `totalPrice` is required and must be non-negative
- `isRepeatCustomer` can be computed dynamically instead of stored permanently; implementation choice can be decided later

### Relationships
- has many `OrderItem`

---

## 10. Entity: OrderItem

### Purpose
Represents a single product line inside an order.

### Fields
- `id` — unique identifier
- `orderId` — reference to `Order`
- `productId` — reference to `Product`
- `productNameSnapshot` — product name at the time of order
- `priceSnapshot` — product price at the time of order
- `quantity` — number of units
- `createdAt` — creation timestamp

### Rules
- order items must store snapshot values so future product changes do not affect old orders
- `quantity` is required and must be greater than zero
- `priceSnapshot` is required and must be non-negative
- seed sets are not stored as a separate order item type; they expand into regular product-based order items in cart and order flow

### Relationships
- belongs to one `Order`
- references one `Product`

---

## 11. Entity: AdminUser

### Purpose
Represents an administrator who can access the admin panel.

### Fields
- `id` — unique identifier
- `name` — optional admin display name
- `email` — admin login email
- `passwordHash` — hashed password
- `isActive` — whether admin can sign in
- `createdAt` — creation timestamp
- `updatedAt` — update timestamp

### Rules
- only admin users exist in initial release auth
- email must be unique
- password must never be stored in plain text
- inactive admins must not be allowed to sign in

### Relationships
- no required relational links for initial release

---

## 12. Entity Relationships Overview

### Product ↔ Category
- one category has many products
- one product belongs to one category

### Product ↔ ProductImage
- one product has many images
- one product image belongs to one product

### Product ↔ SeedSet
- many-to-many
- implemented through `SeedSetItem`

### Order ↔ OrderItem
- one order has many order items
- one order item belongs to one order

### Product ↔ OrderItem
- one product can appear in many order items
- one order item references one product

---

## 13. Enum: OrderStatus

For initial release, order status must use a fixed set of values:

- `pending`
- `confirmed`
- `completed`
- `cancelled`

No extra statuses should be added unless business requirements change.

---

## 14. Fields Required for SEO

SEO-related fields should exist for:

### Product
- `slug`
- `seoTitle`
- `seoDescription`

### Category
- `slug`
- `seoTitle`
- `seoDescription`

### SeedSet
- `slug`
- `seoTitle`
- `seoDescription`

For initial release, `slug` is required.
`seoTitle` and `seoDescription` are optional but recommended.

---

## 15. Fields Required for Admin Workflows

The admin panel needs reliable access to:

### Product
- name
- price
- categoryId
- mainImageUrl
- plantingTips
- isPublished
- slug
- seoTitle
- seoDescription

### Order
- customerName
- phone
- email
- address
- comment
- status
- totalPrice
- createdAt

This must be reflected later in Prisma schema and API design.

---

## 16. Out of Scope for initial release Data Model

The following entities must NOT be added now:

- Customer accounts
- Bonus points
- Loyalty ledger
- Payment transaction model
- Promo codes
- Blog posts
- Reviews
- Warehouse inventory logs
- Delivery tracking
- Nested categories
- Product variants unless packaging options become necessary

These can be added later only if requirements change.

---

## 17. Notes for Prisma Stage

When converting this document into Prisma schema:

- keep model names explicit and consistent
- use timestamps on all core entities
- use unique constraints for:
  - product slug
  - category slug
  - seed set slug
  - admin email
- define one-to-many relation between `Product` and `ProductImage`
- define the many-to-many relation between `SeedSet` and `Product` via `SeedSetItem`
- use enum for `OrderStatus`
- store order item snapshots for name and price

---

## 18. Current Implementation Notes

Этот блок не меняет фундаментальную модель выше, а описывает, как она сейчас реализована в коде.

### 18.1 Runtime source of truth

- storefront runtime, cart, checkout, seed sets и admin работают от Prisma/PostgreSQL;
- каталог больше не собирается на лету из файловой структуры.

### 18.2 Bootstrap import

- `public/product-images` используется как источник для `prisma:seed`;
- seed импортирует товары и изображения в БД, после чего runtime работает уже по Prisma-записям.

### 18.3 Orders contract

- checkout отправляет `items: [{ productId, quantity }]`;
- сервер заново читает продукты из БД;
- `productNameSnapshot`, `priceSnapshot` и `totalPrice` вычисляются на сервере;
- для repeat customer используется `phoneNormalized`.

### 18.4 Seed sets

- наборы живут в `SeedSet` / `SeedSetItem`;
- при добавлении в корзину набор раскрывается в обычные product lines;
- в заказе не появляется отдельная сущность “set item”.

### 18.5 Admin auth

- `AdminUser` используется с app-level login flow;
- session реализована через signed HttpOnly cookie;
- админские страницы и API защищены middleware и server-side guards.

### 18.6 Admin product workflow

В текущей реализации admin уже работает с такими product fields:

- `name`
- `slug`
- `description`
- `shortDescription`
- `price`
- `mainImageUrl`
- `plantingTips`
- `categoryId`
- `isPublished`
- `seoTitle`
- `seoDescription`
- `stock`
