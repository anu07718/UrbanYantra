import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Pin project root — avoids picking up C:\Users\Admin\package-lock.json
    root: frontendRoot,
  },
};

export default nextConfig;
