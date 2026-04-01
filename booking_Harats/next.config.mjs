/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/user/:path*",
        destination: "http://user-app:8000/api/:path*",
      },
      {
        source: "/api/admin/:path*",
        destination: "http://admin-app:8001/api/:path*",
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
