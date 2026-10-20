import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  // Keeps the dev-only indicator clear of the floating buttons in the bottom-right corner.
  devIndicators: {
    position: "bottom-left",
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
