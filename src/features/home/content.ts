export const quickCategoryIcons: Record<string, string> = {
  tomaty: "/category-icons/tomaty-reference.png",
  ogurtsy: "/category-icons/ogurtsy-reference.png",
  pertsy: "/category-icons/pertsy-reference.png",
  svekla: "/category-icons/svekla-reference.png",
  kukuruza: "/category-icons/kukuruza-reference.png",
  morkov: "/category-icons/morkov-reference.png",
};

export const advantages = [
  {
    icon: "выбор",
    title: "Понятный выбор",
    text: "Категории и подборки собраны так, чтобы быстро найти нужное даже новичку.",
  },
  {
    icon: "фото",
    title: "Реальные карточки",
    text: "Каждый товар с фото, категорией, ценой и быстрым добавлением в корзину.",
  },
  {
    icon: "заказ",
    title: "Уверенная покупка",
    text: "Прозрачные условия доставки и оплаты, контакты всегда под рукой.",
  },
  {
    icon: "каталог",
    title: "Каталог под рукой",
    text: "На главной есть быстрый вход в категории и превью товаров для первого выбора.",
  },
];

export const faqPreview = [
  {
    question: "Можно ли купить без регистрации?",
    answer: "Да, оформление доступно в несколько шагов без регистрации личного кабинета.",
  },
  {
    question: "Как выбрать семена новичку?",
    answer: "Ответьте на три вопроса в подборе — он предложит доступные семена и объяснит выбор.",
  },
  {
    question: "Где посмотреть условия доставки?",
    answer: "На старте доступны бесплатный самовывоз и доставка по Воронежу после согласования.",
  },
];

export const fallbackQuickCategories = [
  {
    name: "Томаты",
    slug: "tomaty",
    href: "/catalog/tomaty",
    iconSrc: "/category-icons/tomaty-reference.png",
  },
  {
    name: "Огурцы",
    slug: "ogurtsy",
    href: "/catalog/ogurtsy",
    iconSrc: "/category-icons/ogurtsy-reference.png",
  },
  {
    name: "Перцы",
    slug: "pertsy",
    href: "/catalog/pertsy",
    iconSrc: "/category-icons/pertsy-reference.png",
  },
  {
    name: "Свекла",
    slug: "svekla",
    href: "/catalog/svekla",
    iconSrc: "/category-icons/svekla-reference.png",
  },
  {
    name: "Кукуруза",
    slug: "kukuruza",
    href: "/catalog/kukuruza",
    iconSrc: "/category-icons/kukuruza-reference.png",
  },
  {
    name: "Морковь",
    slug: "morkov",
    href: "/catalog/morkov",
    iconSrc: "/category-icons/morkov-reference.png",
  },
];

export type CategoryCard = {
  name: string;
  slug: string;
  href: string;
  iconSrc: string;
};
