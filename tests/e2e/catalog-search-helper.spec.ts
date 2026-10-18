import { expect, test } from "@playwright/test";
import { getCatalogSearchTermGroups } from "../../src/entities/product/model/catalog-search";

test("поиск ограничивает сложность слишком длинного запроса", () => {
  const groups = getCatalogSearchTermGroups(
    "alpha beta gamma delta epsilon zeta theta iota kappa"
  );

  expect(groups).toHaveLength(8);
});
