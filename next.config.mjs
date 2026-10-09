/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Native module: keep it out of the bundle so it only ever loads on the server.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
