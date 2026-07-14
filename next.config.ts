import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the project root explicitly. Without this, Turbopack can get
    // confused if it finds another lockfile higher up the directory tree
    // (e.g. elsewhere under ~/Desktop) and try to scan folders outside
    // this project, which fails under macOS's Desktop folder protection.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
