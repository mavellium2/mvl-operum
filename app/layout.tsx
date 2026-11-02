import { APPEARANCE_KEY, appearancePeriod } from '@/lib/appearance';
import { palettes } from '@/lib/appearancePalette';
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar";
import "./globals.css";
import "@/components/ui/Field.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Operum",
    template: "%s | Operum",
  },
  description: "Gestão de projetos com Kanban",
  applicationName: "Operum",
  // Instalado na tela inicial do iPhone (PWA, MOB-18); o manifest vem de app/manifest.ts.
  appleWebApp: { capable: true, title: "Operum", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180" }],
  },
};

// Sem viewportFit "cover": as áreas seguras (notch, barra inicial) ainda não
// são tratadas nas telas; isso entra com a navegação mobile (MOB-01).
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head><script dangerouslySetInnerHTML={{ __html: `(()=>{let mode='automatic';try{mode=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||mode}catch{}const pick=${appearancePeriod.toString()};const period=pick(mode,new Date().getHours(),matchMedia('(prefers-color-scheme: dark)').matches);const colors=${JSON.stringify(Object.fromEntries(Object.entries(palettes).map(([key, value]) => [key, { bg: value.bg, text: value.text }])))};const root=document.documentElement;root.style.setProperty('--operum-initial-bg',colors[period].bg);root.style.setProperty('--operum-initial-text',colors[period].text);root.dataset.appearanceInitial=period})()` }} /></head>
      <body className="h-full flex flex-col" suppressHydrationWarning>
        <ToastProvider>
          <AppShell>{children}</AppShell>
          <ServiceWorkerRegistrar />
        </ToastProvider>
      </body>
    </html>
  );
}
