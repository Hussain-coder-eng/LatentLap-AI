/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
}
module.exports = nextConfig
