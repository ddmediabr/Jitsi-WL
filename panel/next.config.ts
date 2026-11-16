import type { NextConfig } from "next";

/**
 * O domínio é único: o mesmo domínio da instalação serve o Jitsi E este app.
 * O Traefik decide quem responde (veja README.md). Por isso este app reserva
 * prefixos que o Jitsi não usa: /_next, /_flow, /flow-api e /settings.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  // cacheComponents/partialPrefetching DESLIGADOS de propósito: com eles, /<sala> era
  // pré-gerada como casca estática vazia e a tela da sala nunca aparecia (fundo preto).
  poweredByHeader: false,
  // Módulos com código nativo/binário: ficam fora do pacote do bundler.
  serverExternalPackages: ["@node-rs/argon2", "pg", "sharp"],
  // Upload de imagens (logo, favicon, foto pelo painel) vai por ação do servidor: o padrão do Next é 1 MB. 12 MB deixa passar o maior arquivo
  // permitido (vídeo de fundo, 10 MB) e ainda deixa o NOSSO aviso de tamanho aparecer, em vez de um erro genérico do Next.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Ninguém pode embutir as nossas páginas em outro site.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self)",
          },
        ],
      },
      {
        // Foto de perfil: é só uma imagem, então nada (script, estilo, quadro) pode rodar a partir dela.
        // Vem depois da regra geral para a substituir.
        source: "/flow-api/avatar/:user",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }],
      },
      {
        // Logo e favicon: só imagem.
        source: "/flow-api/brand/:kind",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }],
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
