import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Mensagem de erro/sucesso de formulário (leitores de tela anunciam mudanças). */
export default function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"} className="max-w-3xl">
      {error ? <CircleAlertIcon aria-hidden="true" /> : <CircleCheckIcon aria-hidden="true" />}
      <AlertDescription>{error ?? ok}</AlertDescription>
    </Alert>
  );
}
