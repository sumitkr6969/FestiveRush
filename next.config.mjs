/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Native module: keep it out of the bundle so it only ever loads on the server.
    serverComponentsExternalPackages: ["better-sqlite3"],
    // The DB is read via fs at runtime, which file tracing can't see; ship it explicitly.
    outputFileTracingIncludes: { "/**": ["./data/voltkart.db"] },
  },
};

export default nextConfig;
