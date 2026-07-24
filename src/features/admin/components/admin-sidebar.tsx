"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Package, Tags, Layers, Store, ShoppingCart, Users, Boxes,
  TicketPercent, CreditCard, Star, Truck, FileText, HelpCircle, Image as ImageIcon,
  Settings, BarChart3, Bell, ScrollText, ShieldCheck, Globe,
} from "lucide-react";

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Navigation is data, not markup. Adding an admin module means adding one
 * line here — the sidebar, active state and mobile drawer all follow.
 */
const NAV = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/categories", label: "Categories", icon: Tags },
      { href: "/admin/subcategories", label: "Subcategories", icon: Layers },
      { href: "/admin/brands", label: "Brands", icon: Store },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/shipping", label: "Shipping", icon: Truck },
      { href: "/admin/coupons", label: "Coupons", icon: TicketPercent },
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/pages", label: "CMS Pages", icon: FileText },
      { href: "/admin/blogs", label: "Blog", icon: ScrollText },
      { href: "/admin/faq", label: "FAQ", icon: HelpCircle },
      { href: "/admin/banners", label: "Banners", icon: ImageIcon },
      { href: "/admin/seo", label: "SEO", icon: Globe },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/users", label: "Users & Roles", icon: ShieldCheck },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/activity", label: "Activity Logs", icon: ScrollText },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="px-4 py-5">
        <Link href="/admin" className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
            <Package className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Commerce Admin
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                // Exact match for /admin, prefix match elsewhere.
                const active =
                  item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <Link href={item.href} className="relative">
                        {/* Shared layoutId animates the pill between items. */}
                        {active && (
                          <motion.span
                            layoutId="admin-nav-active"
                            className="absolute inset-0 rounded-md bg-primary/10"
                            transition={{ type: "spring", stiffness: 380, damping: 32 }}
                          />
                        )}
                        <item.icon
                          className={cn(
                            "relative size-4 transition-colors",
                            active ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span
                          className={cn(
                            "relative text-sm transition-colors",
                            active ? "font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {item.label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        v1.0 · All systems normal
      </SidebarFooter>
    </Sidebar>
  );
}
