import "./globals.css";

export const metadata = {
  title: "ChainFestival",
  description: "FHEVM-based Festival on-chain tickets & check-ins",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
