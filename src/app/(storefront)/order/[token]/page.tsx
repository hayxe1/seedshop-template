import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findOrderByAccessToken } from "@/server/commerce/order-view";
import OrderStatusClient from "./order-status-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ваш заказ",
  description: "Статус заказа, оплаты и доставки.",
  robots: { index: false, follow: false },
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await findOrderByAccessToken(token);
  if (!order) {
    notFound();
  }

  return <OrderStatusClient token={token} initialOrder={order.data} />;
}
