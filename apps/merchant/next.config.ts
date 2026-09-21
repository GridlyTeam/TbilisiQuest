import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Without this, Next refuses to serve its dev assets (HMR, client chunks) to
  // a phone on the LAN, so client components never hydrate and every button
  // silently does nothing. Development only -- production builds are unaffected.
  allowedDevOrigins: ['192.168.1.144'],
}

export default nextConfig
