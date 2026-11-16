import AccentForm from "@/components/settings/AccentForm";
import { BrandSection } from "@/components/settings/BrandForms";
import CustomizeTabs, { CUSTOMIZE_TABS, parseTab } from "@/components/settings/CustomizeTabs";
import DefaultThemeForm from "@/components/settings/DefaultThemeForm";
import EntryBgForm from "@/components/settings/EntryBgForm";
import { ExitTextsForm, HallTextForm } from "@/components/settings/HallForms";
import { DEFAULT_HALL_TITLE } from "@/lib/hall";
import { getSetting } from "@/server/settings";
import RecordingMailForm from "@/components/settings/RecordingMailForm";
import PaletteForm from "@/components/settings/PaletteForm";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullAuth } from "@/server/auth/dal";
import { getBrand } from "@/server/brand/brand";
import { buildRecordingMail, withDefaults } from "@/lib/mail-template";
import { getMailAccent, getSavedMailTexts } from "@/server/recordings/mail-template";
import { paletteBackground } from "@/lib/palette";
import { getAccents, getButtonTexts, getDefaultTheme, getPalette } from "@/server/theme/accents";

const SECTION_TITLE = "text-[19px] leading-snug font-semibold";

export default async function CustomizePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireFullAuth();
  const tab = parseTab((await searchParams).aba);
  const label = CUSTOMIZE_TABS.find((t) => t.id === tab)?.label ?? "";

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-[34px] leading-tight font-bold">Personalização</h1>
        <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">
          Aparência da marca e das páginas do produto.
        </p>
      </div>

      <CustomizeTabs current={tab} />

      {tab === "geral" && <GeneralTab />}
      {tab === "espera" && <EntryTab />}
      {tab === "entrada" && <HallTab title={label} />}
      {tab === "saida" && <ExitTab title={label} />}
      {tab === "emails" && <EmailsTab title={label} />}
    </div>
  );
}

async function ExitTab({ title }: { title: string }) {
  const { exit } = await getBrand();
  return (
    <Card>
      <CardContent className="grid gap-5 px-6 py-1">
        <h2 className={SECTION_TITLE}>{title}</h2>
        <p className="max-w-none! text-sm leading-relaxed text-muted-foreground">A tela que a pessoa vê ao sair da reunião. Cada situação tem o seu texto.</p>
        <ExitTextsForm texts={exit} />
      </CardContent>
    </Card>
  );
}

async function EmailsTab({ title }: { title: string }) {
  const [savedMail, accent, brand] = await Promise.all([getSavedMailTexts(), getMailAccent(), getSetting("brand_name")]);
  const preview = buildRecordingMail({
    texts: withDefaults(savedMail),
    accent,
    vars: { nome: "Maria", marca: brand, sala: "reuniao-semanal", inicio: "14/11/2026 15:00", duracao: "42min 10s", tamanho: "380,5 MB", horas: "24" },
    link: "#",
    transcript: "ok",
  });
  return (
    <Card>
      <CardContent className="grid gap-5 px-6 py-1">
        <h2 className={SECTION_TITLE}>{title}</h2>
        <h3 className="text-base font-semibold">Gravação pronta</h3>
        <RecordingMailForm saved={savedMail} />
        <div className="grid gap-2">
          <p className="text-sm font-medium">Prévia (com dados de exemplo, já com o que está salvo)</p>
          <iframe title="Prévia do e-mail da gravação" sandbox="" srcDoc={preview.html} className="h-[640px] w-full max-w-[640px] rounded-xl border bg-white" />
          <p className="text-xs text-muted-foreground">Assunto: {preview.subject}</p>
        </div>
      </CardContent>
    </Card>
  );
}

async function HallTab({ title }: { title: string }) {
  const [heading, subtitle] = await Promise.all([getSetting("hall_title"), getSetting("hall_subtitle")]);
  return (
    <Card>
      <CardContent className="grid gap-5 px-6 py-1">
        <h2 className={SECTION_TITLE}>{title}</h2>
        <p className="max-w-none! text-sm leading-relaxed text-muted-foreground">
          A página inicial, com a lista de salas. O ícone e o texto de cada cartão ficam na página da sala.
        </p>
        <HallTextForm title={heading || DEFAULT_HALL_TITLE} subtitle={subtitle} />
      </CardContent>
    </Card>
  );
}

async function GeneralTab() {
  const accents = await getAccents();
  const texts = await getButtonTexts();
  const defaultTheme = await getDefaultTheme();
  const brand = await getBrand();
  const palette = await getPalette();
  return (
    <>
      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className={SECTION_TITLE}>Identidade da marca</h2>
          <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
            Nome, logos e favicon. Aparecem no painel, nas telas de entrada e na aba do navegador.
          </p>
          <BrandSection brand={brand} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className={SECTION_TITLE}>Tema padrão</h2>
          <DefaultThemeForm current={defaultTheme} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className={SECTION_TITLE}>Paleta dos temas</h2>
          <PaletteForm current={palette} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className={SECTION_TITLE}>Cor de destaque</h2>
          <AccentForm current={accents} currentText={texts} palette={palette} />
        </CardContent>
      </Card>
    </>
  );
}

async function EntryTab() {
  const brand = await getBrand();
  const palette = await getPalette();
  return (
    <Card>
      <CardContent className="grid gap-5 px-6 py-1">
        <h2 className={SECTION_TITLE}>Fundo da sala de espera e da entrada na sala</h2>
        <p className="max-w-none! text-sm leading-relaxed text-muted-foreground">
          Vale para as telas de entrada na sala: escolha de acesso, login, pré-entrada e espera. O fundo aparece atrás do cartão e os filtros ajustam a mistura com o tema.
        </p>
        <EntryBgForm brand={brand} palette={palette} backgrounds={{ dark: paletteBackground(palette, "dark"), light: paletteBackground(palette, "light") }} />
      </CardContent>
    </Card>
  );
}
