"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <div className="min-h-screen bg-[#080a09] text-[#e9e7df]">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#080a09] text-[#e9e7df]">
      <Sidebar />

      <main className="min-w-0 flex-1 overflow-y-auto bg-[#080a09]">
        <div className="mx-auto w-full max-w-[1600px] px-7 py-7 lg:px-9 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}