import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { sidebarScript, themeScript } from "@/lib/boot-scripts";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: process.env.NEXT_PUBLIC_APP_NAME || "Davey CRM", template: `%s · ${process.env.NEXT_PUBLIC_APP_NAME || "Davey CRM"}` },
  description: "Clients, campaigns, conversations and billing in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${jakarta.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + ";" + sidebarScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
