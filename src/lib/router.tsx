// Minimal hash router (no dependency). Hash routing is robust under SPA hosting
// because every route resolves to index.html without server rewrites.

import { useEffect, useState, type AnchorHTMLAttributes } from "react";

export function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "/";
}

export function navigate(path: string): void {
  if (currentPath() === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = path;
  }
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export function Link({ to, onClick, ...props }: LinkProps) {
  return (
    <a
      href={`#${to}`}
      onClick={(event) => {
        onClick?.(event);
      }}
      {...props}
    />
  );
}