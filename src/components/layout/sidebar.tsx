"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  Bell,
  ChartNoAxesCombined,
  CircleHelp,
  FileChartColumn,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Receipt,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { cn } from "@/lib/utils";
import { BusinessSwitcher } from "@/components/business/business-switcher";
import type { BusinessProfile } from "@/lib/business/constants";

type NavItem = { label: string; icon: LucideIcon; href?: string };

const navigation: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", icon: LayoutDashboard, href: "/" },
      { label: "Sales", icon: ShoppingBag, href: "/sales" },
      { label: "Expenses", icon: Receipt, href: "/expenses" },
      { label: "Products & Services", icon: Package, href: "/products" },
      { label: "Customer Metrics", icon: Users, href: "/customer-metrics" },
      {
        label: "Customer Feedback",
        icon: MessageSquareText,
        href: "/feedback",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Forecasts", icon: ChartNoAxesCombined, href: "/forecasts" },
      { label: "Reports", icon: FileChartColumn, href: "/reports" },
      { label: "AI Assistant", icon: Sparkles, href: "/assistant" },
      { label: "Alerts", icon: Bell, href: "/alerts" },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Imports", icon: ArrowDownToLine, href: "/imports" },
      { label: "Businesses", icon: Store, href: "/businesses" },
      { label: "Settings", icon: Settings2, href: "/settings" },
    ],
  },
];

export function Sidebar({
  onNavigate,
  businesses,
  selectedBusiness,
  isAdmin = false,
}: {
  onNavigate?: () => void;
  businesses: BusinessProfile[];
  selectedBusiness: BusinessProfile | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar px-4 py-6">
      <Link
        href="/"
        className="mx-3 mb-7 w-fit rounded-lg"
        aria-label="Basira home"
        onClick={onNavigate}
      >
        <Brand />
      </Link>
      <BusinessSwitcher
        businesses={businesses}
        selectedBusiness={selectedBusiness}
        onNavigate={onNavigate}
      />
      <nav aria-label="Main navigation" className="flex-1 space-y-5">
        {navigation.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map(({ label, icon: Icon, href }) => (
                <li key={label}>
                  {href ? (
                    <Link
                      href={href}
                      aria-current={pathname === href ? "page" : undefined}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium",
                        pathname === href
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      title="Coming in a future release"
                      className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-muted-foreground"
                    >
                      <Icon size={17} aria-hidden="true" />
                      {label}
                      <span className="sr-only"> (coming soon)</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {isAdmin && (
        <Link
          href="/admin"
          onClick={onNavigate}
          aria-current={
            pathname === "/admin" || pathname.startsWith("/admin/")
              ? "page"
              : undefined
          }
          className={cn(
            "mt-5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium",
            pathname === "/admin" || pathname.startsWith("/admin/")
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <ShieldCheck size={17} aria-hidden="true" />
          Admin
        </Link>
      )}
      <div className="mt-6 border-t border-border pt-4">
        <Link
          href="/about"
          aria-current={pathname === "/about" ? "page" : undefined}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px]",
            pathname === "/about"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <CircleHelp size={17} aria-hidden="true" />
          About Basira
        </Link>
      </div>
    </div>
  );
}
