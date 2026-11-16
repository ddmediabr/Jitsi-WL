/**
 * Animação da página "sala não encontrada": um notebook sobre a mesa tenta entrar numa sala (spinner), a tela treme e mostra o erro "Room not found".
 * Só SVG e CSS (classes `.rnf-*` no globals.css); as cores de destaque seguem a paleta e a mesa segue o tema. Sempre anima
 * (sem tratamento de "reduzir movimento"). Decorativa: o texto da página já diz tudo.
 */
export default function RoomNotFoundScene({ className }: { className?: string }) {
  return (
    <svg viewBox="80 100 1120 620" role="presentation" aria-hidden="true" className={className} xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="rnf-bezel" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stopColor="#252f43"/>
<stop offset="1" stopColor="#161d2b"/>
</linearGradient>
<linearGradient id="rnf-base" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stopColor="#2c374c"/>
<stop offset="1" stopColor="#1b2333"/>
</linearGradient>
<linearGradient id="rnf-deskTop" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" style={{ stopColor: "color-mix(in oklab, var(--foreground) 12%, var(--background))" }}/>
<stop offset="1" style={{ stopColor: "color-mix(in oklab, var(--foreground) 8%, var(--background))" }}/>
</linearGradient>
<linearGradient id="rnf-deskFade" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" style={{ stopColor: "var(--background)", stopOpacity: "0.95" }}/>
<stop offset="1" style={{ stopColor: "var(--background)", stopOpacity: "0" }}/>
</linearGradient>
<clipPath id="rnf-scr">
<rect x="214" y="164" width="512" height="292" rx="8"/>
</clipPath>
<filter id="rnf-blurBig" x="-30%" y="-30%" width="160%" height="160%">
<feGaussianBlur stdDeviation="34"/>
</filter>
<filter id="rnf-blurSm" x="-10%" y="-100%" width="120%" height="300%">
<feGaussianBlur stdDeviation="9"/>
</filter>
</defs>

<ellipse cx="640" cy="410" rx="540" ry="280" fill="var(--primary)" opacity="0.09"/>
<circle className="rnf-twinkle" cx="150" cy="128" r="4" fill="var(--primary)"/>
<circle className="rnf-twinkle2" cx="1110" cy="150" r="5" fill="var(--primary)"/>

{/* Desk */}
<g transform="translate(0 30)">
<rect x="130" y="510" width="1020" height="120" fill="url(#rnf-deskFade)"/>
<rect x="100" y="490" width="1080" height="20" rx="10" fill="url(#rnf-deskTop)" stroke="color-mix(in oklab, var(--foreground) 22%, var(--background))" strokeWidth="1.5"/>
<rect x="112" y="491.5" width="1056" height="1.5" rx="0.75" fill="#ffffff" opacity="0.1"/>
<ellipse cx="640" cy="492" rx="350" ry="7" fill="#000" opacity="0.55" filter="url(#rnf-blurSm)"/>
</g>

{/* Laptop lid + screen */}
<g transform="translate(170 30)">
<rect className="rnf-glow" x="214" y="164" width="512" height="292" rx="8" opacity="0.3" filter="url(#rnf-blurBig)"/>
<path d="M200 470 V168 Q200 150 218 150 H722 Q740 150 740 168 V470 Z" fill="url(#rnf-bezel)" stroke="#2d3b52" strokeWidth="1.5"/>
<path d="M219 151 H721" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.5" fill="none"/>
<circle cx="470" cy="157" r="1.8" fill="#3a4a63"/>
{/* Screen */}
<rect x="214" y="164" width="512" height="292" rx="8" fill="#070d18"/>
<g clipPath="url(#rnf-scr)">
<rect x="214" y="164" width="512" height="292" fill="#070d18"/>
<rect x="214" y="164" width="512" height="36" fill="#0b1424"/>
<rect x="214" y="199.5" width="512" height="1" fill="#16233a"/>
<rect x="228" y="177" width="56" height="10" rx="5" fill="#2c3e5c"/>
<rect x="546" y="179" width="28" height="6" rx="3" fill="#22324c"/>
<rect x="586" y="179" width="28" height="6" rx="3" fill="#22324c"/>
<rect x="626" y="179" width="28" height="6" rx="3" fill="#22324c"/>
<rect x="676" y="174" width="36" height="16" rx="8" fill="var(--primary)"/>

{/* Phase A: joining */}
<g className="rnf-pa">
<circle cx="470" cy="290" r="22" fill="none" stroke="#15233b" strokeWidth="4"/>
<circle className="rnf-spin" cx="470" cy="290" r="22" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeDasharray="34 104.2"/>
<text fontFamily="inherit" x="470" y="346" textAnchor="middle" fontSize="15" fontWeight="500" fill="#b9c8de">Joining room<tspan className="rnf-dots">…</tspan></text>
</g>

{/* Phase B: error */}
<g className="rnf-pb">
<circle className="rnf-ripple" cx="470" cy="236" r="18" fill="none" stroke="#ff5c5c" strokeWidth="1.5"/>
<circle cx="470" cy="236" r="18" fill="#ff5c5c" fillOpacity="0.12" stroke="#ff5c5c" strokeWidth="1.5"/>
<line x1="470" y1="228.5" x2="470" y2="237.5" stroke="#ff7a7a" strokeWidth="2.4" strokeLinecap="round"/>
<circle cx="470" cy="243.5" r="1.5" fill="#ff7a7a"/>
<text fontFamily="inherit" className="rnf-shake" x="470" y="300" textAnchor="middle" fontSize="36" fontWeight="800" letterSpacing="-0.5" fill="#ffffff">Room not found</text>
<text fontFamily="inherit" x="470" y="328" textAnchor="middle" fontSize="13.5" fontWeight="500" fill="#8ea0bb">Check the link or ask the host for a new invite.</text>
<rect x="364" y="350" width="110" height="36" rx="18" fill="var(--primary)"/>
<text fontFamily="inherit" x="419" y="373" textAnchor="middle" fontSize="14" fontWeight="700" fill="#ffffff">Try again</text>
<rect x="486" y="350" width="90" height="36" rx="18" fill="none" stroke="#2b3c58" strokeWidth="1.5"/>
<text fontFamily="inherit" x="531" y="373" textAnchor="middle" fontSize="14" fontWeight="700" fill="#c3d0e4">Back</text>
</g>

{/* Progress */}
<rect x="244" y="430" width="452" height="3" rx="1.5" fill="#12203a"/>
<rect className="rnf-bar" x="244" y="430" width="452" height="3" rx="1.5" fill="var(--primary)"/>

<polygon points="214,164 470,164 330,456 214,456" fill="#ffffff" opacity="0.025"/>
</g>
<rect x="214" y="164" width="512" height="292" rx="8" fill="none" stroke="#0f1827" strokeWidth="1.5"/>
</g>

{/* Laptop base */}
<g transform="translate(0 30)">
<rect x="370" y="486" width="40" height="4" rx="2" fill="#10171f"/>
<rect x="870" y="486" width="40" height="4" rx="2" fill="#10171f"/>
<path d="M340 470 H940 V480 Q940 486 934 486 H346 Q340 486 340 480 Z" fill="url(#rnf-base)" stroke="#34435c" strokeWidth="1.5"/>
<rect x="344" y="471" width="592" height="1.5" rx="0.75" fill="#ffffff" opacity="0.09"/>
<path d="M600 470 H680 V472 Q680 478 674 478 H606 Q600 478 600 472 Z" fill="#101826"/>
<circle className="rnf-led" cx="900" cy="478" r="2.5" fill="var(--primary)"/>
</g>

{/* Mug */}
<g transform="translate(0 30)">
<path className="rnf-steam" d="M1022 438 q-6 -9 0 -18 q6 -9 0 -18" fill="none" stroke="color-mix(in oklab, var(--foreground) 45%, var(--background))" strokeWidth="2" strokeLinecap="round"/>
<path className="rnf-steam2" d="M1044 438 q-6 -9 0 -18 q6 -9 0 -18" fill="none" stroke="color-mix(in oklab, var(--foreground) 45%, var(--background))" strokeWidth="2" strokeLinecap="round"/>
<path d="M1054 458 H1062 Q1072 458 1072 468 Q1072 478 1062 478 H1054" fill="none" stroke="#2a3a55" strokeWidth="5" strokeLinecap="round"/>
<rect x="1010" y="446" width="44" height="44" rx="7" fill="#2a3a55" stroke="#3a4d6c" strokeWidth="1.5"/>
<rect x="1014" y="449" width="5" height="38" rx="2.5" fill="#ffffff" opacity="0.08"/>
</g>
    </svg>
  );
}
