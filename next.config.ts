import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/apps/qa",
  /* config options here */
  // Files never pass through Server Actions or routes (Vercel caps request bodies at 4.5 MB): the browser uploads
  // them straight to Supabase Storage with a signed URL, so the default body limits stay.
  experimental: {
    agentFeedback: true,
  },
  // The dev script binds 127.0.0.1; allow both loopback names so either URL hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // The DAR Excel export reads the seal from public/; Vercel only bundles files a function is traced to use.
  outputFileTracingIncludes: { "/dar/export": ["./public/dcwd-seal.png"] },
  // Browsers must always fetch the newest service worker, or a fix to it could take a day to reach people.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
