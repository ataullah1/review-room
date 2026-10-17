/** Capability pages must not send tokens or visitor content to third-party scripts/fonts. */
const capabilityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  {
    key: "Content-Security-Policy",
    value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' https://*.supabase.co; connect-src 'self'${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  },
];
const nextConfig = {
  async headers() {
    return ["/invite/:path*", "/share/:path*"].map((source) => ({
      source,
      headers: capabilityHeaders,
    }));
  },
};

export default nextConfig;
