import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxy = { "/functions/v1/app": "http://127.0.0.1:8000" };
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// App code lives under src/; the shadcn primitives, hooks and cn() live at the
// repo root. Resolve the root-owned prefixes first, then everything else to src.
// Mirrors tsconfig paths ["./src/*", "./*"] (no path overlaps between the two).
const alias = [
  { find: "@/components/ui", replacement: at("./components/ui") },
  { find: "@/lib/utils", replacement: at("./lib/utils.ts") },
  { find: "@/hooks", replacement: at("./hooks") },
  { find: "@", replacement: at("./src") },
];

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  server: { host: "127.0.0.1", proxy },
  preview: { host: "127.0.0.1", proxy },
  build: { outDir: "dist" },
});