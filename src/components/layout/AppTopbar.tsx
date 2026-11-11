"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  Bell,
  ChevronRight,
  Menu,
  ShieldAlert,
  CheckCircle2,
  Sliders,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { DEMO_WORKSPACE_INFO } from "@/data/mockData";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useSupabaseMode } from "@/hooks/useSupabaseMode";

interface AppTopbarProps {
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
  onOpenImportModal: () => void;
}

export const AppTopbar: React.FC<AppTopbarProps> = ({
  onOpenSearch,
  onOpenMobileMenu,
  onOpenImportModal,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { info } = useToast();
  const { isConfigured, user, signOut } = useSupabaseMode();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(2);

  // Generate dynamic breadcrumbs based on pathname
  const getBreadcrumbs = () => {
    const paths = pathname.split("/").filter(Boolean);
    const crumbs = [];

    if (paths[0] === "workspace") {
      crumbs.push({ label: "Workspace", href: "/workspace/overview" });

      if (paths[1] === "overview") {
        crumbs.push({ label: "Commercial Overview", href: "/workspace/overview" });
      } else if (paths[1] === "orders") {
        crumbs.push({ label: "Purchase Orders", href: "/workspace/orders" });
      } else if (paths[1] === "agreements") {
        crumbs.push({ label: "Agreements", href: "/workspace/agreements" });
        if (paths[2]) {
          crumbs.push({
            label: paths[2],
            href: `/workspace/agreements/${paths[2]}`,
            isCurrent: true,
          });
        }
      } else if (paths[1] === "counteroffers") {
        crumbs.push({ label: "Counteroffers", href: "/workspace/counteroffers" });
      } else if (paths[1] === "invoices") {
        crumbs.push({ label: "Invoices", href: "/workspace/invoices" });
      } else if (paths[1] === "activity") {
        crumbs.push({ label: "Activity", href: "/workspace/activity" });
      } else if (paths[1] === "rules") {
        crumbs.push({ label: "Commercial Rules", href: "/workspace/rules" });
      } else if (paths[1] === "counterparties") {
        crumbs.push({ label: "Buyers & Suppliers", href: "/workspace/counterparties" });
      } else if (paths[1] === "settings") {
        crumbs.push({ label: "Workspace Settings", href: "/workspace/settings" });
      }
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  const handleNotificationClick = (route: string) => {
    setNotificationOpen(false);
    router.push(route);
  };

  const handleMarkAllRead = () => {
    setUnreadCount(0);
    info("Alerts marked as read.");
  };

  return (
    <header className="sticky top-0 z-20 h-14 bg-surface/90 backdrop-blur-md border-b border-border px-4 lg:px-6 flex items-center justify-between gap-4">
      {/* Left side: Mobile menu toggle + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden text-content-secondary hover:text-content-primary p-1.5 rounded-md hover:bg-app transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumb nav */}
        <nav
          aria-label="Breadcrumb"
          className="hidden sm:flex items-center gap-1.5 text-xs text-content-muted min-w-0 font-medium"
        >
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.href + idx}>
              {idx > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-content-muted/70 shrink-0" />
              )}
              {idx === breadcrumbs.length - 1 ? (
                <span className="text-content-primary truncate font-semibold">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-content-primary transition-colors truncate"
                >
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Sandbox indicator pill */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
          <span>SANDBOX MODE</span>
        </div>

        {/* Global Command Search trigger button */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-app hover:bg-[#EFEFEA] border border-border text-xs text-content-secondary hover:text-content-primary transition-all duration-150"
          title="Search or jump to section (Cmd+K)"
        >
          <Search className="w-3.5 h-3.5 text-content-muted" />
          <span className="hidden sm:inline">Search records...</span>
          <kbd className="hidden lg:inline-flex items-center text-[10px] font-mono text-content-muted px-1.5 py-0.5 bg-white border border-border rounded">
            ⌘K
          </kbd>
        </button>

        {/* Notification Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setNotificationOpen(!notificationOpen);
              setUserMenuOpen(false);
            }}
            className="relative p-2 rounded-md text-content-secondary hover:text-content-primary hover:bg-app transition-colors"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            )}
          </button>

          {notificationOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-surface border border-border rounded-lg shadow-dropdown p-3 z-30">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-subtle">
                <span className="text-xs font-semibold text-content-primary">
                  Commercial Alerts
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-content-muted">
                    {unreadCount} unread
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div
                  onClick={() => handleNotificationClick("/workspace/agreements/AGR-1042")}
                  className="p-2 rounded bg-app hover:bg-[#EFEFEA] border border-border-subtle cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-amber-700 font-medium text-[11px]">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Threshold conflict flagged</span>
                  </div>
                  <p className="text-content-secondary text-[11px] mt-1">
                    PO-8821 (Meridian Retail) requested 15% discount for 45 units.
                  </p>
                  <span className="text-[10px] text-content-muted mt-1 block font-mono">
                    12 min ago • Click to open AGR-1042
                  </span>
                </div>

                <div
                  onClick={() => handleNotificationClick("/workspace/counteroffers")}
                  className="p-2 rounded bg-app hover:bg-[#EFEFEA] border border-border-subtle cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-blue-700 font-medium text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Counteroffer accepted</span>
                  </div>
                  <p className="text-content-secondary text-[11px] mt-1">
                    Vertex Supplies accepted tooling fee split terms on AGR-1038.
                  </p>
                  <span className="text-[10px] text-content-muted mt-1 block font-mono">
                    Yesterday • Click to inspect
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User profile menu dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setNotificationOpen(false);
            }}
            className="flex items-center gap-2 p-1 pl-2 rounded-md hover:bg-app transition-colors border border-transparent hover:border-border"
          >
            <div className="w-6 h-6 rounded-full bg-sidebar-bg text-white font-mono text-[10px] font-semibold flex items-center justify-center">
              {DEMO_WORKSPACE_INFO.user.initials}
            </div>
            <span className="hidden md:inline text-xs font-medium text-content-primary">
              Alex M.
            </span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-lg shadow-dropdown p-1.5 z-30 text-xs">
              <div className="px-3 py-2 border-b border-border-subtle mb-1">
                <p className="font-semibold text-content-primary">
                  {user?.user_metadata?.name || DEMO_WORKSPACE_INFO.user.name}
                </p>
                <p className="text-[11px] text-content-muted truncate">
                  {user?.email || DEMO_WORKSPACE_INFO.user.email}
                </p>
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  setProfileModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-app text-content-primary transition-colors text-left"
              >
                <User className="w-3.5 h-3.5 text-content-muted" />
                <span>Account Profile</span>
              </button>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/workspace/settings");
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-app text-content-primary transition-colors text-left"
              >
                <Settings className="w-3.5 h-3.5 text-content-muted" />
                <span>Workspace Settings</span>
              </button>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onOpenImportModal();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-app text-content-primary transition-colors text-left"
              >
                <Sliders className="w-3.5 h-3.5 text-content-muted" />
                <span>Import Purchase Order</span>
              </button>

              <div className="border-t border-border-subtle my-1" />
              {isConfigured ? (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-red-50 text-red-600 transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/login");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-app text-content-secondary transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5 text-content-muted" />
                  <span>Switch account / Login</span>
                </button>
              )}
              <div className="px-3 py-1.5 text-[10px] text-content-muted font-mono">
                {isConfigured ? "Mode: Supabase Production" : "Mode: Demo (Mock Data)"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account Profile Modal */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Finance Administrator Profile"
        description="Active commercial credentials and signing authorization."
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center gap-3 p-3 bg-app border border-border rounded-lg">
            <div className="w-10 h-10 rounded-full bg-sidebar-bg text-white font-mono font-bold flex items-center justify-center text-sm">
              {DEMO_WORKSPACE_INFO.user.initials}
            </div>
            <div>
              <p className="font-semibold text-content-primary text-sm">
                {DEMO_WORKSPACE_INFO.user.name}
              </p>
              <p className="text-content-muted text-[11px]">
                {DEMO_WORKSPACE_INFO.user.role} • {DEMO_WORKSPACE_INFO.user.department}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="p-2.5 rounded border border-border bg-surface flex justify-between">
              <span className="text-content-muted">Organization:</span>
              <span className="font-medium text-content-primary">{DEMO_WORKSPACE_INFO.name}</span>
            </div>
            <div className="p-2.5 rounded border border-border bg-surface flex justify-between">
              <span className="text-content-muted">Email:</span>
              <span className="font-mono text-content-primary">{DEMO_WORKSPACE_INFO.user.email}</span>
            </div>
            <div className="p-2.5 rounded border border-border bg-surface flex justify-between">
              <span className="text-content-muted">Signing Authority:</span>
              <span className="font-medium text-emerald-700">Tier-1 Commercial Discretion ($50k)</span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setProfileModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </header>
  );
};
