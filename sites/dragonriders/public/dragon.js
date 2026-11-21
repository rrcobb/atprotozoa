// The bonus final slide: the bot, drawn as a little dragon. Pure SVG, 16:9.
export const dragonSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="A cute small orange dragon with little wings, sitting beside a stack of slides">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1d3a"/><stop offset="1" stop-color="#7a3f4a"/></linearGradient>
  <linearGradient id="belly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a8"/><stop offset="1" stop-color="#ffc56b"/></linearGradient>
</defs>
<rect width="1280" height="720" fill="url(#sky)"/>
<g fill="#fff" opacity=".8"><circle cx="90" cy="80" r="2"/><circle cx="240" cy="140" r="3"/><circle cx="420" cy="60" r="2"/><circle cx="1100" cy="90" r="3"/><circle cx="980" cy="170" r="2"/><circle cx="1210" cy="230" r="2"/><circle cx="640" cy="40" r="2"/></g>
<circle cx="1120" cy="130" r="48" fill="#ffe9c4"/><circle cx="1138" cy="118" r="44" fill="#2b1d3a" opacity=".0"/>
<path d="M0 640 Q320 560 640 620 T1280 600 V720 H0Z" fill="#3a2430"/>
<!-- tail -->
<path d="M720 520 Q900 600 960 500 Q1000 440 1060 470 Q1020 420 960 430 Q880 460 820 470Z" fill="#f2792f"/>
<path d="M1040 462 l50 -22 l-8 38z" fill="#c24a1a"/>
<!-- wings -->
<path d="M560 330 Q470 190 330 170 Q380 250 360 300 Q420 290 440 340 Q500 320 520 380Z" fill="#c24a1a"/>
<path d="M700 330 Q790 190 930 170 Q880 250 900 300 Q840 290 820 340 Q760 320 740 380Z" fill="#c24a1a"/>
<!-- body -->
<ellipse cx="640" cy="480" rx="170" ry="150" fill="#f2792f"/>
<ellipse cx="640" cy="510" rx="110" ry="115" fill="url(#belly)"/>
<g stroke="#f2b36b" stroke-width="5" opacity=".7" fill="none"><path d="M560 470h160"/><path d="M552 510h176"/><path d="M560 550h160"/></g>
<!-- feet -->
<ellipse cx="560" cy="628" rx="42" ry="22" fill="#f2792f"/><ellipse cx="720" cy="628" rx="42" ry="22" fill="#f2792f"/>
<g fill="#ffe3a8"><circle cx="540" cy="636" r="6"/><circle cx="560" cy="640" r="6"/><circle cx="580" cy="636" r="6"/><circle cx="700" cy="636" r="6"/><circle cx="720" cy="640" r="6"/><circle cx="740" cy="636" r="6"/></g>
<!-- arms holding a tiny slide -->
<ellipse cx="500" cy="470" rx="30" ry="20" fill="#f2792f" transform="rotate(-25 500 470)"/><ellipse cx="780" cy="470" rx="30" ry="20" fill="#f2792f" transform="rotate(25 780 470)"/>
<!-- head -->
<ellipse cx="640" cy="270" rx="150" ry="125" fill="#f2792f"/>
<!-- horns + spikes -->
<path d="M540 170 L505 80 L590 140Z" fill="#ffe3a8"/><path d="M740 170 L775 80 L690 140Z" fill="#ffe3a8"/>
<path d="M610 150 l30 -42 l30 42z" fill="#c24a1a"/>
<!-- snout -->
<ellipse cx="640" cy="320" rx="86" ry="58" fill="#ff9b4a"/>
<ellipse cx="610" cy="312" rx="8" ry="11" fill="#7a2a10"/><ellipse cx="670" cy="312" rx="8" ry="11" fill="#7a2a10"/>
<path d="M595 350 Q640 385 685 350" fill="none" stroke="#7a2a10" stroke-width="6" stroke-linecap="round"/>
<!-- eyes -->
<ellipse cx="570" cy="245" rx="30" ry="36" fill="#fff"/><ellipse cx="710" cy="245" rx="30" ry="36" fill="#fff"/>
<circle cx="576" cy="252" r="20" fill="#2b1d3a"/><circle cx="704" cy="252" r="20" fill="#2b1d3a"/>
<circle cx="584" cy="243" r="7" fill="#fff"/><circle cx="712" cy="243" r="7" fill="#fff"/>
<!-- cheeks -->
<ellipse cx="520" cy="320" rx="22" ry="13" fill="#ff6f6f" opacity=".55"/><ellipse cx="760" cy="320" rx="22" ry="13" fill="#ff6f6f" opacity=".55"/>
<!-- tiny flame -->
<path d="M640 392 q-14 -22 0 -44 q14 22 0 44z" fill="#ffd34a" opacity="0"/>
<!-- text -->
<g font-family="system-ui,sans-serif" fill="#fff3e0">
<text x="70" y="140" font-size="26" opacity=".7">bonus slide</text>
<text x="70" y="215" font-size="62" font-weight="700">hi, i'm @buildthis</text>
<text x="70" y="270" font-size="28" opacity=".9">a small dragon who builds</text>
<text x="70" y="308" font-size="28" opacity=".9">little websites when tagged.</text>
<text x="70" y="400" font-size="24" opacity=".75">not a rider. a pet.</text>
<text x="70" y="436" font-size="24" opacity=".75">the riders are in the other slides.</text>
</g>
</svg>`;
