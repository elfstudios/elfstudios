"use client";

import { BookingFlow } from "@/components/booking/BookingFlow";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import Image from "next/image";
import DriftWall from "@/components/ui/DriftWall";

export default function BookPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowWidth, setWindowWidth] = useState(1200);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
      if (!user) {
        router.push("/login");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        router.push("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono text-white text-xs uppercase tracking-widest">
        Verifying Session...
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  const isMobile = windowWidth < 768;

  return (
    <div className="h-[100dvh] w-full relative bg-[#1E1E1E] flex flex-col overflow-hidden selection:bg-white/20 selection:text-white">
      
      {/* 3D Background */}
      <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center">
        <div className="w-[150vw] h-[150vh]">
          <DriftWall 
            columns={isMobile ? 8 : 12}
            tileWidth={isMobile ? 140 : 320}
            tileHeight={isMobile ? 93 : 213}
            dim={0.35} 
            fade={0.65}
            overlayColor="#1E1E1E"
            speed={isMobile ? 12 : 20}
            grayscale={false}
          />
        </div>
      </div>

      {/* Top Navigation */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-3 border-b border-white/5 bg-[#1E1E1E]/80 p-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-6 shrink-0">
        <a href="https://www.elfstudios.in/elf-jampad" className="self-start text-gray-400 hover:text-white font-mono text-[10px] md:text-xs tracking-widest uppercase transition-colors flex items-center gap-2 group">
          <span className="group-hover:-translate-x-1 transition-transform">&lt;</span> Back
        </a>
        <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-end sm:gap-6">
          <nav className="flex min-w-0 items-center gap-3 whitespace-nowrap sm:gap-6" aria-label="Booking navigation">
            <a href="/my-bookings" className="min-h-11 flex items-center text-[10px] font-mono text-white/70 hover:text-white uppercase tracking-widest transition-colors">My Bookings</a>
            <a href="/wallet" className="min-h-11 flex items-center text-[10px] font-mono text-white/70 hover:text-white uppercase tracking-widest transition-colors">My Wallet</a>
            <span className="hidden max-w-32 truncate font-mono text-[10px] uppercase tracking-widest text-gray-500 lg:inline">
              {user.email?.split("@")[0]}
            </span>
            <button onClick={handleLogout} className="min-h-11 text-[10px] font-mono text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors">
              Logout
            </button>
          </nav>

          <Image
            src="/assets/ELF JAMPAD black.png" 
            alt="Elf Jampad Logo" 
            width={80} 
            height={26} 
            className="h-auto w-14 shrink-0 object-contain invert opacity-70 sm:w-20"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col w-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <BookingFlow />
      </div>
    </div>
  );
}
