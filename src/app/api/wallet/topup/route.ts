import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";
import { assertPayUConfigured, generateHash, PAYU_MERCHANT_KEY, PAYU_URL } from "@/lib/payu";
import { findWalletTier } from "@/lib/wallet";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;
  try {
    const tier = findWalletTier((await req.json()).tierId);
    if (!tier) return NextResponse.json({ error: "Choose a valid ElfCoins top-up tier." }, { status: 400 });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tier.validityDays * 24 * 60 * 60 * 1000);
    const txnid = `ELFW${Date.now()}${randomBytes(3).toString("hex")}`;
    const topUp = await prisma.walletTopUp.create({
      data: { userId: auth.user.id, amount: tier.amount, coins: tier.coins, validityDays: tier.validityDays, expiresAt, payuTxnId: txnid },
    });
    assertPayUConfigured();
    const envSiteUrl = process.env.SITE_URL ? (process.env.SITE_URL.startsWith("http") ? process.env.SITE_URL : `https://${process.env.SITE_URL}`) : null;
    const siteUrl = (envSiteUrl || new URL(req.url).origin).replace(/\/$/, "");
    const name = String(auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || "Musician");
    const phone = String(auth.user.user_metadata?.phone || "0000000000");
    const data: Record<string, string> = {
      key: PAYU_MERCHANT_KEY, txnid, amount: tier.amount.toFixed(2), productinfo: `ElfCoins ${tier.coins} wallet top-up`,
      firstname: name.split(" ")[0] || "Musician", email: auth.user.email || "", phone,
      udf1: topUp.id, udf2: "WALLET_TOPUP", udf3: "", udf4: "", udf5: "",
      surl: `${siteUrl}/api/payu/callback`, furl: `${siteUrl}/api/payu/callback`,
    };
    return NextResponse.json({ url: PAYU_URL, params: { ...data, hash: generateHash(data) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start ElfCoins top-up.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
