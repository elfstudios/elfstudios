import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { WALLET_TIERS, walletSummary } from "@/lib/wallet";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;
  return NextResponse.json({ ...(await walletSummary(auth.user.id)), tiers: WALLET_TIERS });
}
