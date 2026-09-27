import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Image from "next/image";
import Link from "next/link";
import { isAdminEmail } from "@/lib/auth";
import { AdminNavigation } from "./AdminNavigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Admin Protection
  if (!user || !user.email) {
    redirect("/login");
  }

  if (!isAdminEmail(user.email)) {
    redirect("/book"); // Not an admin
  }

  return (
    <div className="min-h-screen bg-[#f6f6f3] md:flex">
      <aside className="sticky top-0 z-20 border-b border-white/10 bg-black p-4 text-white md:flex md:min-h-screen md:w-72 md:flex-col md:border-b-0 md:border-r md:p-6">
        <div className="mb-5 flex items-center justify-between gap-4 md:mb-10 md:block">
          <Image 
            src="/assets/ELF JAMPAD white.png" 
            alt="Elf Jampad Logo" 
            width={120} 
            height={40} 
            className="h-auto w-28 md:mb-4 md:w-32"
          />
          <div className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-elf-orange md:inline-flex">
            Admin Portal
          </div>
        </div>

        <AdminNavigation />

        <div className="mt-auto hidden border-t border-white/10 pt-8 md:block">
          <div className="mb-2 truncate text-[10px] font-mono text-gray-400">
            {user.email}
          </div>
          <Link 
            href="/book"
            className="text-xs text-white/50 hover:text-white transition-colors"
          >
            &larr; Back to Booking
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-[#f6f6f3] p-4 text-black sm:p-6 lg:p-10">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
