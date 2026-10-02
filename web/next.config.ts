import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Bounded 512 KB visit JSON plus multipart form overhead. RPC validates too.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
