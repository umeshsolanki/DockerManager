import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  reactCompiler: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '/ui',
  transpilePackages: ['lucide-react'],
};

export default nextConfig;
