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
      <div className="relative z-10 w-full p-6 flex justify-between items-center max-w-7xl mx-auto border-b border-white/5 shrink-0 bg-[#1E1E1E]/80 backdrop-blur-md">
        <a href="https://www.elfstudios.in/elf-jampad" className="text-gray-400 hover:text-white font-mono text-[10px] md:text-xs tracking-widest uppercase transition-colors flex items-center gap-2 group">
          <span className="group-hover:-translate-x-1 transition-transform">&lt;</span> Back
        </a>
        <div className="flex items-center gap-6">
          <a
            href="/my-bookings"
            className="min-h-11 flex items-center text-[10px] font-mono text-white/70 hover:text-white uppercase tracking-widest transition-colors"
          >
            My Bookings
          </a>
          <a href="/wallet" className="min-h-11 flex items-center rounded-lg border border-orange-400/40 bg-orange-400/10 px-3 text-[10px] font-mono font-bold text-orange-200 hover:bg-orange-400/20 uppercase tracking-widest transition-colors">ElfCoins Wallet</a>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-gray-500 uppercase tracking-widest hidden sm:inline">
              {user.email?.split("@")[0]}
            </span>
            <button 
              onClick={handleLogout}
              className="min-h-11 text-[10px] font-mono text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors"
            >
              Logout
            </button>
          </div>
          
          <div className="h-4 w-px bg-white/10 hidden sm:block"></div>

          <Image 
            src="/assets/ELF JAMPAD black.png" 
            alt="Elf Jampad Logo" 
            width={80} 
            height={26} 
            className="object-contain invert opacity-70"
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
