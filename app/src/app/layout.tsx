import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { Shell } from "@/components/shell";

const plexThai = IBM_Plex_Sans_Thai({ variable: "--font-plex-thai", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "UPVerse",
  description: "ที่ปรึกษาการลงทุนส่วนตัว — พอร์ต · สแกน · ตั๋วคำสั่ง (ใช้ส่วนตัว · ไม่ใช่คำแนะนำจากผู้มีใบอนุญาต)",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "UPVerse", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#050a17" }, { media: "(prefers-color-scheme: light)", color: "#f6f7f9" }], viewportFit: "cover", width: "device-width", initialScale: 1 };

const themeInit = `(function(){try{var t=localStorage.getItem('upv-theme')||'auto';var d=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plexThai.variable} ${plex.variable} ${plexMono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full" data-aurora="on">
        <Script id="upv-theme-init" strategy="beforeInteractive">{themeInit}</Script>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
