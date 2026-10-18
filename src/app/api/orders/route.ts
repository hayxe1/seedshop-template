import { getYookassaCredentials } from "@/lib/env";
import { isNormalizedPhone, normalizePhone } from "@/lib/phone";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  createOrResumeCheckout,
  findCheckoutByKey,
  normalizeCheckoutKey,
  type CheckoutItemInput,
} from "@/server/commerce/checkout";
import { LEGAL_DOCUMENT_VERSION } from "@/shared/legal/version";
import { isCommerceError } from "@/server/commerce/errors";
import { scheduleNotificationOutboxProcessing } from "@/server/commerce/notification-worker";
import { createOrderBodySchema, fail, ok, parseJsonBody } from "@/shared/api/contracts";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeQuantity(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 99) {
    return 0;
  }

  return Math.floor(number);
}

function normalizeOrderItems(rawItems: unknown[]) {
  const quantities = new Map<string, CheckoutItemInput>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as {
      kind?: string;
      productId?: unknown;
      seedSetId?: unknown;
      quantity?: unknown;
    };
    const quantity = normalizeQuantity(candidate.quantity);
    if (quantity <= 0) {
      continue;
    }

    if (candidate.kind === "seedSet") {
      const seedSetId = normalizeString(candidate.seedSetId);
      if (!seedSetId) {
        continue;
      }
      const key = `seedSet:${seedSetId}`;
      const previous = quantities.get(key);
      const nextQuantity = (previous?.quantity ?? 0) + quantity;
      if (nextQuantity > 99) {
        return [];
      }
      quantities.set(key, { kind: "seedSet", seedSetId, quantity: nextQuantity });
      continue;
    }

    const productId = normalizeString(candidate.productId);
    if (!productId) {
      continue;
    }
    const key = `product:${productId}`;
    const previous = quantities.get(key);
    const nextQuantity = (previous?.quantity ?? 0) + quantity;
    if (nextQuantity > 99) {
      return [];
    }
    quantities.set(key, { kind: "product", productId, quantity: nextQuantity });
  }

  return Array.from(quantities.values());
}

function isVoronezhAddress(value: string) {
  return /(^|[\s,])(?:г\.?\s*)?воронеж(?:[\s,]|$)/iu.test(value);
}

export async function POST(request: Request) {
  try {
    const bodyResult = await parseJsonBody(request, createOrderBodySchema);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const checkoutKey = normalizeCheckoutKey(request.headers.get("Idempotency-Key"));
    if (!checkoutKey) {
      return fail(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Не удалось безопасно начать оформление. Обновите страницу и попробуйте снова."
      );
    }

    const body = bodyResult.data;
    const customerName = normalizeString(body.customerName);
    const phone = normalizeString(body.phone);
    const phoneNormalized = normalizePhone(phone);
    const email = normalizeString(body.email);
    const rawAddress = normalizeString(body.address);
    const shippingMethod =
      body.shippingMethod ?? (rawAddress ? "LOCAL_COURIER" : "SELF_PICKUP");
    const address = shippingMethod === "SELF_PICKUP" ? null : rawAddress;
    const comment = normalizeString(body.comment) || null;
    const items = normalizeOrderItems(Array.isArray(body.items) ? body.items : []);

    if (!customerName || !phone || !email) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Заполните обязательные поля: имя, телефон и email."
      );
    }
    if (shippingMethod === "LOCAL_COURIER" && !address) {
      return fail(400, "DELIVERY_ADDRESS_REQUIRED", "Укажите адрес доставки в Воронеже.");
    }
    if (shippingMethod === "LOCAL_COURIER" && address && !isVoronezhAddress(address)) {
      return fail(
        400,
        "DELIVERY_OUTSIDE_VORONEZH",
        "На старте доставляем только по Воронежу. Для другого города выберите самовывоз."
      );
    }
    if (!isNormalizedPhone(phoneNormalized)) {
      return fail(400, "VALIDATION_ERROR", "Введите корректный номер телефона.");
    }
    if (items.length === 0) {
      return fail(400, "VALIDATION_ERROR", "В заказе нет товаров или превышен лимит количества.");
    }

    const existingCheckout = await findCheckoutByKey(checkoutKey);
    if (!existingCheckout) {
      const clientIp = getClientIp(request);
      const ipLimit = await consumeRateLimit({
        key: rateLimitKey("orders:ip", clientIp),
        limit: 5,
        windowMs: 10 * 60 * 1000,
      });
      if (ipLimit.limited) {
        return rateLimitResponse(ipLimit);
      }

      const phoneLimit = await consumeRateLimit({
        key: rateLimitKey("orders:phone", phoneNormalized),
        limit: 3,
        windowMs: 60 * 60 * 1000,
      });
      if (phoneLimit.limited) {
        return rateLimitResponse(phoneLimit);
      }
    }

    if (!getYookassaCredentials().isConfigured) {
      return fail(
        503,
        "YOOKASSA_NOT_CONFIGURED",
        "Онлайн-оплата временно недоступна. Свяжитесь с магазином или попробуйте позже."
      );
    }

    const result = await createOrResumeCheckout({
      checkoutKey,
      customerName,
      phone,
      phoneNormalized,
      email,
      address,
      shippingMethod,
      comment,
      giftWrap: body.giftWrap === true,
      legalVersion: LEGAL_DOCUMENT_VERSION,
      items,
    });
    scheduleNotificationOutboxProcessing();

    return ok(result);
  } catch (error) {
    if (isCommerceError(error)) {
      return fail(error.status, error.code, error.message);
    }

    console.error("[api/orders] failed to create or resume checkout", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      500,
      "CREATE_ORDER_FAILED",
      "Не удалось сохранить заказ. Попробуйте снова — повторная отправка не создаст дубликат."
    );
  }
}
