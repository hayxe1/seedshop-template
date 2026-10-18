import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Оформление заказа",
  description: "Оформление и оплата заказа в интернет-магазине «Магазин семян».",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
