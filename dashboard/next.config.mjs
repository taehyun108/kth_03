/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" }, // 다른 사이트가 이 화면을 iframe 으로 감싸는 것을 막는다
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cache-Control", value: "private, no-store" }, // 비밀번호로 보호된 화면이 공용 캐시에 남지 않게
        ],
      },
    ];
  },
};
export default nextConfig;
