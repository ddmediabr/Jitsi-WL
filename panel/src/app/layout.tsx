import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { Geist, Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { BrandProvider } from "@/components/BrandProvider";
import { brandUrl } from "@/lib/brand";
import { resolveEntryBg } from "@/lib/entry-presets";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { getBrand } from "@/server/brand/brand";
import { paletteCss } from "@/lib/palette";
import { getAccents, getButtonTexts, getDefaultTheme, getPalette } from "@/server/theme/accents";

// WHITE LABEL: as fontes da marca trocam aqui (variáveis --font-sans, --font-heading e --font-mono).
const fontSans = Inter({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const fontHeading = Space_Grotesk({ variable: "--font-heading", subsets: ["latin"], weight: ["500", "600", "700"] });
const fontMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["500", "600"] });
// As telas públicas (login, primeiro acesso, 2FA, recuperação de senha) seguem na fonte que já tinham.
const fontAuth = Geist({ variable: "--font-auth", subsets: ["latin"] });

/** Título e favicon vêm da identidade configurada no painel (Configurações). */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const brand = await getBrand();
  return {
    title: `${brand.name} | Reuniões`,
    robots: { index: false, follow: false },
    ...(brand.faviconVersion !== null ? { icons: { icon: [{ url: brandUrl("favicon", brand.faviconVersion), type: "image/png" }] } } : {}),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection(); // a cor vem do painel: a página nunca é pré-renderizada em build
  const accents = await getAccents(); // em cache; o banco só é consultado de tempos em tempos
  const texts = await getButtonTexts();
  const paletteId = await getPalette();
  const palette = paletteCss(paletteId);
  // O <style> da paleta precisa do nonce da CSP (style-src sem 'unsafe-inline'); o proxy o entrega no cabeçalho x-nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const stored = await getBrand();
  // Com um preset e o ajuste automático ligado, os filtros do fundo vêm da paleta atual.
  const brand = { ...stored, entryBg: resolveEntryBg(stored.entryBg, paletteId) };
  // Tema: a escolha da pessoa (cookie) vale; sem escolha, o padrão definido no painel. O servidor já desenha no tema certo.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value) ?? (await getDefaultTheme());
  return (
    <html
      lang="pt-BR"
      style={
        {
          "--accent-dark": accents.dark,
          "--accent-dark-fg": texts.dark,
          "--accent-light": accents.light,
          "--accent-light-fg": texts.light,
          colorScheme: theme,
        } as React.CSSProperties
      }
      className={`${theme === "dark" ? "dark " : ""}${fontSans.variable} ${fontHeading.variable} ${fontMono.variable} ${fontAuth.variable} h-full antialiased`}
    >
      <head>{palette ? <style id="paleta" nonce={nonce} dangerouslySetInnerHTML={{ __html: palette }} /> : null}</head>
      <body className="min-h-full flex flex-col">
        <BrandProvider brand={brand}>{children}</BrandProvider>
      </body>
    </html>
  );
}
