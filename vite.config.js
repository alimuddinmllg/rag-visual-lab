import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the build works from any folder or sub-path.
export default defineConfig({ plugins: [react()], base: "./" });
