"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FileCheck2,
  GitCompare,
  Receipt,
  History,
  Users2,
  SlidersHorizontal,
  Settings,
  HelpCircle,
  ChevronDown,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DEMO_WORKSPACE_INFO, getDerivedSidebarCounts } from "@/data/mockData";

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenHelp?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  mobileOpen = false,
  onMobileClose,
  onOpenHelp,
}) => {
  const pathname = usePathname();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const counts = getDerivedSidebarCounts();

  const workspaceNav = [
    {
      label: "Overview",
      href: "/workspace/overview",
      icon: LayoutDashboard,
      badge: undefined,
    },
    {
      label: "Purchase Orders",
      href: "/workspace/orders",
      icon: FileText,
      badge: counts.orders,
    },
    {
      label: "Agreements",
      href: "/workspace/agreements",
      activePattern: "/workspace/agreements",
      icon: FileCheck2,
      badge: counts.agreements,
    },
    {
      label: "Counteroffers",
      href: "/workspace/counteroffers",
      icon: GitCompare,
      badge: counts.counteroffers,
    },
    {
      label: "Invoices",
      href: "/workspace/invoices",
      icon: Receipt,
      badge: undefined,
    },
    {
      label: "Activity",
      href: "/workspace/activity",
      icon: History,
      badge: undefined,
    },
  ];

  const managementNav = [
    {
      label: "Buyers & Suppliers",
      href: "/workspace/counterparties",
      icon: Users2,
    },
    {
      label: "Commercial Rules",
      href: "/workspace/rules",
      icon: SlidersHorizontal,
    },
  ];

  const isNavActive = (href: string, activePattern?: string) => {
    if (activePattern) {
      return pathname.startsWith(activePattern);
    }
    return pathname === href;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar-bg text-sidebar-text w-[248px] select-none border-r border-[#242832]">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#242832]">
        <div className="flex items-center justify-between mb-3">
          <Link href="/workspace/overview" className="flex items-center gap-2.5 group">
            {/* Custom Geometric Brand Mark */}
            <div className="w-7 h-7 rounded bg-[#202530] border border-[#2E3544] flex items-center justify-center p-1.5 transition-colors group-hover:border-primary">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full text-white"
              >
                {/* Precision bridge span geometric icon */}
                <path
                  d="M3 17V12C3 8.68629 5.68629 6 9 6H15C18.3137 6 21 8.68629 21 12V17"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M3 17H21"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M8 17V11"
                  stroke="#3159D9"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M16 17V11"
                  stroke="#3159D9"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="6" r="2" fill="#3159D9" />
              </svg>
            </div>

            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
                TERMBridge
              </span>
              <span className="text-[10px] text-sidebar-muted tracking-wide uppercase font-mono">
                Commercial Core
              </span>
            </div>
          </Link>

          {mobileOpen && (
            <button
              onClick={onMobileClose}
              className="lg:hidden text-sidebar-muted hover:text-white p-1 rounded"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Merchant Workspace Selector */}
        <div className="relative">
          <button
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-[#1D212A] hover:bg-sidebar-hover border border-[#2A303C] transition-colors text-left text-xs"
          >
            <div className="flex items-center gap-2 truncate">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="truncate">
                <span className="font-medium text-white block truncate">
                  {DEMO_WORKSPACE_INFO.name}
                </span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-sidebar-muted shrink-0" />
          </button>

          {workspaceMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-[#1F232D] border border-[#2E3544] rounded-md shadow-dropdown z-20 text-xs">
              <div className="px-2 py-1 text-[10px] uppercase font-mono text-sidebar-muted">
                Active Organization
              </div>
              <div className="px-2 py-1.5 text-white font-medium bg-[#2A303C] rounded flex items-center justify-between">
                <span>Northstar Supply</span>
                <span className="text-[10px] text-emerald-400 font-mono">Live</span>
              </div>
              <div className="px-2 py-1.5 text-sidebar-muted hover:text-white cursor-not-allowed flex items-center justify-between opacity-60">
                <span>Vertex Global (Holding)</span>
                <span className="text-[10px] font-mono">Switch</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Workspace section */}
        <div>
          <div className="px-2 mb-2 text-[10px] font-mono uppercase tracking-wider text-sidebar-muted">
            WORKSPACE
          </div>
          <nav className="space-y-0.5">
            {workspaceNav.map((item) => {
              const active = isNavActive(item.href, item.activePattern);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    "relative flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors group",
                    active
                      ? "text-white bg-sidebar-active"
                      : "text-sidebar-muted hover:text-white hover:bg-sidebar-hover"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebarActive"
                      className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        active
                          ? "text-primary"
                          : "text-sidebar-muted group-hover:text-white"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0",
                        active
                          ? "bg-primary/20 text-white"
                          : "bg-[#232732] text-sidebar-muted group-hover:text-white"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Management section */}
        <div>
          <div className="px-2 mb-2 text-[10px] font-mono uppercase tracking-wider text-sidebar-muted">
            MANAGEMENT
          </div>
          <nav className="space-y-0.5">
            {managementNav.map((item) => {
              const active = isNavActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    "relative flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors group",
                    active
                      ? "text-white bg-sidebar-active"
                      : "text-sidebar-muted hover:text-white hover:bg-sidebar-hover"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebarActive"
                      className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r"
                    />
                  )}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        active
                          ? "text-primary"
                          : "text-sidebar-muted group-hover:text-white"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="p-3 border-t border-[#242832] space-y-1">
        {/* Settings Route Link */}
        <Link
          href="/workspace/settings"
          onClick={onMobileClose}
          className={cn(
            "relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors group text-left",
            pathname === "/workspace/settings"
              ? "text-white bg-sidebar-active"
              : "text-sidebar-muted hover:text-white hover:bg-sidebar-hover"
          )}
        >
          {pathname === "/workspace/settings" && (
            <motion.div
              layoutId="sidebarActive"
              className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r"
            />
          )}
          <Settings className="w-4 h-4 shrink-0 text-sidebar-muted group-hover:text-white" />
          <span>Settings</span>
        </Link>

        {/* Help Action Trigger */}
        <button
          onClick={onOpenHelp}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-sidebar-muted hover:text-white hover:bg-sidebar-hover transition-colors text-left"
        >
          <HelpCircle className="w-4 h-4 text-sidebar-muted" />
          <span>Help & Documentation</span>
        </button>

        {/* User Profile */}
        <div className="mt-2 pt-2 border-t border-[#242832] flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#2A3140] border border-[#3A4356] flex items-center justify-center text-xs font-semibold text-white font-mono shrink-0">
              {DEMO_WORKSPACE_INFO.user.initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate leading-tight">
                {DEMO_WORKSPACE_INFO.user.name}
              </p>
              <p className="text-[10px] text-sidebar-muted truncate leading-tight">
                {DEMO_WORKSPACE_INFO.user.role}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile drawer sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            onClick={onMobileClose}
            className="fixed inset-0 bg-[#171A20]/50 backdrop-blur-sm"
          />
          <div className="relative z-10">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
