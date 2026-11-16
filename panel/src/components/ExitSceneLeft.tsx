/**
 * Animação de "saiu da reunião": a pessoa desliga a chamada, os participantes esmaecem e aparece o ícone de porta de saída.
 * Só SVG e CSS (classes `.sl-*` no globals.css); a cor de destaque segue a paleta e a mesa segue o tema. Sempre anima (sem tratamento de "reduzir movimento").
 * Decorativa: o texto da página já diz tudo.
 */
export default function ExitSceneLeft({ className }: { className?: string }) {
  return (
    <svg viewBox="80 100 1120 620" role="presentation" aria-hidden="true" className={className} xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sl-bezel" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stopColor="#252f43"/>
<stop offset="1" stopColor="#161d2b"/>
</linearGradient>
<linearGradient id="sl-base" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stopColor="#2c374c"/>
<stop offset="1" stopColor="#1b2333"/>
</linearGradient>
<linearGradient id="sl-deskTop" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" style={{ stopColor: "color-mix(in oklab, var(--foreground) 12%, var(--background))" }}/>
<stop offset="1" style={{ stopColor: "color-mix(in oklab, var(--foreground) 8%, var(--background))" }}/>
</linearGradient>
<linearGradient id="sl-deskFade" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" style={{ stopColor: "var(--background)", stopOpacity: "0.95" }}/>
<stop offset="1" style={{ stopColor: "var(--background)", stopOpacity: "0" }}/>
</linearGradient>
<clipPath id="sl-scr">
<rect x="214" y="164" width="512" height="292" rx="8"/>
</clipPath>
<filter id="sl-blurBig" x="-30%" y="-30%" width="160%" height="160%">
<feGaussianBlur stdDeviation="34"/>
</filter>
<filter id="sl-blurSm" x="-10%" y="-100%" width="120%" height="300%">
<feGaussianBlur stdDeviation="9"/>
</filter>
</defs>

<ellipse cx="640" cy="410" rx="540" ry="280" fill="var(--primary)" opacity="0.09"/>
<circle className="sl-twinkle" cx="150" cy="128" r="4" fill="var(--primary)"/>
<circle className="sl-twinkle2" cx="1110" cy="150" r="5" fill="var(--primary)"/>

{/* Desk */}
<g transform="translate(0 30)">
<rect x="130" y="510" width="1020" height="120" fill="url(#sl-deskFade)"/>
<rect x="100" y="490" width="1080" height="20" rx="10" fill="url(#sl-deskTop)" stroke="color-mix(in oklab, var(--foreground) 22%, var(--background))" strokeWidth="1.5"/>
<rect x="112" y="491.5" width="1056" height="1.5" rx="0.75" fill="#ffffff" opacity="0.07"/>
<ellipse cx="640" cy="492" rx="350" ry="7" fill="#000" opacity="0.55" filter="url(#sl-blurSm)"/>
</g>

{/* Laptop lid + screen */}
<g transform="translate(170 30)">
<rect className="sl-glow" x="214" y="164" width="512" height="292" rx="8" opacity="0.3" filter="url(#sl-blurBig)"/>
<path d="M200 470 V168 Q200 150 218 150 H722 Q740 150 740 168 V470 Z" fill="url(#sl-bezel)" stroke="#2d3b52" strokeWidth="1.5"/>
<path d="M219 151 H721" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.5" fill="none"/>
<circle cx="470" cy="157" r="1.8" fill="#3a4a63"/>
{/* Screen */}
<rect x="214" y="164" width="512" height="292" rx="8" fill="#070d18"/>
<g clipPath="url(#sl-scr)">
<rect x="214" y="164" width="512" height="292" fill="#070d18"/>
<rect x="214" y="164" width="512" height="36" fill="#0b1424"/>
<rect x="214" y="199.5" width="512" height="1" fill="#16233a"/>
<rect x="228" y="177" width="56" height="10" rx="5" fill="#2c3e5c"/>
<rect x="546" y="179" width="28" height="6" rx="3" fill="#22324c"/>
<rect x="586" y="179" width="28" height="6" rx="3" fill="#22324c"/>
<rect x="626" y="179" width="28" height="6" rx="3" fill="#22324c"/>
<rect x="676" y="174" width="36" height="16" rx="8" fill="var(--primary)"/>

<g className="sl-grid"><g className="sl-tile sl-t1"><rect x="234" y="212" width="230" height="90" rx="10" fill="#0d182a" stroke="#1a2a45" strokeWidth="1.5"/><circle cx="349" cy="245" r="11" fill="#4b6fa5"/><path d="M323 287 a26 26 0 0 1 52 0 Z" fill="#4b6fa5"/><rect x="246" y="286" width="42" height="6" rx="3" fill="#22324c"/></g><g className="sl-tile sl-t2"><rect x="476" y="212" width="230" height="90" rx="10" fill="#0d182a" stroke="#1a2a45" strokeWidth="1.5"/><circle cx="591" cy="245" r="11" fill="#5a7fb0"/><path d="M565 287 a26 26 0 0 1 52 0 Z" fill="#5a7fb0"/><rect x="488" y="286" width="42" height="6" rx="3" fill="#22324c"/><rect className="sl-speak" x="476" y="212" width="230" height="90" rx="10" fill="none" stroke="var(--primary)" strokeWidth="2"/></g><g className="sl-tile sl-t3"><rect x="234" y="314" width="230" height="90" rx="10" fill="#0d182a" stroke="#1a2a45" strokeWidth="1.5"/><circle cx="349" cy="347" r="11" fill="#3f6b8f"/><path d="M323 389 a26 26 0 0 1 52 0 Z" fill="#3f6b8f"/><rect x="246" y="388" width="42" height="6" rx="3" fill="#22324c"/></g><g className="sl-tile sl-t4"><rect x="476" y="314" width="230" height="90" rx="10" fill="#0d182a" stroke="#1a2a45" strokeWidth="1.5"/><circle cx="591" cy="347" r="11" fill="#4a5f9a"/><path d="M565 389 a26 26 0 0 1 52 0 Z" fill="#4a5f9a"/><rect x="488" y="388" width="42" height="6" rx="3" fill="#22324c"/></g></g>
<g className="sl-toolbar"><circle cx="434" cy="432" r="13" fill="#16233a" stroke="#22324c" strokeWidth="1.5"/><g transform="translate(434 432)" fill="none" stroke="#cfe0ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="-3" y="-8" width="6" height="11" rx="3"/><path d="M-6.5 -2 v1 a6.5 6.5 0 0 0 13 0 v-1"/><path d="M0 6.5 v3"/></g><circle cx="470" cy="432" r="13" fill="#16233a" stroke="#22324c" strokeWidth="1.5"/><g transform="translate(470 432)" fill="none" stroke="#cfe0ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="-8" y="-5" width="10" height="10" rx="2.5"/><polygon points="4,-2.5 9,-5.5 9,5.5 4,2.5"/></g><circle className="sl-hangring" cx="506" cy="432" r="13" fill="none" stroke="#ff5c5c" strokeWidth="2"/><g className="sl-hang"><circle cx="506" cy="432" r="13" fill="#e5484d"/><g transform="translate(506 432)" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round"><path d="M-7 2 Q0 -5 7 2"/><path d="M-7 2 v3.5"/><path d="M7 2 v3.5"/></g></g></g>
<g className="sl-badge"><circle cx="470" cy="308" r="34" fill="#0f2542" stroke="var(--primary)" strokeWidth="2"/><circle className="sl-ring"  cx="470" cy="308" r="34" fill="none" stroke="var(--primary)" strokeWidth="1.5"/><circle className="sl-ring2"  cx="470" cy="308" r="34" fill="none" stroke="var(--primary)" strokeWidth="1.5"/><rect x="450" y="294" width="18" height="28" rx="2" fill="none" stroke="#cfe0ff" strokeWidth="2.4"/><circle cx="463" cy="308" r="1.4" fill="#cfe0ff"/><g className="sl-arrow"><line x1="458" y1="308" x2="490" y2="308" stroke="#cfe0ff" strokeWidth="2.4" strokeLinecap="round"/><polyline points="482,300 490,308 482,316" fill="none" stroke="#cfe0ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></g></g>
<polygon points="214,164 470,164 330,456 214,456" fill="#ffffff" opacity="0.025"/>
</g>
<rect x="214" y="164" width="512" height="292" rx="8" fill="none" stroke="#0f1827" strokeWidth="1.5"/>
</g>

{/* Laptop base */}
<g transform="translate(0 30)">
<rect x="370" y="486" width="40" height="4" rx="2" fill="#10171f"/>
<rect x="870" y="486" width="40" height="4" rx="2" fill="#10171f"/>
<path d="M340 470 H940 V480 Q940 486 934 486 H346 Q340 486 340 480 Z" fill="url(#sl-base)" stroke="#34435c" strokeWidth="1.5"/>
<rect x="344" y="471" width="592" height="1.5" rx="0.75" fill="#ffffff" opacity="0.09"/>
<path d="M600 470 H680 V472 Q680 478 674 478 H606 Q600 478 600 472 Z" fill="#101826"/>
<circle className="sl-led" cx="900" cy="478" r="2.5" fill="var(--primary)"/>
</g>

{/* Mug */}
<g transform="translate(0 30)">
<path className="sl-steam" d="M1022 438 q-6 -9 0 -18 q6 -9 0 -18" fill="none" stroke="color-mix(in oklab, var(--foreground) 45%, var(--background))" strokeWidth="2" strokeLinecap="round"/>
<path className="sl-steam2" d="M1044 438 q-6 -9 0 -18 q6 -9 0 -18" fill="none" stroke="color-mix(in oklab, var(--foreground) 45%, var(--background))" strokeWidth="2" strokeLinecap="round"/>
<path d="M1054 458 H1062 Q1072 458 1072 468 Q1072 478 1062 478 H1054" fill="none" stroke="#2a3a55" strokeWidth="5" strokeLinecap="round"/>
<rect x="1010" y="446" width="44" height="44" rx="7" fill="#2a3a55" stroke="#3a4d6c" strokeWidth="1.5"/>
<rect x="1014" y="449" width="5" height="38" rx="2.5" fill="#ffffff" opacity="0.08"/>
</g>
    </svg>
  );
}
