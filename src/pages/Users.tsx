import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Shield, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { api, ApiError, messageFor } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { roleLabel, ROLE_DESCRIPTIONS } from "@/lib/roles";
import type { PublicUser, Role } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RoleBadge } from "@/components/StatusBadge";
import { ErrorState, Forbidden, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

export function Users() {
  const { user: current, can } = useAuth();
  const allowed = can("users", "view");
  const canCreate = can("users", "create");
  const canEdit = can("users", "edit");
  const canDelete = can("users", "delete");

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [target, setTarget] = useState<PublicUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<PublicUser | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.listUsers();
      setUsers(data.users);
      setRoles(data.roles);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  if (!allowed) return <Forbidden section="User Management" />;

  function openCreate() {
    setTarget(null);
    setDialogMode("create");
    setDialogOpen(true);
  }
  function openEdit(u: PublicUser) {
    setTarget(u);
    setDialogMode("edit");
    setDialogOpen(true);
  }
  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    await api.deactivateUser(deactivateTarget.id);
    toast.success(`${deactivateTarget.display_name || deactivateTarget.username} deactivated.`);
    setDeactivateTarget(null);
    await load();
  }
  async function reactivate(u: PublicUser) {
    try {
      await api.updateUser(u.id, { version: u.version, is_active: true });
      toast.success(`${u.display_name || u.username} reactivated.`);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "write_conflict") { toast.error(messageFor(err)); await load(); }
      else toast.error(messageFor(err));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Manage accounts and roles. Deactivation is soft — audit references are preserved."
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh" title="Refresh"><RefreshCw /></Button>
            {canCreate ? <Button onClick={openCreate}><Plus /> Add user</Button> : null}
          </>
        }
      />

      <Card className="gap-0 overflow-hidden py-0">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : users.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                {canEdit || canDelete ? <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const self = u.id === current?.id;
                return (
                  <TableRow key={u.id} className={cn(!u.is_active && "opacity-60")}>
                    <TableCell>
                      <span className="block font-medium">{u.display_name || u.username}{self ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}</span>
                      <span className="block text-xs text-muted-foreground">@{u.username}</span>
                    </TableCell>
                    <TableCell><RoleBadge role={u.role} label={roleLabel(u.role)} /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", u.is_active
                        ? "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-secondary text-secondary-foreground")}>
                        {u.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDate(u.created_at)}</TableCell>
                    {canEdit || canDelete ? (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.username}`}><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit ? <DropdownMenuItem onClick={() => openEdit(u)}><Pencil /> Edit</DropdownMenuItem> : null}
                            {canDelete && u.is_active && !self ? (
                              <DropdownMenuItem variant="destructive" onClick={() => setDeactivateTarget(u)}><UserX /> Deactivate</DropdownMenuItem>
                            ) : null}
                            {canEdit && !u.is_active ? (
                              <DropdownMenuItem onClick={() => void reactivate(u)}><UserCheck /> Reactivate</DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <div key={r} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{roleLabel(r)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r as Role]}</p>
          </div>
        ))}
      </div>

      {canCreate || canEdit ? (
        <UserDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={dialogMode}
          target={target}
          roles={roles}
          currentUserId={current?.id ?? ""}
          onSaved={() => void load()}
          onStale={() => void load()}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
        title={`Deactivate ${deactivateTarget?.display_name || deactivateTarget?.username}?`}
        description="They will no longer be able to sign in. Their past entries and audit references are kept. You can reactivate them later."
        confirmLabel="Deactivate"
        destructive
        onConfirm={confirmDeactivate}
      />
    </div>
  );
}

function UserDialog({
  open, onOpenChange, mode, target, roles, currentUserId, onSaved, onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  target: PublicUser | null;
  roles: string[];
  currentUserId: string;
  onSaved: () => void;
  onStale: () => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const self = mode === "edit" && target?.id === currentUserId;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBanner(null);
    setPassword("");
    if (mode === "edit" && target) {
      setUsername(target.username);
      setDisplayName(target.display_name ?? "");
      setRole(target.role);
    } else {
      setUsername("");
      setDisplayName("");
      setRole(roles.includes("viewer") ? "viewer" : roles[0] ?? "viewer");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, target?.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (mode === "create") {
      const name = username.trim().toLowerCase();
      if (!USERNAME_RE.test(name)) next.username = "3–32 chars: lowercase letters, digits, underscore; start with a letter.";
      if (password.length < 12) next.password = "At least 12 characters.";
      if (!roles.includes(role)) next.role = "Choose a role.";
    } else if (password && password.length < 12) {
      next.password = "At least 12 characters (or leave blank to keep current).";
    }
    if ([...displayName.trim()].length > 120) next.display_name = "Keep it under 120 characters.";
    if (Object.keys(next).length) { setErrors(next); return; }

    setPending(true);
    setBanner(null);
    try {
      if (mode === "create") {
        await api.createUser({ username: username.trim().toLowerCase(), password, role, display_name: displayName.trim() || undefined });
        toast.success("User created.");
      } else if (target) {
        const body: { version: number; role?: string; display_name?: string; password?: string } = {
          version: target.version, display_name: displayName.trim(),
        };
        if (!self) body.role = role;
        if (password) body.password = password;
        await api.updateUser(target.id, body);
        toast.success("User updated.");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors((p) => ({ ...p, [err.field!]: messageFor(err) }));
      if (err instanceof ApiError && err.code === "write_conflict") {
        toast.error(messageFor(err));
        onStale();
        onOpenChange(false);
        return;
      }
      if (err instanceof ApiError && err.code === "username_taken") setErrors((p) => ({ ...p, username: messageFor(err) }));
      setBanner(messageFor(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add user" : `Edit ${target?.username ?? "user"}`}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Create an account and assign a role. They sign in with this username and password." : "Update the role, name or password. Role changes are blocked on your own account."}
          </DialogDescription>
        </DialogHeader>

        {banner ? <Alert variant="destructive"><AlertDescription>{banner}</AlertDescription></Alert> : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "create" ? (
            <div className="space-y-1.5">
              <Label htmlFor="u-username">Username<span className="text-destructive">*</span></Label>
              <Input id="u-username" value={username} autoComplete="off" aria-invalid={Boolean(errors.username)}
                onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: "" })); }} />
              {errors.username ? <p className="text-xs text-destructive">{errors.username}</p> : <p className="text-xs text-muted-foreground">Lowercase letters, digits, underscore. Cannot be changed later.</p>}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="u-display">Display name</Label>
            <Input id="u-display" value={displayName} aria-invalid={Boolean(errors.display_name)}
              onChange={(e) => { setDisplayName(e.target.value); setErrors((p) => ({ ...p, display_name: "" })); }} />
            {errors.display_name ? <p className="text-xs text-destructive">{errors.display_name}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-role">Role<span className="text-destructive">*</span></Label>
            <Select value={role} onValueChange={(v) => { setRole(v); setErrors((p) => ({ ...p, role: "" })); }} disabled={self}>
              <SelectTrigger id="u-role" className="w-full" aria-invalid={Boolean(errors.role)}><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.role ? <p className="text-xs text-destructive">{errors.role}</p>
              : self ? <p className="text-xs text-muted-foreground">You can't change your own role.</p>
              : <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role as Role]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-password">{mode === "create" ? <>Password<span className="text-destructive">*</span></> : "Reset password"}</Label>
            <Input id="u-password" type="password" value={password} autoComplete="new-password" aria-invalid={Boolean(errors.password)}
              placeholder={mode === "edit" ? "Leave blank to keep current" : "At least 12 characters"}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: "" })); }} />
            {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Create user" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}