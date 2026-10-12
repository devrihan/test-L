import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ConfigProvider } from "@/components/config-provider";
import { getConfigValue, resolveDoc } from "@/app/lib/server/config";
import { configScopeFromSession } from "@/app/lib/server/session";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LOAM",
  description: "LOAM",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // School-resolved runtime config for client components. Reading the session
  // cookie here makes all routes dynamically rendered — acceptable for a
  // login-gated dashboard, and required for per-school flags at first paint.
  //
  // /login renders under this layout with no session yet. It reads no flags, so
  // it gets no config rather than a guessed one — any component that did try to
  // read a flag there would throw, which is the right answer for a page with no
  // school to read config for. Every other route is behind the auth middleware,
  // so a signed-in request always takes the resolved branch (or fails loudly if
  // the token carries no school).
  const session = await configScopeFromSession();
  if (session.status === "unresolved") {
    // Signed in, but the token carries no schoolId. There is no honest config
    // to serve this account, and picking one would show it another school's
    // settings — so surface it instead of rendering something plausible.
    throw new Error(
      "[config] the signed-in account's token carries no schoolId claim, so no school config " +
        "applies to it. Set the schoolId attribute on the Keycloak account.",
    );
  }
  const scope = session.status === "resolved" ? session.scope : undefined;
  // No scope means no config, and `null` says exactly that. An empty array
  // would be a guess — and the permissive one, silently un-hiding every excluded
  // academic year — which is the fallback this whole contract exists to remove.
  // ConfigProvider leaves the filter helpers unset for null, so anything that
  // does try to filter without a scope throws instead of quietly showing all.
  const featureFlags = scope ? resolveDoc("feature_flags", scope) : {};
  const academicYearScope = scope
    ? {
        excludedYears: getConfigValue<string[]>("academic_year_scope", "excluded_years", { scope }),
        excludeYearless: getConfigValue<boolean>("academic_year_scope", "exclude_yearless", { scope }),
      }
    : null;
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConfigProvider value={featureFlags} academicYearScope={academicYearScope}>
          {children}
        </ConfigProvider>

        {process.env.NEXT_PUBLIC_HOTJAR_ID && (
          
          <Script
            id="hotjar"
            src={`https://t.contentsquare.net/uxa/${process.env.NEXT_PUBLIC_HOTJAR_ID}.js`}
            strategy="beforeInteractive"
          />
        )}
      </body>
    </html>
  );
}
