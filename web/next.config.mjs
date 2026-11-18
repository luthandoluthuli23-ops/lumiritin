/** @type {import('next').NextConfig} */
const nextConfig = {
  // Feature switches that browser components also read (see lib/features.ts). Baked in at build time.
  env: {
    CHARTER_PUBLIC: process.env.CHARTER_PUBLIC ?? "false",
    CHARTER_SERVED_AIRFIELDS: process.env.CHARTER_SERVED_AIRFIELDS ?? "",
  },
};

export default nextConfig;
