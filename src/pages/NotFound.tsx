import { Compass } from "lucide-react";
import { Link } from "@/lib/router";
import { useAuth } from "@/auth/AuthContext";
import { firstAccessibleRoute } from "@/lib/resources";
import { Button } from "@/components/ui/button";

export function NotFound() {
  const { permissions } = useAuth();
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The page you're looking for doesn't exist or may have moved.</p>
      </div>
      <Button asChild><Link to={firstAccessibleRoute(permissions)}>Back to home</Link></Button>
    </div>
  );
}