import bundleAnalyzer from "@next/bundle-analyzer"

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" })

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors now fail the build rather than shipping silently.
  typescript: { ignoreBuildErrors: false },
  experimental: { agentUpgrade: "security" },
  images: { unoptimized: true },
  // The development indicator occupies the left-aligned Start button's hit area.
  devIndicators: false,
  reactStrictMode: true,
}

export default withBundleAnalyzer(nextConfig)
