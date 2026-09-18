"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type WalletData = {
  balance: number;
  expiresAt: string | null;
  lots: { id: string; remainingCoins: number; expiresAt: string | null }[];
  transactions: { id: string; type: string; coins: number; description: string | null; createdAt: string }[];
  tiers: { id: string; amount: number; coins: number; validityDays: number; bonus: number }[];
};

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();
  const load = () => fetch("/api/wallet", { cache: "no-store" }).then((response) => response.json()).then(setData).catch(() => setError("Unable to load your wallet."));
  useEffect(() => { load(); }, []);
  async function topUp(tierId: string) {
    setLoading(tierId); setError("");
    try {
      const response = await fetch("/api/wallet/topup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tierId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to begin top-up.");
      const form = document.createElement("form"); form.method = "POST"; form.action = payload.url;
      Object.entries(payload.params).forEach(([key, value]) => { const input = document.createElement("input"); input.type = "hidden"; input.name = key; input.value = String(value); form.appendChild(input); });
      document.body.appendChild(form); form.submit();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to begin top-up."); setLoading(null); }
  }
  async function logout() { await supabase.auth.signOut(); router.push("/login"); }
  const expiry = data?.expiresAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(data.expiresAt)) : null;
  return <main className="min-h-screen bg-[#111] px-4 py-6 text-white md:px-8">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 border-b border-white/10 pb-5"><div><p className="font-mono text-[10px] uppercase tracking-[.3em] text-orange-400">Elf Jampad</p><h1 className="text-2xl font-black">My Wallet</h1></div><nav className="flex gap-2 text-xs"><Link href="/book" className="rounded-lg border border-white/15 px-3 py-2">Book session</Link><Link href="/my-bookings" className="rounded-lg border border-white/15 px-3 py-2">My bookings</Link><button onClick={logout} className="px-3 text-white/60">Logout</button></nav></header>
    <div className="mx-auto max-w-5xl py-8">
      <section className="rounded-3xl border border-orange-400/30 bg-gradient-to-br from-orange-400/20 to-black p-6 md:p-8"><p className="font-mono text-xs uppercase tracking-[.25em] text-orange-200">ElfCoins balance</p><p className="mt-3 text-5xl font-black">{data ? data.balance.toLocaleString("en-IN") : "…"} <span className="text-base font-medium text-orange-100">coins</span></p><p className="mt-3 text-sm text-white/60">1 ElfCoin = ₹1{expiry ? ` · earliest coins expire ${expiry}` : ""}</p></section>
      <p className="mx-auto mt-4 max-w-5xl rounded-xl border border-white/10 bg-white/[.04] p-4 text-sm text-white/70"><strong className="text-orange-200">Cancelled a session?</strong> Its paid value appears here as a separate ElfCoins cancellation credit. It never expires and is used automatically when you choose ElfCoins Wallet during checkout.</p>
      <section className="mt-8"><h2 className="text-xl font-black">Top up ElfCoins</h2><p className="mt-1 text-sm text-white/50">Top-up coins are non-refundable and expire from their purchase date. Cancellation credits are separate and never expire.</p><div className="mt-4 grid gap-4 md:grid-cols-3">{data?.tiers.map((tier) => <article key={tier.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-white/60">Prepay ₹{tier.amount.toLocaleString("en-IN")}</p><h3 className="mt-2 text-3xl font-black text-orange-300">{tier.coins.toLocaleString("en-IN")}</h3><p className="mt-1 text-xs text-white/50">+{tier.bonus}% bonus · valid {tier.validityDays} days</p><button disabled={!!loading} onClick={() => topUp(tier.id)} className="mt-5 min-h-11 w-full rounded-xl bg-white text-xs font-bold uppercase text-black disabled:opacity-40">{loading === tier.id ? "Opening PayU…" : "Top up"}</button></article>)}</div></section>
      {error && <p className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-200">{error}</p>}
      <section className="mt-8 grid gap-6 md:grid-cols-2"><div><h2 className="text-xl font-black">Active coin lots</h2><div className="mt-3 space-y-2">{data?.lots.length ? data.lots.map((lot) => <div key={lot.id} className="rounded-xl border border-white/10 p-4 text-sm"><strong>{lot.remainingCoins.toLocaleString("en-IN")} coins</strong><span className="float-right text-white/50">{lot.expiresAt ? `Expires ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(lot.expiresAt))}` : "Cancellation credit · no expiry"}</span></div>) : <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/50">No active ElfCoins yet.</p>}</div></div><div><h2 className="text-xl font-black">Wallet activity</h2><div className="mt-3 space-y-2">{data?.transactions.length ? data.transactions.map((transaction) => <div key={transaction.id} className="rounded-xl border border-white/10 p-4 text-sm"><span className={transaction.coins >= 0 ? "text-green-300" : "text-orange-300"}>{transaction.coins >= 0 ? "+" : ""}{transaction.coins.toLocaleString("en-IN")} coins</span><span className="ml-2 text-white/60">{transaction.description || transaction.type}</span></div>) : <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/50">Top-ups and bookings will appear here.</p>}</div></div></section>
    </div>
  </main>;
}
