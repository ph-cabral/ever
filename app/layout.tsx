import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TabTitle } from "@/components/TabTitle";
import { SidebarGlobal } from "@/components/nav/SidebarGlobal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EverWear · Sistema interno",
  description: "Sistema interno de EverWear",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TabTitle />
        {/* Sidebar "Mis accesos" en TODAS las vistas (overlay fijo: no corre el
            layout de las páginas). Se esconde sola en /login. */}
        <SidebarGlobal />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
