/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv/config");

const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");

const DEPRECATED_VEGETABLES_CATEGORY = {
  name: "Овощи",
  slug: "ovoshchi",
};

const VEGETABLE_CATEGORIES = [
  {
    name: "Томаты",
    slug: "tomaty",
    description: "Семена томатов для теплиц, грядок и стабильного сезонного урожая.",
    prefixes: ["томат"],
  },
  {
    name: "Огурцы",
    slug: "ogurtsy",
    description: "Огурцы и корнишоны для свежего сбора, засолки и тепличной посадки.",
    prefixes: ["огурец"],
  },
  {
    name: "Перцы",
    slug: "pertsy",
    description: "Сладкие и острые перцы для открытого грунта, теплиц и домашних заготовок.",
    prefixes: ["перец"],
  },
  {
    name: "Баклажаны",
    slug: "baklazhany",
    description: "Баклажаны для рассады, теплиц и теплых солнечных грядок.",
    prefixes: ["баклажан"],
  },
  {
    name: "Капуста",
    slug: "kapusta",
    description: "Белокочанная, цветная и другие виды капусты для сезонной посадки.",
    prefixes: ["капуста"],
  },
  {
    name: "Морковь",
    slug: "morkov",
    description: "Морковь разных сроков созревания для грядок, хранения и свежего урожая.",
    prefixes: ["морковь"],
  },
  {
    name: "Свекла",
    slug: "svekla",
    description: "Свекла для летнего сбора, хранения и домашней кухни.",
    prefixes: ["свекла"],
  },
  {
    name: "Редис",
    slug: "redis",
    description: "Редис для раннего урожая, быстрых посевов и свежих салатов.",
    prefixes: ["редис"],
  },
  {
    name: "Дыни",
    slug: "dyni",
    description: "Дыни для теплых грядок, рассады и сладкого летнего урожая.",
    prefixes: ["дыня"],
  },
  {
    name: "Арбузы",
    slug: "arbuzy",
    description: "Арбузы для солнечных участков, рассады и летнего выращивания.",
    prefixes: ["арбуз"],
  },
  {
    name: "Кукуруза",
    slug: "kukuruza",
    description: "Сахарная кукуруза для свежих початков и сезонных посадок.",
    prefixes: ["кукуруза"],
  },
  {
    name: "Кабачки",
    slug: "kabachki",
    description: "Кабачки и корнишоны для урожайных грядок и домашней кухни.",
    prefixes: ["кабачок"],
  },
  {
    name: "Горох",
    slug: "goroh",
    description: "Горох для раннего сладкого урожая и посадки на грядках.",
    prefixes: ["горох"],
  },
  {
    name: "Лук",
    slug: "luk",
    description: "Лук для зелени, репки, озимых посадок и сезонного выращивания.",
    prefixes: ["лук"],
  },
];

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

function detectVegetableCategoryName(productName) {
  const lower = productName.toLowerCase();
  const category = VEGETABLE_CATEGORIES.find((candidate) =>
    candidate.prefixes.some((prefix) => lower.startsWith(prefix))
  );

  return category?.name ?? null;
}

async function ensureVegetableCategories() {
  const values = [];
  const params = [];

  VEGETABLE_CATEGORIES.forEach((category, index) => {
    const offset = index * 6;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, now(), now())`
    );
    params.push(
      randomUUID(),
      category.name,
      category.slug,
      category.description,
      `${category.name} | Магазин семян`,
      category.description
    );
  });

  await pool.query(
    `insert into "Category" (
      id, name, slug, description, "seoTitle", "seoDescription", "createdAt", "updatedAt"
    ) values ${values.join(", ")}
    on conflict (slug) do nothing`,
    params
  );

  const categories = await pool.query(
    'select id, name from "Category" where slug = any($1::text[])',
    [VEGETABLE_CATEGORIES.map((category) => category.slug)]
  );

  return new Map(categories.rows.map((category) => [category.name, category]));
}

async function splitDeprecatedVegetablesCategory(categoryByName) {
  const deprecatedCategoryResult = await pool.query(
    'select id from "Category" where slug = $1 or name = $2 order by "createdAt" asc limit 1',
    [DEPRECATED_VEGETABLES_CATEGORY.slug, DEPRECATED_VEGETABLES_CATEGORY.name]
  );
  const deprecatedCategory = deprecatedCategoryResult.rows[0];

  if (!deprecatedCategory) {
    console.log("Старая категория Овощи не найдена, перенос не требуется.");
    return;
  }

  const products = await pool.query(
    'select id, name, slug from "Product" where "categoryId" = $1 order by name asc',
    [deprecatedCategory.id]
  );

  if (products.rows.length === 0) {
    await pool.query('delete from "Category" where id = $1', [deprecatedCategory.id]);
    console.log("Старая категория Овощи была пустой и удалена.");
    return;
  }

  const unmatched = [];
  const productIdsByCategoryName = new Map();

  for (const product of products.rows) {
    const categoryName = detectVegetableCategoryName(product.name);

    if (!categoryName) {
      unmatched.push(product);
      continue;
    }

    const productIds = productIdsByCategoryName.get(categoryName) ?? [];
    productIds.push(product.id);
    productIdsByCategoryName.set(categoryName, productIds);
  }

  let movedCount = 0;

  for (const [categoryName, productIds] of productIdsByCategoryName) {
    const targetCategory = categoryByName.get(categoryName);

    if (!targetCategory) {
      throw new Error(`Target category is missing: ${categoryName}`);
    }

    const result = await pool.query(
      'update "Product" set "categoryId" = $1, "updatedAt" = now() where id = any($2::text[])',
      [targetCategory.id, productIds]
    );

    movedCount += result.rowCount;
    console.log(`Перенесено в ${categoryName}: ${result.rowCount}`);
  }

  const remaining = await pool.query(
    'select count(*)::int as count from "Product" where "categoryId" = $1',
    [deprecatedCategory.id]
  );
  const remainingCount = remaining.rows[0]?.count ?? 0;

  if (remainingCount === 0) {
    await pool.query('delete from "Category" where id = $1', [deprecatedCategory.id]);
    console.log("Старая категория Овощи удалена после переноса.");
  } else {
    console.warn(`В старой категории Овощи осталось товаров: ${remainingCount}`);
  }

  if (unmatched.length > 0) {
    console.warn("Не удалось автоматически определить овощную категорию для товаров:");
    for (const product of unmatched) {
      console.warn(`- ${product.name} (${product.slug})`);
    }
  }

  console.log(`Всего перенесено товаров: ${movedCount}`);
}

async function main() {
  const categoryByName = await ensureVegetableCategories();
  await splitDeprecatedVegetablesCategory(categoryByName);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
