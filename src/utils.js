import { TYPE_LABEL } from './constants.js';

export const todayIso = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

export const examText = (e) => {
  const parts = (e.types || []).map((t) => TYPE_LABEL[t] || t);
  if (e.extra) parts.push(e.extra);
  return parts.join(', ');
};

// Chronologisch sortieren und laufende Nummer pro Logbuch vergeben
export const numbered = (entries, log) =>
  entries
    .filter((e) => e.log === log)
    .sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1))
    .map((e, i) => ({ ...e, nr: i + 1 }));

export const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
