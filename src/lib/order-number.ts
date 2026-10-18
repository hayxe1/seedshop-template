const orderNumberPrefix = "ORD";
const orderNumberWidth = 6;

export function formatOrderNumber(sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error("Invalid order number sequence.");
  }

  return `${orderNumberPrefix}-${String(sequence).padStart(orderNumberWidth, "0")}`;
}
