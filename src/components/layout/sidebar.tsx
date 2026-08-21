"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Upload,
  AlertTriangle,
  MessageSquare,
  ScrollText,
  Shield,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/demo", label: "Demo Data", icon: Database },
  { href: "/upload", label: "Upload CSV", icon: Upload },
  { href: "/dashboard", label: "Dashboard", icon: Zap },
  { href: "/exceptions", label: "Exceptions", icon: AlertTriangle },
  { href: "/chat", label: "Finance Q&A", icon: MessageSquare },
  { href: "/audit", label: "Audit Trail", icon: ScrollText },
  { href: "/security", label: "Self-Test", icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-gray-800 bg-gray-950 flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">SettleMate AI</h1>
            <p className="text-xs text-gray-500">Finance Controller</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-blue-600/20 text-blue-400 font-medium"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="text-xs text-gray-600 space-y-1">
          <p>Razorpay AI Buildathon</p>
          <p>Track 4: AI Finance Controller</p>
          <p className="text-blue-500">v2.0 — Multi-Agent</p>
        </div>
      </div>
    </aside>
  );
}