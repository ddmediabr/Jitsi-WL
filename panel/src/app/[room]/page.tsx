import { Suspense } from "react";
import type { Metadata } from "next";
import RoomFlow from "@/components/RoomFlow";
import RoomUnavailable from "@/components/RoomUnavailable";
import { roomPublicInfo, type RoomPublicInfo } from "@/server/rooms/public-info";
import { getBrand } from "@/server/brand/brand";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return { title: `Entrar na sala | ${brand.name}`, robots: { index: false, follow: false } };
}

// O estado da sala é checado AQUI, no servidor: sala inexistente ou expirada cai direto na tela de aviso, sem passar pelas etapas de entrada.
// O nome da sala também é lido no navegador (usePathname), dentro de Suspense.
export default async function RoomPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  let name = room;
  try {
    name = decodeURIComponent(room);
  } catch {
    /* endereço malformado: a checagem abaixo o trata como sala inexistente */
  }
  let info: RoomPublicInfo | null = null;
  try {
    info = await roomPublicInfo(name);
  } catch {
    info = null; // banco fora: segue o fluxo normal (o servidor de reuniões ainda decide o acesso)
  }
  if (info && !info.exists) return <RoomUnavailable reason="missing" />;
  if (info?.expired) return <RoomUnavailable reason="expired" />;
  return (
    <Suspense fallback={null}>
      <RoomFlow />
    </Suspense>
  );
}
