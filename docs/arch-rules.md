# Architecture Rules
## Online Seed Store

---

## 1. General Principles

- This project is an initial release and must stay simple
- Avoid overengineering
- Do not introduce unnecessary abstractions
- Do not add features not defined in requirements.md
- Focus on working functionality first

---

## 2. Tech Stack (fixed)

Frontend + Backend:
- Next.js (App Router)
- TypeScript

Backend:
- Next.js API routes (no separate backend)

Database:
- PostgreSQL

ORM:
- Prisma

State management:
- Minimal (React state preferred)

---

## 3. Project Structure

Use modular structure:

    src/
     ├── app/
     │   ├── (public routes)
     │   ├── admin/
     │   ├── api/
     │
     ├── entities/
     ├── features/
     ├── shared/
     ├── lib/


---

## 3.1 Folder Structure Rules

### `src/app`
- contains routes, layouts, pages, and API route handlers
- keep `page.tsx` and `layout.tsx` thin
- use route groups for better separation of storefront and admin

Recommended structure:

    src/app/
     ├── (store)/
     │   ├── page.tsx
     │   ├── catalog/
     │   ├── product/[slug]/
     │   ├── sets/
     │   ├── cart/
     │   └── checkout/
     ├── admin/
     └── api/

### `src/entities`
- contains domain entities
- each entity may include:
  - `model/` for types and entity logic
  - `api/` for data access helpers
  - `ui/` for small entity-specific UI components

### `src/features`
- contains user actions and business scenarios
- examples:
  - catalog filters
  - product search
  - add to cart
  - checkout form
  - admin product form

### `src/shared`
- contains reusable code not tied to one entity
- allowed subfolders:
  - `ui/` for generic UI components
  - `hooks/` for shared hooks
  - `lib/` for small utility functions
  - `config/` for routes and config
  - `types/` and `constants/`

### `src/lib`
- contains infrastructure and server-side technical modules
- examples:
  - Prisma client
  - auth helpers
  - env config
  - SEO helpers

### Forbidden structure patterns
- do not create large global folders like:
  - `src/components`
  - `src/utils`
  - `src/services`
- place code into `entities`, `features`, `shared`, or `lib` instead

### Server and Client boundaries
- server components by default
- use `use client` only when interactivity is required
- database access must stay on the server
- do not mix Prisma logic into client components

### Naming rules
- use consistent kebab-case for files
- examples:
  - `product-card.tsx`
  - `checkout-form.tsx`
  - `get-product-by-slug.ts`
  - `update-order-status.ts`

---

## 4. Routing Rules

- Use Next.js App Router only

Public routes:
- /
- /catalog
- /product/[slug]
- /sets

Admin routes:
- /admin/*

API routes:
- /api/*

---

## 5. Backend Rules

- All server logic must be inside:
  - API routes OR server components
- Do NOT create a separate backend service
- Do NOT introduce microservices

---

## 6. Database Rules

- All database access goes through Prisma
- No raw SQL unless absolutely necessary
- All entities must be defined in Prisma schema

---

## 7. API Rules

- Use REST-style endpoints
- Naming must be consistent:
  - /api/products
  - /api/orders
- Validate all inputs
- Return consistent JSON responses

---

## 8. Admin Panel Rules

- Admin panel is part of the same Next.js app
- Located under /admin
- Must be protected (authentication required)

Admin features (strict scope):
- manage products (CRUD)
- view orders
- update order status
- search by phone
- edit SEO fields (title, description, slug)

Out of scope for admin:
- category management
- seed set management

---

## 9. SEO Rules (critical)

### 9.1 Slugs
- All products must have a slug
- Slugs must be URL-friendly
- Slugs must be unique

---

### 9.2 Rendering

- Product pages MUST be server-rendered
- Category pages MUST be server-rendered
- Do NOT rely on client-side rendering for SEO pages

---

### 9.3 Metadata

- Each product must have:
  - title
  - description
- Metadata must be dynamic

---

### 9.4 Indexing Rules

Must be indexed:
- product pages
- category pages

Must NOT be indexed:
- /cart
- /checkout
- /admin

---

### 9.5 Required files

- sitemap.xml must be generated
- robots.txt must exist

---

## 10. UI Rules

- Keep UI simple and clean
- Avoid complex design systems
- Use reusable components
- Focus on usability for non-technical users

---

## 11. Performance Rules

- Optimize images
- Avoid unnecessary re-renders
- Avoid heavy client-side logic
- Prefer server-side data fetching

---

## 12. Security Rules

- Validate all inputs
- Protect admin routes
- Do not expose sensitive data

---

## 13. Scope Control (very important)

Do NOT add:
- user accounts
- bonus systems
- complex filters
- CMS integrations

Do NOT expand requirements without approval

---

## 14. Development Rules (for AI / Cursor)

- Follow requirements.md strictly
- Do not invent features
- Keep implementations simple and clear
- Prefer simple solutions over complex ones

---

## 15. Current Implementation Notes

Этот раздел не заменяет правила выше, а фиксирует текущее состояние реализации, сложившееся за последние итерации разработки.

### 15.1 Runtime source of truth

- storefront runtime теперь использует Prisma/PostgreSQL как основной источник данных;
- cart, checkout, seed sets и admin опираются на те же product records;
- `public/product-images` больше не используется как runtime-каталог.

### 15.2 Bootstrap catalog

- файловая структура `public/product-images` используется как bootstrap-источник для `prisma:seed`;
- импорт из файловой структуры допустим только на seed/bootstrap-этапе.

### 15.3 Orders contract

- `POST /api/orders` принимает клиентские позиции в формате `productId + quantity`;
- цена, имя товара, snapshot-поля и итоговая сумма должны рассчитываться на сервере из Prisma;
- repeat customer определяется по нормализованному телефону.

### 15.4 Seed sets behavior

- готовые наборы работают через `SeedSet` / `SeedSetItem`;
- при добавлении набора в корзину он раскладывается в реальные product lines;
- order flow не хранит отдельный тип “set item”.

### 15.5 Admin protection

- admin routes и admin APIs защищены встроенной app-level авторизацией;
- используется login page + signed HttpOnly cookie session;
- `middleware.ts` и server-side guards работают как два слоя защиты;
- ограничения на уровне Caddy/firewall могут использоваться дополнительно, но не вместо встроенной защиты.

### 15.6 SEO implementation notes

- в root layout используется `metadataBase`;
- product and category pages используют dynamic metadata;
- в проекте есть `robots.txt` и `sitemap.xml`;
- `/cart`, `/checkout` и `/admin` должны оставаться `noindex`.
