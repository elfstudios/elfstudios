CREATE TABLE "BookingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendees" INTEGER NOT NULL,
    "bandName" TEXT,
    "equipmentRequests" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "totalHours" INTEGER NOT NULL,
    "freeHours" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "payuTxnId" TEXT,
    "payuPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingOrder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Booking" ADD COLUMN "orderId" TEXT;

CREATE UNIQUE INDEX "BookingOrder_payuTxnId_key" ON "BookingOrder"("payuTxnId");
CREATE INDEX "BookingOrder_userId_createdAt_idx" ON "BookingOrder"("userId", "createdAt");
CREATE INDEX "BookingOrder_expiresAt_idx" ON "BookingOrder"("expiresAt");
CREATE INDEX "Booking_orderId_idx" ON "Booking"("orderId");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "BookingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingOrder" ADD CONSTRAINT "BookingOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
