// Komponente 1 Basis-Notfall-Sonographie, Lernziele gemaess SIWF Anhang 2, Kap. 1.4
export const EXAM_TYPES = [
  { id: 'fluessigkeit', label: 'Freie Flüssigkeit Abdomen' },
  { id: 'pleura', label: 'Pleuraerguss' },
  { id: 'perikard', label: 'Perikarderguss' },
  { id: 'ptx', label: 'Pneumothorax' },
  { id: 'aaa', label: 'Aorta abdominalis / AAA' },
  { id: 'galle', label: 'Gallenblase (Cholezystolithiasis / Cholezystitis)' },
  { id: 'niere', label: 'Nierenstauung' },
  { id: 'blase', label: 'Blasenfüllungszustand' },
  { id: 'tvt', label: 'TVT 2-Punkt-Kompression' },
  { id: 'abszess', label: 'Weichteilabszess' },
  { id: 'rippe', label: 'Rippenfraktur' },
  { id: 'punktion', label: 'US-gesteuerte Punktion (Aszites, Pleura, pvZ)' },
];

export const TYPE_LABEL = Object.fromEntries(EXAM_TYPES.map((t) => [t.id, t.label]));

export const LOGS = {
  eigen: { id: 'eigen', label: 'Eigenständig', title: 'Eigenständige Untersuchungen' },
  sup: { id: 'sup', label: 'Supervidiert', title: 'Supervidierte Untersuchungen' },
};

export const KOMPONENTEN = [
  '1 Basis-Notfall-Sonographie',
  '2 Fokussierte Sonographie am Bewegungsapparat',
  '3 Fokussierte Sonographie arterielle Gefässe',
  '4 Fokussierte Sonographie venöser Gefässe',
  '5 Gefässpunktionen',
  '6 Interventionelle Schmerztherapie',
  '7 IPS für Kinder ab 5. Lebenswoche',
  '8 Neuro-Critical Care',
  '9 Pädiatrie Praxis / Notfallstation / Ambulatorium',
  '10 Regionalanästhesie und Gefässpunktionen',
  '11 Fokussierte Thoraxsonographie',
  '12 Fokussierte transösophageale kardiale Sonographie TEE',
  '13 Fokussierte transthorakale kardiale Sonographie TTE',
  '14 Fokussierte transthorakale kardiale Sonographie (Kinder ab 5. Lebenswoche)',
  '15 Präklinische Notfallsonografie',
];

// Ziel je Logbuch (eigene Vorgabe, parallel sammelbar)
export const DEFAULT_SETTINGS = {
  name: '',
  vorname: '',
  komponente: KOMPONENTEN[0],
  totalTarget: { eigen: 100, sup: 100 },
  // Richtwert pro Untersuchungstyp und Logbuch. Das SIWF gibt keine Mindestzahl pro Typ vor.
  typeTargets: Object.fromEntries(EXAM_TYPES.map((t) => [t.id, 8])),
};

export const BEFUND_QUICK = ['Normalbefund', 'Kein Nachweis', 'Nachweis', 'Fragliche Beurteilbarkeit'];
