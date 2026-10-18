import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Корзина",
  description: "Товары, добавленные в корзину интернет-магазина «Магазин семян».",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
