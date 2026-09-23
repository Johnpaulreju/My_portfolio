import bundleAnalyzer from "@next/bundle-analyzer"

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" })

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors now fail the build rather than shipping silently.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  images: { unoptimized: true },
  reactStrictMode: true,
}

export default withBundleAnalyzer(nextConfig)
