// Icon set for the "elenco con icone" block.
//
// Imported by scripts/render.mjs (Node, at build time) and by admin/editor.js
// (browser, in the editor) so the picker can only ever offer icons the site can
// actually render.
//
// All 24x24, stroke-only, 1.7 weight — they inherit currentColor.

const svg = (d) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONS = {
  panel:   svg('<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M3 8.3h18M3 12.7h18M9 4v13M15 4v13M12 17v3M9 20h6"/>'),
  sun:     svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  battery: svg('<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4M8 10l-1.5 4h3L8 18"/>'),
  bolt:    svg('<path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z"/>'),
  fixing:  svg('<path d="M9 3h6v4l-2 2v9l-1 3-1-3V9L9 7z"/><path d="M9 5.5h6M9 7h6"/>'),
  tools:   svg('<path d="M14.7 6.3a4 4 0 0 0 5 5L15 16l-3-3z"/><path d="M12 13l-7 7 2 2 7-7"/>'),
  route:   svg('<path d="M4 20c0-4 3-5 6-5s6-1 6-5"/><circle cx="4" cy="20" r="2"/><circle cx="16" cy="6" r="2"/><path d="M20 10h-2M20 14h-5"/>'),
  shield:  svg('<path d="M12 3l7 3v5.5c0 4.3-2.9 7.8-7 9.5-4.1-1.7-7-5.2-7-9.5V6z"/><path d="M9.2 12l2 2 3.6-3.8"/>'),
  helmet:  svg('<path d="M3 16a9 9 0 0 1 18 0"/><path d="M2 16h20v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><path d="M9 7.5V4h6v3.5"/>'),
  warning: svg('<path d="M10.3 3.9L2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  check:   svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/>'),
  home:    svg('<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.8V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.8"/><path d="M10 21v-6h4v6"/>'),
  roof:    svg('<path d="M2 12L12 4l10 8"/><path d="M4.5 10.5V20h15v-9.5"/><path d="M9 20v-5h6v5"/>'),
  factory: svg('<path d="M3 21V10l5 3V10l5 3V7l6 3v11z"/><path d="M7 21v-3M12 21v-3M17 21v-3"/>'),
  leaf:    svg('<path d="M20 4C10 4 4 9 4 16a5 5 0 0 0 5 5c7 0 11-6 11-17z"/><path d="M9 17c2-4 5-6 8-7"/>'),
  euro:    svg('<circle cx="12" cy="12" r="9"/><path d="M16 8.5A4.5 4.5 0 0 0 9 12a4.5 4.5 0 0 0 7 3.5"/><path d="M7 11h6M7 13.5h6"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  document: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16.5h4"/>'),
};

/** Order shown in the picker, grouped so related icons sit together. */
export const ICON_ORDER = [
  'panel', 'sun', 'battery', 'bolt',
  'roof', 'home', 'factory', 'leaf',
  'fixing', 'tools', 'route', 'document',
  'shield', 'helmet', 'warning', 'check',
  'euro', 'calendar',
];

export const ICON_LABELS = {
  it: { panel: 'Pannello', sun: 'Sole', battery: 'Accumulo', bolt: 'Elettricità',
        roof: 'Copertura', home: 'Abitazione', factory: 'Industriale', leaf: 'Ambiente',
        fixing: 'Fissaggio', tools: 'Manutenzione', route: 'Percorso', document: 'Documento',
        shield: 'Sicurezza', helmet: 'Protezione', warning: 'Attenzione', check: 'Conformità',
        euro: 'Costi', calendar: 'Tempi' },
  en: { panel: 'Panel', sun: 'Sun', battery: 'Storage', bolt: 'Electricity',
        roof: 'Roofing', home: 'Home', factory: 'Industrial', leaf: 'Environment',
        fixing: 'Fixing', tools: 'Maintenance', route: 'Route', document: 'Document',
        shield: 'Safety', helmet: 'Protection', warning: 'Warning', check: 'Compliance',
        euro: 'Cost', calendar: 'Timing' },
};
