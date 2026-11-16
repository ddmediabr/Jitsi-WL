import { asc, eq } from "drizzle-orm";
import BrandMark from "@/components/BrandMark";
import HeroVisual from "@/components/hall/HeroVisual";
import RoomCarousel, { type HallRoom } from "@/components/hall/RoomCarousel";
import ThemeToggle from "@/components/ThemeToggle";
import { accessOf, DEFAULT_HALL_TITLE, isRoomIcon } from "@/lib/hall";
import { db } from "@/server/db";
import { rooms } from "@/server/db/schema";
import { getSetting } from "@/server/settings";

/** "sala-clientes" -> "Sala clientes": o nome da sala na URL, legível. */
const titleOf = (name: string) => {
  const text = name.replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Salas permanentes cadastradas no painel (as temporárias só existem por link e somem sozinhas). Lidas a cada visita: o que muda no painel aparece aqui. */
async function loadRooms(): Promise<HallRoom[]> {
  try {
    const rows = await db()
      .select({ name: rooms.name, exclusive: rooms.exclusive, lobby: rooms.lobby, password: rooms.password, description: rooms.description, icon: rooms.icon })
      .from(rooms)
      .where(eq(rooms.kind, "permanent"))
      .orderBy(asc(rooms.createdAt), asc(rooms.name));
    return rows.map((r) => {
      const access = accessOf(r);
      return {
        name: r.name,
        title: titleOf(r.name),
        status: access.status,
        description: r.description?.trim() || access.description,
        icon: isRoomIcon(r.icon) ? r.icon : access.icon,
      };
    });
  } catch {
    return []; // banco fora: a página abre sem salas em vez de quebrar
  }
}

async function loadTexts(): Promise<{ title: string; subtitle: string }> {
  try {
    return { title: (await getSetting("hall_title")).trim() || DEFAULT_HALL_TITLE, subtitle: (await getSetting("hall_subtitle")).trim() };
  } catch {
    return { title: DEFAULT_HALL_TITLE, subtitle: "" };
  }
}

export default async function Home() {
  const [list, texts] = await Promise.all([loadRooms(), loadTexts()]);
  // A última palavra do título vai na cor de destaque.
  const words = texts.title.split(" ");
  const last = words.length > 1 ? words.pop() : null;
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute -top-20 -right-56 -z-10 size-[700px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_70%)]"
        aria-hidden="true"
      />
      <ThemeToggle floating />

      <section className="mx-auto grid min-h-[410px] w-[min(1320px,calc(100%-36px))] items-center gap-8 border-b py-10 md:w-[min(1320px,calc(100%-80px))] md:grid-cols-[.9fr_1.1fr] md:py-0" aria-labelledby="hero-title">
        <div className="md:py-14">
          <BrandMark className="text-base" imgClassName="mb-6 h-16 object-left" />
          <h1 id="hero-title" className="text-[clamp(43px,5.6vw,70px)] leading-none font-extrabold tracking-[-0.06em] text-balance">
            {words.join(" ")}
            {last && <span className="text-primary"> {last}</span>}
          </h1>
          {texts.subtitle && <p className="mt-5 max-w-[560px] text-lg leading-relaxed text-muted-foreground">{texts.subtitle}</p>}
        </div>
        <HeroVisual />
      </section>

      <section className="mx-auto w-[min(1320px,calc(100%-36px))] pt-8 pb-14 md:w-[min(1320px,calc(100%-80px))]" id="salas" aria-labelledby="rooms-title">
        <h2 id="rooms-title" className="mb-6 text-[clamp(27px,3vw,34px)] font-semibold tracking-tight">
          Escolha sua sala:
        </h2>
        <RoomCarousel rooms={list} />
      </section>
    </main>
  );
}
