import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = process.env.VERCEL
  ? {}
  : {
      turbopack: {
        // Local monorepo — avoid picking up a parent package-lock.json
        root: frontendRoot,
      },
    };

export default nextConfig;
