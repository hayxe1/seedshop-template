const MIN_TOKEN_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const MAX_QUERY_TOKENS = 8;
const MAX_TERM_VARIANTS = 16;

const STOP_WORDS = new Set([
  "в",
  "во",
  "и",
  "или",
  "к",
  "ко",
  "на",
  "по",
  "с",
  "со",
  "для",
  "под",
  "над",
  "без",
  "семена",
  "семян",
  "семя",
  "купить",
]);

const CANONICAL_SEARCH_TERMS: Record<string, string> = {
  огурец: "огурец",
  огурцы: "огурец",
  огурца: "огурец",
  огурцов: "огурец",
  огурцом: "огурец",
  огурцах: "огурец",
  огурцами: "огурец",
  огурчик: "огурец",
  огурчики: "огурец",
  корнишон: "огурец",
  корнишоны: "огурец",

  томат: "томат",
  томаты: "томат",
  томата: "томат",
  томатов: "томат",
  томатом: "томат",
  помидор: "томат",
  помидоры: "томат",
  помидора: "томат",
  помидоров: "томат",

  перец: "перец",
  перцы: "перец",
  перца: "перец",
  перцев: "перец",
  перцем: "перец",

  свекла: "свекла",
  свеклы: "свекла",
  свеклу: "свекла",
  свеклой: "свекла",

  кукуруза: "кукуруза",
  кукурузы: "кукуруза",
  кукурузу: "кукуруза",
  кукурузой: "кукуруза",

  зелень: "зелень",
  зелени: "зелень",
  зеленый: "зелень",
  зеленая: "зелень",
  зеленые: "зелень",

  укроп: "укроп",
  укропа: "укроп",
  петрушка: "петрушка",
  петрушки: "петрушка",
  салат: "салат",
  салаты: "салат",
  салата: "салат",
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token));
}

function stemRussianToken(token: string) {
  if (token.length <= 4) {
    return token;
  }

  const endings = [
    "ыми",
    "ими",
    "ого",
    "его",
    "ому",
    "ему",
    "ами",
    "ями",
    "ах",
    "ях",
    "ов",
    "ев",
    "ые",
    "ие",
    "ый",
    "ий",
    "ая",
    "яя",
    "ое",
    "ее",
    "ам",
    "ям",
    "ом",
    "ем",
    "ой",
    "ей",
    "ою",
    "ею",
    "а",
    "я",
    "ы",
    "и",
    "у",
    "ю",
    "е",
  ];

  const ending = endings.find((candidate) => token.endsWith(candidate));
  if (!ending || token.length - ending.length < 3) {
    return token;
  }

  return token.slice(0, -ending.length);
}

function canonicalize(token: string) {
  return CANONICAL_SEARCH_TERMS[token] ?? token;
}

function addYoVariants(keys: Set<string>, value: string) {
  if (keys.size >= MAX_TERM_VARIANTS) {
    return;
  }

  const variants = new Set([value, value.replaceAll("е", "ё")]);

  for (let index = 0; index < value.length && variants.size < MAX_TERM_VARIANTS; index += 1) {
    if (value[index] !== "е") {
      continue;
    }

    for (const variant of Array.from(variants)) {
      variants.add(`${variant.slice(0, index)}ё${variant.slice(index + 1)}`);

      if (variants.size >= MAX_TERM_VARIANTS) {
        break;
      }
    }
  }

  for (const variant of variants) {
    keys.add(variant);

    if (keys.size >= MAX_TERM_VARIANTS) {
      break;
    }
  }
}

function getTokenKeys(token: string) {
  if (token === "f1" || token === "ф1") return new Set(["f1", "ф1"]);
  const canonical = canonicalize(token);
  const keys = new Set<string>();

  for (const value of [
    token,
    canonical,
    stemRussianToken(token),
    stemRussianToken(canonical),
  ]) {
    addYoVariants(keys, value);
  }

  return keys;
}

export function getCatalogSearchTermGroups(rawQuery: string): string[][] {
  return tokenize(rawQuery.slice(0, MAX_QUERY_LENGTH))
    .slice(0, MAX_QUERY_TOKENS)
    .map((token) =>
      Array.from(getTokenKeys(token)).filter((key) => key.length >= MIN_TOKEN_LENGTH)
    );
}
