ALTER TABLE "Booking" ADD COLUMN "bookingName" TEXT,
  ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'PAYU',
  ADD COLUMN "walletCoins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BookingOrder" ADD COLUMN "bookingName" TEXT,
  ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'PAYU';

CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WalletLot" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "topUpId" TEXT,
  "originalCoins" INTEGER NOT NULL,
  "remainingCoins" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletLot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "lotId" TEXT,
  "bookingId" TEXT,
  "type" TEXT NOT NULL,
  "coins" INTEGER NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WalletTopUp" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "coins" INTEGER NOT NULL,
  "validityDays" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payuTxnId" TEXT,
  "payuPaymentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletTopUp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
CREATE UNIQUE INDEX "WalletLot_topUpId_key" ON "WalletLot"("topUpId");
CREATE INDEX "WalletLot_walletId_expiresAt_idx" ON "WalletLot"("walletId", "expiresAt");
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");
CREATE INDEX "WalletTransaction_bookingId_idx" ON "WalletTransaction"("bookingId");
CREATE UNIQUE INDEX "WalletTopUp_payuTxnId_key" ON "WalletTopUp"("payuTxnId");
CREATE INDEX "WalletTopUp_userId_createdAt_idx" ON "WalletTopUp"("userId", "createdAt");
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletLot" ADD CONSTRAINT "WalletLot_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "WalletLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTopUp" ADD CONSTRAINT "WalletTopUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
