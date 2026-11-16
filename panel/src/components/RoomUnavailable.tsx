import RoomNotFoundScene from "@/components/RoomNotFoundScene";
import StatusPage from "@/components/StatusPage";
import { Button } from "@/components/ui/button";

/** Sala que não existe ou temporária que expirou: mostrada pelo servidor antes de qualquer etapa de entrada. */
export default function RoomUnavailable({ reason }: { reason: "missing" | "expired" }) {
  const expired = reason === "expired";
  return (
    <StatusPage
      title={expired ? "Sala expirada." : "Sala ou rota não encontrada."}
      text={
        expired
          ? "Esta sala temporária expirou e não abre mais reuniões. Peça um novo endereço a quem convidou você."
          : "Parece que você está tentando acessar uma sala ou rota que não existe ou foi removida."
      }
      scene={<RoomNotFoundScene className="h-auto w-full" />}
    >
      {/* Navegação completa de propósito (o domínio é dividido com o Jitsi; veja README). */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <Button render={<a href="/" />} nativeButton={false} size="lg" className="mt-8">
        Voltar à página inicial
      </Button>
    </StatusPage>
  );
}
