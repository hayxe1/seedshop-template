"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/shared/analytics/client";
import { formatPhoneInput, isNormalizedPhone, normalizePhone } from "@/lib/phone";
import { ApiResponseError, checkoutOrderRecordSchema, parseApiResponse, publicOrderSchema, type PaymentStatus } from "@/shared/api/contracts";
import { useCart } from "@/shared/cart/cart-context";
import { isCartItemPreorder, PREORDER_NOTICE } from "@/shared/cart/preorder";
import styles from "./checkout.module.css";
import { GIFT_WRAP_PRICE } from "@/shared/config/commerce";
import CartReview from "@/features/cart/cart-review";
import { CHECKOUT_ATTEMPT_STORAGE_KEY, PENDING_ORDER_STORAGE_KEY, readCheckoutAttempt, readPendingOrder, saveCheckoutAttempt, type CheckoutAttempt } from "@/shared/cart/checkout-storage";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const skipAutomaticPaymentRedirect =
  process.env.NEXT_PUBLIC_E2E_SKIP_PAYMENT_REDIRECT === "1";
type CheckoutShippingMethod = "SELF_PICKUP" | "LOCAL_COURIER";

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export default function CheckoutPage() {
  const { items, totalItems, totalPrice, refreshCart, cartChecking, unavailableItems, completeCheckout } = useCart();
  const hasPreorder = items.some(isCartItemPreorder);
  const [preorderPending, setPreorderPending] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [paymentConfirmationUrl, setPaymentConfirmationUrl] = useState<string | null>(null);
  const [orderUrl, setOrderUrl] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("NOT_STARTED");
  const [giftWrapSelected, setGiftWrapSelected] = useState(false);
  const [shippingMethod, setShippingMethod] =
    useState<CheckoutShippingMethod>("SELF_PICKUP");
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const submittingRef = useRef(false);
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const payableTotal = totalPrice + (giftWrapSelected ? GIFT_WRAP_PRICE : 0);

  useEffect(() => {
    if (skipAutomaticPaymentRedirect || !isSubmitted || !paymentConfirmationUrl || paymentStatus === "SUCCEEDED") {
      return;
    }

    window.location.assign(paymentConfirmationUrl);
  }, [isSubmitted, paymentConfirmationUrl, paymentStatus]);

  const validatePhone = (value: string) => {
    const normalized = normalizePhone(value);

    if (!isNormalizedPhone(normalized)) {
      return "Укажите телефон в формате +7 (999) 000-00-00.";
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setSubmitError(null);

    const phoneValidationError = validatePhone(phone);
    setPhoneError(phoneValidationError);

    if (phoneValidationError) {
      (event.currentTarget.elements.namedItem("phone") as HTMLInputElement | null)?.focus();
      return;
    }

    setIsSubmitting(true);
    submittingRef.current = true;
    try {
      const formData = new FormData(event.currentTarget);
      const payload = {
        customerName: String(formData.get("name") ?? ""),
        phone,
        email: String(formData.get("email") ?? ""),
        address:
          shippingMethod === "LOCAL_COURIER"
            ? String(formData.get("address") ?? "")
            : "",
        shippingMethod,
        comment: String(formData.get("comment") ?? ""),
        giftWrap: giftWrapSelected,
        termsAccepted: true as const,
        items: items.map((item) =>
          item.kind === "seedSet"
            ? {
                kind: "seedSet" as const,
                seedSetId: item.seedSetId,
                quantity: item.quantity,
              }
            : {
                kind: "product" as const,
                productId: item.productId,
                quantity: item.quantity,
              }
        ),
      };

      // Persist a digest rather than the buyer's contact details.
      const fingerprint = Array.from(new Uint8Array(await window.crypto.subtle.digest(
        "SHA-256", new TextEncoder().encode(JSON.stringify(payload))
      )), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!checkoutAttemptRef.current) {
        checkoutAttemptRef.current = readCheckoutAttempt();
      }
      const previous = checkoutAttemptRef.current;
      if (previous?.orderUrl && previous.fingerprint === fingerprint) {
        const known = await parseApiResponse(await fetch(previous.orderUrl.replace("/order/", "/api/orders/"), { cache: "no-store" }), publicOrderSchema);
        if (known.data.paymentStatus === "SUCCEEDED" && readPendingOrder()?.orderNumber === known.data.orderNumber) {
          setOrderNumber(known.data.orderNumber); setOrderUrl(previous.orderUrl);
          setPaymentStatus("SUCCEEDED"); setPaymentConfirmationUrl(null); setIsSubmitted(true);
          await completeCheckout(known.data.orderNumber, items.map(item => ({ itemKey: item.itemKey, quantity: item.quantity })));
          return;
        }
        if (known.data.paymentStatus === "SUCCEEDED" || known.data.paymentStatus === "REFUNDED" || known.data.fulfillmentStatus === "CANCELLED") {
          checkoutAttemptRef.current = null;
        }
      }
      if (!checkoutAttemptRef.current || checkoutAttemptRef.current.fingerprint !== fingerprint) {
        checkoutAttemptRef.current = {
          fingerprint,
          key: window.crypto.randomUUID(),
        };
      }
      const checked = await refreshCart();
      if (!checked.ok || checked.changed) {
        setSubmitError(checked.changed ? "Данные товаров изменились. Проверьте обновлённый состав и сумму, затем отправьте заказ ещё раз." : "Проверьте доступность товаров и повторите проверку корзины.");
        return;
      }
      saveCheckoutAttempt(checkoutAttemptRef.current);
      track("Checkout Started", {
        itemCount: totalItems,
        orderValue: payableTotal,
        giftWrap: giftWrapSelected,
        shippingMethod,
      });
      const result = await parseApiResponse(
        await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": checkoutAttemptRef.current.key,
          },
          body: JSON.stringify(payload),
        }),
        checkoutOrderRecordSchema
      );

      setOrderNumber(result.data.orderNumber);
      setPaymentConfirmationUrl(result.data.paymentConfirmationUrl);
      setOrderUrl(result.data.orderUrl);
      setPaymentError(result.data.paymentError);
      setPreorderPending(result.data.preorderPending);
      setPaymentStatus(result.data.paymentStatus);
      setIsSubmitted(true);
      checkoutAttemptRef.current = { ...checkoutAttemptRef.current, orderNumber: result.data.orderNumber, orderUrl: result.data.orderUrl };
      saveCheckoutAttempt(checkoutAttemptRef.current);
      track("Order Created", {
        itemCount: totalItems,
        orderValue: payableTotal,
        paymentReady: Boolean(result.data.paymentConfirmationUrl),
      });
      try {
        window.localStorage.setItem(
          PENDING_ORDER_STORAGE_KEY,
          JSON.stringify({
            orderNumber: result.data.orderNumber,
            orderUrl: result.data.orderUrl,
            purchasedItems: items.map(item => ({ itemKey: item.itemKey, quantity: item.quantity })),
          })
        );
      } catch {
        // Private browsing can disable storage. The protected link remains visible.
      }
    } catch (requestError) {
      if (requestError instanceof ApiResponseError &&
          (requestError.code === "ORDER_CANCELLED" || requestError.code === "PAYMENT_NOT_RETRYABLE")) {
        checkoutAttemptRef.current = null;
        try { window.sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY); } catch { /* Optional storage. */ }
      }
      track("Checkout Failed", { itemCount: totalItems, orderValue: payableTotal });
      setSubmitError(
        requestError instanceof TypeError
          ? "Не удалось связаться с магазином. Проверьте подключение и повторите отправку — повторный запрос не создаст второй заказ."
          : requestError instanceof Error
          ? requestError.message
          : "Ошибка сети. Проверьте подключение и попробуйте снова."
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isClient) {
    return (
      <main className={styles.page}>
        <section className={styles.success}>
          <h1>Загружаем корзину</h1>
          <p>Проверяем выбранные товары перед оформлением заказа.</p>
        </section>
      </main>
    );
  }

  if (isSubmitted) {
    return (
      <main className={styles.page}>
        <section className={styles.success}>
          <h1>{paymentStatus === "SUCCEEDED" ? "Заказ оплачен" : preorderPending ? "Заказ принят" : paymentConfirmationUrl ? "Переходим к оплате" : "Заказ сохранён"}</h1>
          <p>
            {paymentStatus === "SUCCEEDED" ? "Оплата уже получена. Откройте заказ, чтобы посмотреть состояние получения." : preorderPending ? "Менеджер согласует с вами срок поставки. После подтверждения оплатить заказ можно на его странице." : paymentConfirmationUrl
              ? "Заказ сохранён. Сейчас откроется защищённая страница YooKassa."
              : "Заказ сохранён, но страницу оплаты открыть не удалось."}
          </p>
          {orderNumber ? <p>Номер заказа: {orderNumber}</p> : null}
          {paymentError ? (
            <p className={styles.errorText} role="alert">
              {paymentError}
            </p>
          ) : null}
          {paymentConfirmationUrl && paymentStatus !== "SUCCEEDED" ? (
            <a href={paymentConfirmationUrl} className={`${styles.primaryBtn} ${styles.paymentFallbackBtn}`}>
              Перейти к оплате
            </a>
          ) : null}
          {orderUrl ? (
            <Link href={orderUrl} className={styles.secondaryBtn}>
              {preorderPending || paymentStatus === "SUCCEEDED" ? "Открыть заказ" : "Открыть заказ и повторить оплату"}
            </Link>
          ) : null}
          <Link href="/catalog" className={`${styles.primaryBtn} ${styles.successCatalogBtn}`}>
            Вернуться в каталог
          </Link>
        </section>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className={styles.page}>
        <section className={styles.success}>
          <h1>Оформлять пока нечего</h1>
          <p>Добавьте товары в корзину и вернитесь к оформлению.</p>
          <Link href="/catalog" className={styles.primaryBtn}>
            Перейти в каталог
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1>Оформление заказа</h1>
          <p>Выберите самовывоз или доставку по Воронежу и укажите контакты.</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <section className={styles.formPanel} aria-label="Контакты и получение заказа">
            <CartReview />
            <label className={styles.field}>
              <span className={styles.labelText}>
                Имя <span className={styles.required}>*</span>
              </span>
              <input
                type="text"
                name="name"
                required
                placeholder="Имя Фамилия (Иван Иванов)"
                autoComplete="name"
                data-testid="checkout-name"
              />
            </label>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className={styles.labelText}>
                  Телефон <span className={styles.required}>*</span>
                </span>
                <input
                  type="tel"
                  name="phone"
                  value={phone}
                  onChange={(event) => {
                    setPhone(formatPhoneInput(event.target.value));
                    if (phoneError) {
                      setPhoneError(null);
                    }
                  }}
                  onBlur={() => setPhoneError(validatePhone(phone))}
                  placeholder="+7 (___) ___-__-__"
                  autoComplete="tel"
                  inputMode="tel"
                  aria-invalid={phoneError ? "true" : "false"}
                  aria-describedby={phoneError ? "checkout-phone-error" : "checkout-phone-hint"}
                  data-testid="checkout-phone"
                  required
                />
                <span id="checkout-phone-hint" className={styles.hint}>
                  Для связи.
                </span>
                {phoneError ? (
                  <span id="checkout-phone-error" className={styles.errorText}>
                    {phoneError}
                  </span>
                ) : null}
              </label>

              <label className={styles.field}>
                <span className={styles.labelText}>
                  Email <span className={styles.required}>*</span>
                </span>
                <input
                  type="email"
                  name="email"
                  placeholder="ivan@example.com"
                  autoComplete="email"
                  aria-describedby="checkout-email-hint"
                  data-testid="checkout-email"
                  required
                />
                <span id="checkout-email-hint" className={styles.hint}>
                  На этот адрес пришлём подтверждение заказа и оплаты.
                </span>
              </label>
            </div>

            <fieldset className={styles.deliveryOptions}>
              <legend className={styles.deliveryLegend}>Как получить заказ</legend>
              <label
                className={`${styles.deliveryOption} ${
                  shippingMethod === "SELF_PICKUP" ? styles.deliveryOptionActive : ""
                }`}
              >
                <input
                  type="radio"
                  name="shippingMethod"
                  value="SELF_PICKUP"
                  checked={shippingMethod === "SELF_PICKUP"}
                  onChange={() => setShippingMethod("SELF_PICKUP")}
                  data-testid="checkout-shipping-self-pickup"
                />
                <span className={styles.deliveryCopy}>
                  <strong>Бесплатный самовывоз</strong>
                  <small>После оплаты менеджер сообщит место и согласует время.</small>
                </span>
                <b>0 ₽</b>
              </label>
              <label
                className={`${styles.deliveryOption} ${
                  shippingMethod === "LOCAL_COURIER" ? styles.deliveryOptionActive : ""
                }`}
              >
                <input
                  type="radio"
                  name="shippingMethod"
                  value="LOCAL_COURIER"
                  checked={shippingMethod === "LOCAL_COURIER"}
                  onChange={() => setShippingMethod("LOCAL_COURIER")}
                  data-testid="checkout-shipping-local-courier"
                />
                <span className={styles.deliveryCopy}>
                  <strong>Доставка по Воронежу</strong>
                  <small>Менеджер свяжется с вами и отдельно согласует стоимость.</small>
                </span>
                <b>отдельно</b>
              </label>
            </fieldset>

            {shippingMethod === "LOCAL_COURIER" ? (
              <label className={styles.field}>
                <span className={styles.labelText}>
                  Адрес в Воронеже <span className={styles.required}>*</span>
                </span>
                <textarea
                  name="address"
                  rows={3}
                  required
                  placeholder="Воронеж, улица, дом, квартира"
                  autoComplete="street-address"
                  data-testid="checkout-address"
                />
                <span className={styles.hint}>
                  На старте доставка работает только в пределах Воронежа.
                </span>
              </label>
            ) : (
              <p className={styles.deliveryHint}>
                Адрес пункта самовывоза не публикуется. Менеджер сообщит его после оформления.
              </p>
            )}

            <label className={styles.field}>
              <span className={styles.labelText}>Комментарий к заказу</span>
              <textarea
                name="comment"
                rows={3}
                placeholder="Например: код домофона, оставить у двери"
                data-testid="checkout-comment"
              />
            </label>
          </section>

          <aside className={styles.summaryCard} aria-label="Ваш заказ">
            <h2>Ваш заказ</h2>
            <dl className={styles.summaryList}>
              <div>
                <dt>Товары ({totalItems})</dt>
                <dd>{formatPrice(totalPrice)}</dd>
              </div>
              <div>
                <dt>Доставка</dt>
                <dd>
                  {shippingMethod === "SELF_PICKUP"
                    ? "бесплатно"
                    : "менеджер свяжется"}
                </dd>
              </div>
            </dl>
            <label className={styles.giftWrapOption}>
              <span className={styles.giftWrapLabel}>
                <input
                  type="checkbox"
                  name="giftWrap"
                  checked={giftWrapSelected}
                  onChange={(event) => setGiftWrapSelected(event.target.checked)}
                  data-testid="checkout-gift-wrap"
                />
                <span>Подарочная упаковка</span>
              </span>
              <strong>+{formatPrice(GIFT_WRAP_PRICE)}</strong>
            </label>
            <div className={styles.summaryTotal}>
              <span>К оплате:</span>
              <strong>{formatPrice(payableTotal)}</strong>
            </div>
            <div className={styles.paymentNote}>
              <span className={styles.lockIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M7 10V8a5 5 0 0 1 10 0v2" />
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M12 14v3" />
                </svg>
              </span>
              <p>
                {hasPreorder ? PREORDER_NOTICE : "Вы оплачиваете только товары и выбранную упаковку."} Для доставки по Воронежу
                менеджер отдельно согласует стоимость; самовывоз бесплатный.
              </p>
            </div>
            <label className={styles.legalConsent}>
              <input
                type="checkbox"
                name="termsAccepted"
                required
                data-testid="checkout-terms"
              />
              <span>
                Я принимаю условия <Link href="/offer">публичной оферты</Link> и
                даю согласие на обработку данных по{" "}
                <Link href="/privacy">политике конфиденциальности</Link>.
              </span>
            </label>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={isSubmitting || cartChecking || unavailableItems.length > 0}
              data-testid="checkout-submit"
            >
              {isSubmitting ? "Сохраняем заказ…" : hasPreorder ? "Оформить под заказ" : "Перейти к оплате"}
              <span aria-hidden="true">→</span>
            </button>
            <Link href="/cart" className={styles.secondaryBtn}>
              <span aria-hidden="true">←</span>
              Вернуться в корзину
            </Link>
            {submitError ? (
              <p className={styles.errorText} role="alert" aria-live="assertive">
                {submitError}
              </p>
            ) : null}
          </aside>
        </form>
      </div>
    </main>
  );
}
