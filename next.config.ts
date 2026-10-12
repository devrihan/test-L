import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray package-lock.json in the
  // home dir made Turbopack infer the wrong root, which broke route resolution.
  turbopack: {
    root: __dirname,
  },
  // Session replay (Contentsquare) rebuilds the captured DOM inside an iframe on
  // ITS origin, then reads our stylesheet as text to inline it. A plain public
  // file isn't enough for that: a cross-origin READ from JS needs CORS, and
  // without it the read fails silently and replays render as unstyled DOM.
  // Scoped to /_next/static — immutable build output, no user data, no
  // credentials — so this widens nothing on /api or any page route.
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
