import { useState, type ReactNode } from "react";
import { LogOut, Menu, Signal } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Link, navigate, useRoute } from "@/lib/router";
import { NAV, firstAccessibleRoute } from "@/lib/resources";
import { initials } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Signal className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">ConnecTEL</span>
        {!compact ? <span className="block text-[11px] text-muted-foreground">Business Manager</span> : null}
      </span>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRoute();
  const { can, permissions } = useAuth();
  const active = path === "/" ? firstAccessibleRoute(permissions) : path;

  return (
    <nav className="flex flex-col gap-5 px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((item) => can(item.module, "view"));
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="space-y-1">
            <p className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p>
            {items.map((item) => {
              const isActive = active === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function UserTile() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2.5 border-t border-sidebar-border p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initials(user.display_name || user.username)}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">{user.display_name || user.username}</span>
        <span className="block truncate text-xs text-muted-foreground">{roleLabel(user.role)}</span>
      </span>
      <Button variant="ghost" size="icon-sm" onClick={() => void logout()} aria-label="Sign out" title="Sign out">
        <LogOut />
      </Button>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.display_name || user.username)}
          </span>
          <span className="hidden max-w-[12ch] truncate text-sm font-medium sm:block">{user.display_name || user.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium">{user.display_name || user.username}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{roleLabel(user.role)} · @{user.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { permissions } = useAuth();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="min-h-dvh bg-background">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="flex h-14 items-center border-b border-sidebar-border px-4">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <NavLinks />
          </div>
          <UserTile />
        </aside>

        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b px-4">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
          <UserTile />
        </SheetContent>

        <div className="flex min-h-dvh flex-col md:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <button className="md:hidden" onClick={() => navigate(firstAccessibleRoute(permissions))} aria-label="ConnecTEL home">
              <Brand compact />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <UserMenu />
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </Sheet>
  );
}