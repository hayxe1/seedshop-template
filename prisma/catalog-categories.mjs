export const DEPRECATED_VEGETABLES_CATEGORY = {
  name: "Овощи",
  slug: "ovoshchi",
};

export const VEGETABLE_CATEGORIES = [
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

export const BASE_CATEGORIES = [
  {
    name: "Зелень",
    slug: "zelen",
    description: "Скороспелая зелень для свежего урожая и домашней кухни.",
  },
  {
    name: "Цветы",
    slug: "tsvety",
    description: "Декоративные цветы для сада, клумб и контейнеров.",
  },
  {
    name: "Семена",
    slug: "semena",
    description: "Универсальные позиции каталога семян на сезон.",
  },
];

export const CATALOG_CATEGORIES = [...VEGETABLE_CATEGORIES, ...BASE_CATEGORIES];

const vegetableCategoryNames = new Set(VEGETABLE_CATEGORIES.map((category) => category.name));

export function detectVegetableCategoryName(productName) {
  const lower = productName.toLowerCase();
  const category = VEGETABLE_CATEGORIES.find((candidate) =>
    candidate.prefixes.some((prefix) => lower.startsWith(prefix))
  );

  return category?.name ?? null;
}

export function isVegetableCategoryName(categoryName) {
  return vegetableCategoryNames.has(categoryName);
}
