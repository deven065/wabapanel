// Website templates/themes. Content stays the same (SiteContent); only the look changes.
// Each theme remaps the site's primary (violet) and secondary (purple/fuchsia) palettes,
// font and corner radius. CSS is generated server-side and injected on public pages.

const P = {
  violet:  { 50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95' },
  purple:  { 50:'#faf5ff',100:'#f3e8ff',200:'#e9d5ff',300:'#d8b4fe',400:'#c084fc',500:'#a855f7',600:'#9333ea',700:'#7e22ce',800:'#6b21a8',900:'#581c87' },
  fuchsia: { 50:'#fdf4ff',100:'#fae8ff',200:'#f5d0fe',300:'#f0abfc',400:'#e879f9',500:'#d946ef',600:'#c026d3',700:'#a21caf',800:'#86198f',900:'#701a75' },
  emerald: { 50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b' },
  teal:    { 50:'#f0fdfa',100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a' },
  blue:    { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' },
  sky:     { 50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e' },
  indigo:  { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81' },
  rose:    { 50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337' },
  pink:    { 50:'#fdf2f8',100:'#fce7f3',200:'#fbcfe8',300:'#f9a8d4',400:'#f472b6',500:'#ec4899',600:'#db2777',700:'#be185d',800:'#9d174d',900:'#831843' },
  orange:  { 50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12' },
  amber:   { 50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f' },
  red:     { 50:'#fef2f2',100:'#fee2e2',200:'#fecaca',300:'#fca5a5',400:'#f87171',500:'#ef4444',600:'#dc2626',700:'#b91c1c',800:'#991b1b',900:'#7f1d1d' },
  cyan:    { 50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63' },
  lime:    { 50:'#f7fee7',100:'#ecfccb',200:'#d9f99d',300:'#bef264',400:'#a3e635',500:'#84cc16',600:'#65a30d',700:'#4d7c0f',800:'#3f6212',900:'#365314' },
  slate:   { 50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a' },
  gray900: { 50:'#fafafa',100:'#f4f4f5',200:'#e4e4e7',300:'#d4d4d8',400:'#a1a1aa',500:'#71717a',600:'#27272a',700:'#18181b',800:'#111113',900:'#09090b' },
  green:   { 50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d',800:'#166534',900:'#14532d' },
  yellow:  { 50:'#fefce8',100:'#fef9c3',200:'#fef08a',300:'#fde047',400:'#facc15',500:'#eab308',600:'#ca8a04',700:'#a16207',800:'#854d0e',900:'#713f12' },
  stone:   { 50:'#fafaf9',100:'#f5f5f4',200:'#e7e5e4',300:'#d6d3d1',400:'#a8a29e',500:'#78716c',600:'#57534e',700:'#44403c',800:'#292524',900:'#1c1917' },
  zinc:    { 50:'#fafafa',100:'#f4f4f5',200:'#e4e4e7',300:'#d4d4d8',400:'#a1a1aa',500:'#71717a',600:'#52525b',700:'#3f3f46',800:'#27272a',900:'#18181b' },
  neutral: { 50:'#fafafa',100:'#f5f5f5',200:'#e5e5e5',300:'#d4d4d4',400:'#a3a3a3',500:'#737373',600:'#525252',700:'#404040',800:'#262626',900:'#171717' },
};

// layout: nav = floating | solid | dark; hero = centered | split | dark | minimal; features = grid | list
const THEMES = [
  { id: 'royal-violet',   name: 'Royal Violet',   desc: 'Premium purple, floating nav, centered hero', primary: 'violet',  secondary: 'purple',  font: 'Inter',            radius: '',      layout: { nav: 'floating', hero: 'centered', features: 'grid' } },
  { id: 'emerald-fresh',  name: 'Emerald Fresh',  desc: 'Fresh green, split hero with side image',     primary: 'emerald', secondary: 'teal',    font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'split', features: 'grid' } },
  { id: 'ocean-blue',     name: 'Ocean Blue',     desc: 'Corporate blue, solid nav, list features',    primary: 'blue',    secondary: 'sky',     font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'centered', features: 'list' } },
  { id: 'indigo-night',   name: 'Indigo Night',   desc: 'Dark hero, deep indigo, modern SaaS',         primary: 'indigo',  secondary: 'blue',    font: 'Plus Jakarta Sans',radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'grid' } },
  { id: 'sunset-orange',  name: 'Sunset Orange',  desc: 'Warm orange, split hero, list features',      primary: 'orange',  secondary: 'amber',   font: 'Poppins',          radius: '',      layout: { nav: 'floating', hero: 'split', features: 'list' } },
  { id: 'rose-bloom',     name: 'Rose Bloom',     desc: 'Bold rose, minimal left-aligned hero',        primary: 'rose',    secondary: 'pink',    font: 'Inter',            radius: 'round', layout: { nav: 'floating', hero: 'minimal', features: 'grid' } },
  { id: 'teal-wave',      name: 'Teal Wave',      desc: 'Calm teal, split hero layout',                primary: 'teal',    secondary: 'cyan',    font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'split', features: 'grid' } },
  { id: 'crimson-power',  name: 'Crimson Power',  desc: 'Dark hero, strong red, list features',        primary: 'red',     secondary: 'rose',    font: 'Poppins',          radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'sky-breeze',     name: 'Sky Breeze',     desc: 'Airy sky blue, minimal hero, rounded',        primary: 'sky',     secondary: 'cyan',    font: 'Nunito',           radius: 'round', layout: { nav: 'floating', hero: 'minimal', features: 'grid' } },
  { id: 'golden-amber',   name: 'Golden Amber',   desc: 'Premium gold, serif font, list features',     primary: 'amber',   secondary: 'orange',  font: 'Playfair Display', radius: '',      layout: { nav: 'solid', hero: 'centered', features: 'list' } },
  { id: 'forest-green',   name: 'Forest Green',   desc: 'Deep green, split hero layout',               primary: 'green',   secondary: 'emerald', font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'split', features: 'grid' } },
  { id: 'midnight-slate', name: 'Midnight Slate', desc: 'Dark minimal black, sharp corners',           primary: 'slate',   secondary: 'gray900', font: 'Space Grotesk',    radius: 'sharp', layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'hot-pink',       name: 'Hot Pink',       desc: 'Vibrant pink, split hero, rounded',           primary: 'pink',    secondary: 'fuchsia', font: 'Poppins',          radius: 'round', layout: { nav: 'floating', hero: 'split', features: 'grid' } },
  { id: 'cyber-lime',     name: 'Cyber Lime',     desc: 'Lime energy, minimal hero, sharp corners',    primary: 'lime',    secondary: 'green',   font: 'Space Grotesk',    radius: 'sharp', layout: { nav: 'solid', hero: 'minimal', features: 'list' } },
  { id: 'deep-cyan',      name: 'Deep Cyan',      desc: 'Dark hero, modern tech cyan',                 primary: 'cyan',    secondary: 'sky',     font: 'Plus Jakarta Sans',radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'grid' } },
  // ─── 16-50: Additional templates ───
  { id: 'violet-split',     name: 'Violet Split',     desc: 'Purple split hero, solid nav',           primary: 'violet',  secondary: 'fuchsia', font: 'Poppins',          radius: '',      layout: { nav: 'solid', hero: 'split', features: 'grid' } },
  { id: 'blue-minimal',     name: 'Blue Minimal',     desc: 'Clean blue, minimal hero, rounded',      primary: 'blue',    secondary: 'indigo',  font: 'Nunito',           radius: 'round', layout: { nav: 'floating', hero: 'minimal', features: 'list' } },
  { id: 'emerald-dark',     name: 'Emerald Dark',     desc: 'Dark green, premium dark hero',          primary: 'emerald', secondary: 'green',   font: 'Plus Jakarta Sans',radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'grid' } },
  { id: 'orange-centered',  name: 'Orange Centered',  desc: 'Bold orange, centered hero layout',      primary: 'orange',  secondary: 'amber',   font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'centered', features: 'grid' } },
  { id: 'pink-minimal',     name: 'Pink Minimal',     desc: 'Soft pink, minimal hero, list features', primary: 'pink',    secondary: 'rose',    font: 'Inter',            radius: 'round', layout: { nav: 'floating', hero: 'minimal', features: 'list' } },
  { id: 'teal-dark',        name: 'Teal Dark',        desc: 'Dark teal hero, modern look',            primary: 'teal',    secondary: 'emerald', font: 'Space Grotesk',    radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'indigo-split',     name: 'Indigo Split',     desc: 'Indigo split hero, floating nav',        primary: 'indigo',  secondary: 'violet',  font: 'Inter',            radius: '',      layout: { nav: 'floating', hero: 'split', features: 'list' } },
  { id: 'rose-centered',    name: 'Rose Centered',    desc: 'Rose centered hero, serif font',         primary: 'rose',    secondary: 'pink',    font: 'Playfair Display', radius: '',      layout: { nav: 'solid', hero: 'centered', features: 'grid' } },
  { id: 'cyan-split',       name: 'Cyan Split',       desc: 'Bright cyan split hero, rounded',        primary: 'cyan',    secondary: 'teal',    font: 'Nunito',           radius: 'round', layout: { nav: 'floating', hero: 'split', features: 'grid' } },
  { id: 'amber-dark',       name: 'Amber Dark',       desc: 'Dark gold hero, premium feel',           primary: 'amber',   secondary: 'yellow',  font: 'Playfair Display', radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'green-minimal',    name: 'Green Minimal',    desc: 'Fresh green, minimal left-aligned',      primary: 'green',   secondary: 'lime',    font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'minimal', features: 'grid' } },
  { id: 'sky-centered',     name: 'Sky Centered',     desc: 'Light sky blue, centered hero',          primary: 'sky',     secondary: 'blue',    font: 'Poppins',          radius: '',      layout: { nav: 'floating', hero: 'centered', features: 'list' } },
  { id: 'red-split',        name: 'Red Split',        desc: 'Bold red, split hero layout',            primary: 'red',     secondary: 'orange',  font: 'Poppins',          radius: '',      layout: { nav: 'solid', hero: 'split', features: 'list' } },
  { id: 'lime-dark',        name: 'Lime Dark',        desc: 'Dark hero, neon lime accents',           primary: 'lime',    secondary: 'emerald', font: 'Space Grotesk',    radius: 'sharp', layout: { nav: 'dark', hero: 'dark', features: 'grid' } },
  { id: 'fuchsia-centered', name: 'Fuchsia Centered', desc: 'Vibrant fuchsia, centered hero',         primary: 'fuchsia', secondary: 'purple',  font: 'Poppins',          radius: 'round', layout: { nav: 'floating', hero: 'centered', features: 'grid' } },
  { id: 'slate-minimal',    name: 'Slate Minimal',    desc: 'Clean slate gray, minimal hero',         primary: 'slate',   secondary: 'zinc',    font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'minimal', features: 'list' } },
  { id: 'blue-dark',        name: 'Blue Dark',        desc: 'Dark navy hero, blue accents',           primary: 'blue',    secondary: 'sky',     font: 'Plus Jakarta Sans',radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'orange-dark',      name: 'Orange Dark',      desc: 'Dark hero with warm orange glow',        primary: 'orange',  secondary: 'amber',   font: 'Space Grotesk',    radius: 'sharp', layout: { nav: 'dark', hero: 'dark', features: 'grid' } },
  { id: 'emerald-minimal',  name: 'Emerald Minimal',  desc: 'Minimal emerald, floating nav',          primary: 'emerald', secondary: 'teal',    font: 'Nunito',           radius: 'round', layout: { nav: 'floating', hero: 'minimal', features: 'grid' } },
  { id: 'violet-dark',      name: 'Violet Dark',      desc: 'Dark purple hero, premium SaaS',         primary: 'violet',  secondary: 'indigo',  font: 'Inter',            radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'rose-split',       name: 'Rose Split',       desc: 'Rose split hero, soft rounded',          primary: 'rose',    secondary: 'fuchsia', font: 'Nunito',           radius: 'round', layout: { nav: 'solid', hero: 'split', features: 'list' } },
  { id: 'teal-centered',    name: 'Teal Centered',    desc: 'Teal centered hero, clean look',         primary: 'teal',    secondary: 'cyan',    font: 'Inter',            radius: '',      layout: { nav: 'floating', hero: 'centered', features: 'grid' } },
  { id: 'indigo-minimal',   name: 'Indigo Minimal',   desc: 'Indigo minimal hero, sharp corners',     primary: 'indigo',  secondary: 'blue',    font: 'Space Grotesk',    radius: 'sharp', layout: { nav: 'solid', hero: 'minimal', features: 'list' } },
  { id: 'pink-dark',        name: 'Pink Dark',        desc: 'Dark hero, neon pink glow',              primary: 'pink',    secondary: 'fuchsia', font: 'Poppins',          radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'grid' } },
  { id: 'green-split',      name: 'Green Split',      desc: 'Green split hero, natural look',         primary: 'green',   secondary: 'emerald', font: 'Poppins',          radius: '',      layout: { nav: 'floating', hero: 'split', features: 'list' } },
  { id: 'amber-split',      name: 'Amber Split',      desc: 'Warm amber split hero layout',           primary: 'amber',   secondary: 'orange',  font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'split', features: 'grid' } },
  { id: 'cyan-minimal',     name: 'Cyan Minimal',     desc: 'Cyan minimal hero, sharp edges',         primary: 'cyan',    secondary: 'teal',    font: 'Space Grotesk',    radius: 'sharp', layout: { nav: 'floating', hero: 'minimal', features: 'list' } },
  { id: 'red-centered',     name: 'Red Centered',     desc: 'Bold red centered hero',                 primary: 'red',     secondary: 'rose',    font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'centered', features: 'grid' } },
  { id: 'sky-dark',         name: 'Sky Dark',         desc: 'Dark hero, sky blue accents',            primary: 'sky',     secondary: 'cyan',    font: 'Plus Jakarta Sans',radius: '',      layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'lime-split',       name: 'Lime Split',       desc: 'Fresh lime, split hero layout',          primary: 'lime',    secondary: 'green',   font: 'Poppins',          radius: '',      layout: { nav: 'solid', hero: 'split', features: 'list' } },
  { id: 'stone-minimal',    name: 'Stone Minimal',    desc: 'Warm stone, minimal hero, serif',        primary: 'stone',   secondary: 'neutral', font: 'Playfair Display', radius: '',      layout: { nav: 'floating', hero: 'minimal', features: 'grid' } },
  { id: 'yellow-centered',  name: 'Yellow Centered',  desc: 'Bright yellow, centered hero',           primary: 'yellow',  secondary: 'amber',   font: 'Poppins',          radius: 'round', layout: { nav: 'solid', hero: 'centered', features: 'list' } },
  { id: 'zinc-dark',        name: 'Zinc Dark',        desc: 'Ultra dark zinc, sharp modern',          primary: 'zinc',    secondary: 'slate',   font: 'Space Grotesk',    radius: 'sharp', layout: { nav: 'dark', hero: 'dark', features: 'list' } },
  { id: 'fuchsia-split',    name: 'Fuchsia Split',    desc: 'Fuchsia split hero, floating nav',       primary: 'fuchsia', secondary: 'pink',    font: 'Nunito',           radius: 'round', layout: { nav: 'floating', hero: 'split', features: 'list' } },
  { id: 'blue-split',       name: 'Blue Split',       desc: 'Blue split hero, corporate look',        primary: 'blue',    secondary: 'indigo',  font: 'Inter',            radius: '',      layout: { nav: 'solid', hero: 'split', features: 'grid' } },
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0,2),16)} ${parseInt(h.slice(2,4),16)} ${parseInt(h.slice(4,6),16)}`;
}

// Generate CSS remapping violet/purple/fuchsia utility classes to the theme palettes.
function buildThemeCss(theme) {
  if (theme.id === 'royal-violet') return themeExtrasCss(theme); // default look, only font/radius extras
  const map = { violet: P[theme.primary], purple: P[theme.secondary], fuchsia: P[theme.secondary] };
  const shades = [50,100,200,300,400,500,600,700,800,900];
  const variants = ['', 'hover\\:', 'focus\\:', 'group-hover\\:'];
  const pseudo = { '': '', 'hover\\:': ':hover', 'focus\\:': ':focus', 'group-hover\\:': '' };
  const opacities = [10,20,30,40,50];
  let css = '';
  const S = (sel) => `[data-site-theme] ${sel}`;
  for (const [twName, pal] of Object.entries(map)) {
    for (const sh of shades) {
      const c = pal[sh];
      const rgb = hexToRgb(c);
      for (const v of variants) {
        const ps = pseudo[v];
        const gh = v === 'group-hover\\:' ? (sel) => `.group:hover ${sel}` : (sel) => sel;
        const mk = (prefix, body) => {
          const base = `.${v}${prefix}-${twName}-${sh}`;
          const sel = v === 'group-hover\\:' ? `.group:hover .${v}${prefix}-${twName}-${sh}` : `.${v}${prefix}-${twName}-${sh}${ps}`;
          css += `${S(sel)}{${body}}\n`;
        };
        mk('bg', `background-color:${c} !important;`);
        mk('text', `color:${c} !important;`);
        mk('border', `border-color:${c} !important;`);
        mk('ring', `--tw-ring-color:${c} !important;`);
        mk('from', `--tw-gradient-from:${c} var(--tw-gradient-from-position) !important;--tw-gradient-to:rgb(${rgb} / 0) var(--tw-gradient-to-position) !important;--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to) !important;`);
        mk('via', `--tw-gradient-to:rgb(${rgb} / 0) var(--tw-gradient-to-position) !important;--tw-gradient-stops:var(--tw-gradient-from), ${c} var(--tw-gradient-via-position), var(--tw-gradient-to) !important;`);
        mk('to', `--tw-gradient-to:${c} var(--tw-gradient-to-position) !important;`);
        if (v === '') {
          for (const op of opacities) {
            const oc = `rgb(${rgb} / 0.${op < 10 ? '0' + op : op})`;
            const sel2 = (pfx) => v === '' ? `.${pfx}-${twName}-${sh}\\/${op}` : `.${v}${pfx}-${twName}-${sh}\\/${op}${ps}`;
            css += `${S(sel2('bg'))}{background-color:${oc} !important;}\n`;
            css += `${S(sel2('border'))}{border-color:${oc} !important;}\n`;
            css += `${S(sel2('from'))}{--tw-gradient-from:${oc} var(--tw-gradient-from-position) !important;--tw-gradient-to:rgb(${rgb} / 0) var(--tw-gradient-to-position) !important;--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to) !important;}\n`;
            css += `${S(sel2('via'))}{--tw-gradient-to:rgb(${rgb} / 0) var(--tw-gradient-to-position) !important;--tw-gradient-stops:var(--tw-gradient-from), ${oc} var(--tw-gradient-via-position), var(--tw-gradient-to) !important;}\n`;
            css += `${S(sel2('to'))}{--tw-gradient-to:${oc} var(--tw-gradient-to-position) !important;}\n`;
            css += `${S(sel2('shadow'))}{--tw-shadow-color:${oc} !important;--tw-shadow:var(--tw-shadow-colored) !important;}\n`;
          }
        }
      }
      css += `${S(`.shadow-${twName}-${sh}`)}{--tw-shadow-color:${c} !important;--tw-shadow:var(--tw-shadow-colored) !important;}\n`;
    }
  }
  return css + themeExtrasCss(theme);
}

function themeExtrasCss(theme) {
  let css = '';
  if (theme.font && theme.font !== 'Inter') {
    css += `[data-site-theme], [data-site-theme] body, [data-site-theme] button, [data-site-theme] input, [data-site-theme] textarea { font-family:'${theme.font}', Inter, sans-serif !important; }\n`;
  }
  if (theme.radius === 'sharp') {
    css += `[data-site-theme] .rounded-full:not(img):not(.h-2):not(.w-2){border-radius:0.5rem !important;}\n[data-site-theme] .rounded-3xl{border-radius:0.75rem !important;}\n[data-site-theme] .rounded-2xl{border-radius:0.5rem !important;}\n[data-site-theme] .rounded-xl{border-radius:0.375rem !important;}\n`;
  }
  if (theme.radius === 'round') {
    css += `[data-site-theme] .rounded-xl{border-radius:1rem !important;}\n[data-site-theme] .rounded-2xl{border-radius:1.5rem !important;}\n[data-site-theme] .rounded-lg{border-radius:0.9rem !important;}\n`;
  }
  return css;
}

function getThemeList() {
  return THEMES.map(t => ({
    id: t.id, name: t.name, desc: t.desc, font: t.font, radius: t.radius,
    colors: [P[t.primary][600], P[t.primary][400], P[t.secondary][600], P[t.secondary][300]],
  }));
}

function getThemeById(id) {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

function getThemePayload(id) {
  const t = getThemeById(id);
  return { id: t.id, name: t.name, font: t.font, layout: t.layout, css: buildThemeCss(t) };
}

module.exports = { THEMES, getThemeList, getThemeById, getThemePayload };
