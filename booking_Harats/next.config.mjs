/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Default is 10MB; menu PDF uploads go through /api/admin → proxy and hit this limit (HTTP 413).
  experimental: {
    proxyClientMaxBodySize: 50 * 1024 * 1024,
  },
  async rewrites() {
    return [
      {
        source: "/api/user/:path*",
        destination: "http://user-app:8000/api/:path*",
      },
      {
        source: "/health/user",
        destination: "http://user-app:8000/health",
      },
      {
        source: "/health/admin",
        destination: "http://admin-app:8001/health",
      },
    ]
  },
}

export default nextConfig
