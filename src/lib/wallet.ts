import { prisma } from "@/lib/prisma";

export const WALLET_TIERS = [
  { id: "4000", amount: 4000, coins: 4600, validityDays: 30, bonus: 15 },
  { id: "8000", amount: 8000, coins: 9600, validityDays: 60, bonus: 20 },
  { id: "12000", amount: 12000, coins: 15000, validityDays: 90, bonus: 25 },
] as const;

export function findWalletTier(id: unknown) {
  return WALLET_TIERS.find((tier) => tier.id === String(id)) || null;
}

export async function walletSummary(userId: string) {
  const now = new Date();
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return { balance: 0, expiresAt: null, lots: [], transactions: [] };
  await prisma.walletLot.updateMany({
    where: { walletId: wallet.id, expiresAt: { lte: now }, remainingCoins: { gt: 0 } },
    data: { remainingCoins: 0 },
  });
  const [lots, transactions] = await Promise.all([
    prisma.walletLot.findMany({
      where: { walletId: wallet.id, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], remainingCoins: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return {
    balance: lots.reduce((sum, lot) => sum + lot.remainingCoins, 0),
    expiresAt: lots.find((lot) => lot.expiresAt)?.expiresAt || null,
    lots,
    transactions,
  };
}

async function activeWallet(tx: any, userId: string) {
  const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  const now = new Date();
  await tx.walletLot.updateMany({
    where: { walletId: wallet.id, expiresAt: { lte: now }, remainingCoins: { gt: 0 } },
    data: { remainingCoins: 0 },
  });
  return wallet;
}

export async function spendWalletCoins(tx: any, userId: string, coins: number, bookingId: string) {
  if (!Number.isInteger(coins) || coins < 0) throw new Error("Wallet amount is invalid.");
  const wallet = await activeWallet(tx, userId);
  const lots = await tx.walletLot.findMany({
    where: { walletId: wallet.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], remainingCoins: { gt: 0 } },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  if (lots.reduce((sum: number, lot: { remainingCoins: number }) => sum + lot.remainingCoins, 0) < coins) {
    throw new Error("Insufficient ElfCoins. Please top up or pay by card/UPI.");
  }
  let remaining = coins;
  for (const lot of lots) {
    if (!remaining) break;
    const used = Math.min(lot.remainingCoins, remaining);
    await tx.walletLot.update({ where: { id: lot.id }, data: { remainingCoins: { decrement: used } } });
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, lotId: lot.id, bookingId, type: "DEBIT", coins: -used, description: "ElfCoins used for booking" },
    });
    remaining -= used;
  }
}

export async function creditCancelledBookingToWallet(tx: any, userId: string, bookingId: string, coins: number) {
  if (!Number.isInteger(coins) || coins <= 0) throw new Error("Cancellation credit amount is invalid.");
  const existing = await tx.walletTransaction.findFirst({
    where: { bookingId, type: "CANCELLATION_CREDIT" },
    select: { id: true },
  });
  if (existing) throw new Error("This booking has already been credited to the wallet.");
  const wallet = await activeWallet(tx, userId);
  const lot = await tx.walletLot.create({
    data: { walletId: wallet.id, originalCoins: coins, remainingCoins: coins, expiresAt: null },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      lotId: lot.id,
      bookingId,
      type: "CANCELLATION_CREDIT",
      coins,
      description: "Booking cancellation credit — no expiry",
    },
  });
  return lot;
}

export async function refundBookingWalletCoins(tx: any, bookingId: string, coins?: number) {
  const debits = await tx.walletTransaction.findMany({
    where: { bookingId, type: "DEBIT" }, orderBy: { createdAt: "asc" }, include: { lot: true },
  });
  let remaining = coins ?? debits.reduce((sum: number, entry: { coins: number }) => sum - entry.coins, 0);
  for (const debit of debits) {
    if (!remaining || !debit.lot) break;
    const amount = Math.min(-debit.coins, remaining);
    await tx.walletLot.update({ where: { id: debit.lot.id }, data: { remainingCoins: { increment: amount } } });
    await tx.walletTransaction.create({
      data: { walletId: debit.walletId, lotId: debit.lot.id, bookingId, type: "REFUND", coins: amount, description: "ElfCoins refunded to original expiry lot" },
    });
    remaining -= amount;
  }
  if (remaining) throw new Error("Wallet refund could not be completed.");
}

export async function confirmWalletTopUp(topUpId: string, paymentId?: string) {
  return prisma.$transaction(async (tx) => {
    const topUp = await tx.walletTopUp.findUnique({ where: { id: topUpId } });
    if (!topUp || topUp.status === "PAID") return null;
    if (topUp.status !== "PENDING") throw new Error("This wallet top-up is no longer pending.");
    const wallet = await activeWallet(tx, topUp.userId);
    await tx.walletTopUp.update({ where: { id: topUp.id }, data: { status: "PAID", paidAt: new Date(), payuPaymentId: paymentId || null } });
    const lot = await tx.walletLot.create({
      data: { walletId: wallet.id, topUpId: topUp.id, originalCoins: topUp.coins, remainingCoins: topUp.coins, expiresAt: topUp.expiresAt },
    });
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, lotId: lot.id, type: "TOPUP", coins: topUp.coins, description: `ElfCoins top-up: ₹${topUp.amount}` },
    });
    return topUp;
  }, { isolationLevel: "Serializable" });
}
