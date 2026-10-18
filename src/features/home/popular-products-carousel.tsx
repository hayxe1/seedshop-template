"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AddToCartButton from "@/features/cart/add-to-cart-button";
import styles from "@/features/home/home.module.css";

export type PopularProductCarouselItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  stock: number | null;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
};

type PopularProductsCarouselProps = {
  products: PopularProductCarouselItem[];
};

const AUTOPLAY_INTERVAL_MS = 6000;
const DESKTOP_AUTOPLAY_QUERY = "(min-width: 1024px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SCROLL_END_TOLERANCE = 4;

export default function PopularProductsCarousel({
  products,
}: PopularProductsCarouselProps) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isDesktopAutoplayAllowed, setIsDesktopAutoplayAllowed] = useState(false);
  const [isCarouselVisible, setIsCarouselVisible] = useState(true);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isAutoplayStopped, setIsAutoplayStopped] = useState(false);
  const canScroll = products.length > 1;

  const updateRailProgress = useCallback(() => {
    const rail = railRef.current;
    const progress = progressRef.current;

    if (!rail || !progress) {
      return;
    }

    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    const visibleRatio = rail.scrollWidth > 0 ? rail.clientWidth / rail.scrollWidth : 1;
    const thumbWidth = Math.min(100, Math.max(18, visibleRatio * 100));
    const thumbLeft =
      maxScrollLeft > 0 ? (rail.scrollLeft / maxScrollLeft) * (100 - thumbWidth) : 0;

    progress.style.setProperty("--popular-progress-width", `${thumbWidth}%`);
    progress.style.setProperty("--popular-progress-left", `${thumbLeft}%`);
  }, []);

  const getStep = useCallback(() => {
    const rail = railRef.current;
    const firstCard = rail?.querySelector<HTMLElement>("[data-carousel-card]");

    if (!rail || !firstCard) {
      return 0;
    }

    const styles = window.getComputedStyle(rail);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0");

    return firstCard.offsetWidth + (Number.isFinite(gap) ? gap : 0);
  }, []);

  const scrollByDirection = useCallback(
    (direction: 1 | -1, behavior: ScrollBehavior = "smooth") => {
      const rail = railRef.current;
      const step = getStep();

      if (!rail || step === 0) {
        return;
      }

      const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
      const isAtEnd = rail.scrollLeft >= maxScrollLeft - SCROLL_END_TOLERANCE;
      const isAtStart = rail.scrollLeft <= SCROLL_END_TOLERANCE;
      const resolvedBehavior = window.matchMedia(REDUCED_MOTION_QUERY).matches
        ? "instant"
        : behavior;

      if (direction > 0 && isAtEnd) {
        rail.scrollTo({ left: 0, behavior: "instant" });
        return;
      }

      if (direction < 0 && isAtStart) {
        rail.scrollTo({ left: maxScrollLeft, behavior: "instant" });
        return;
      }

      rail.scrollBy({ left: step * direction, behavior: resolvedBehavior });
    },
    [getStep]
  );

  const stopAutoplay = useCallback(() => {
    setIsAutoplayStopped(true);
  }, []);

  const scrollManually = useCallback(
    (direction: 1 | -1) => {
      stopAutoplay();
      scrollByDirection(direction);
    },
    [scrollByDirection, stopAutoplay]
  );

  useEffect(() => {
    const rail = railRef.current;

    if (!canScroll || !rail) {
      return;
    }

    const frameId = window.requestAnimationFrame(updateRailProgress);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateRailProgress);

    rail.addEventListener("scroll", updateRailProgress, { passive: true });
    window.addEventListener("resize", updateRailProgress);
    resizeObserver?.observe(rail);

    return () => {
      window.cancelAnimationFrame(frameId);
      rail.removeEventListener("scroll", updateRailProgress);
      window.removeEventListener("resize", updateRailProgress);
      resizeObserver?.disconnect();
    };
  }, [canScroll, updateRailProgress]);

  useEffect(() => {
    const desktopQuery = window.matchMedia(DESKTOP_AUTOPLAY_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);

    const updateAutoplayPermission = () => {
      setIsDesktopAutoplayAllowed(desktopQuery.matches && !reducedMotionQuery.matches);
    };

    updateAutoplayPermission();
    desktopQuery.addEventListener("change", updateAutoplayPermission);
    reducedMotionQuery.addEventListener("change", updateAutoplayPermission);

    return () => {
      desktopQuery.removeEventListener("change", updateAutoplayPermission);
      reducedMotionQuery.removeEventListener("change", updateAutoplayPermission);
    };
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;

    if (!carousel || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsCarouselVisible(entry?.isIntersecting ?? false),
      { threshold: 0.35 }
    );

    observer.observe(carousel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateDocumentVisibility = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };

    updateDocumentVisibility();
    document.addEventListener("visibilitychange", updateDocumentVisibility);
    return () => document.removeEventListener("visibilitychange", updateDocumentVisibility);
  }, []);

  useEffect(() => {
    const isPaused =
      !isCarouselVisible || !isDocumentVisible || isPointerInside || isFocusWithin;

    if (!canScroll || !isDesktopAutoplayAllowed || isAutoplayStopped || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      scrollByDirection(1);
    }, AUTOPLAY_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [
    canScroll,
    isAutoplayStopped,
    isCarouselVisible,
    isDesktopAutoplayAllowed,
    isDocumentVisible,
    isFocusWithin,
    isPointerInside,
    scrollByDirection,
  ]);

  return (
    <div
      ref={carouselRef}
      className={styles.popularCarousel}
      onMouseEnter={() => setIsPointerInside(true)}
      onMouseLeave={() => setIsPointerInside(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusWithin(false);
        }
      }}
    >
      {canScroll ? (
        <button
          type="button"
          className={`${styles.popularArrow} ${styles.popularArrowPrev}`}
          onClick={() => scrollManually(-1)}
          aria-label="Показать предыдущие популярные товары"
        >
          ‹
        </button>
      ) : null}

      <div
        ref={railRef}
        className={styles.popularRail}
        aria-label="Список популярных товаров"
        tabIndex={0}
        onPointerDown={stopAutoplay}
        onTouchMove={stopAutoplay}
        onWheel={(event) => {
          if (Math.abs(event.deltaX) > 0 || event.shiftKey) {
            stopAutoplay();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollManually(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollManually(1);
          }
        }}
      >
        {products.map((item, index) => (
          <article
            key={item.id}
            className={styles.popularCard}
            data-testid="home-popular-card"
            data-carousel-card
          >
            <Link href={`/product/${item.slug}`} className={styles.popularImageWrap} prefetch={false}>
              <Image
                src={item.imageUrl}
                alt={item.name}
                width={item.imageWidth}
                height={item.imageHeight}
                className={styles.popularImage}
                sizes="(max-width: 680px) 42vw, (max-width: 980px) 160px, 150px"
                loading={index === 0 ? "eager" : "lazy"}
              />
            </Link>
            <div className={styles.popularMeta}>
              <h3>
                <Link href={`/product/${item.slug}`} prefetch={false}>{item.name}</Link>
              </h3>
              <div className={styles.popularBottom}>
                <strong>{item.price} ₽</strong>
                <AddToCartButton
                  item={{
                    productId: item.id,
                    slug: item.slug,
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    imageUrl: item.imageUrl,
                    stock: item.stock,
                  }}
                  className={styles.compactProductButton}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      {canScroll ? (
        <div ref={progressRef} className={styles.popularProgress} aria-hidden="true" />
      ) : null}

      {canScroll ? (
        <button
          type="button"
          className={`${styles.popularArrow} ${styles.popularArrowNext}`}
          onClick={() => scrollManually(1)}
          aria-label="Показать следующие популярные товары"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
