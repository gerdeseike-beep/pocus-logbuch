import JSZip from 'jszip';
import rowTemplates from './rowTemplates.json';
import { examText, fmtDate } from '../utils.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fill = (tpl, values) => tpl.replace(/\{\{([A-Z0-9]+)\}\}/g, (_, k) => (k in values ? values[k] : ''));

/**
 * Fuellt die originale SGUM-Vorlage (public/templates) mit den Eintraegen.
 * entries: bereits nummeriert (nr) und gefiltert.
 */
export async function buildDocx({ log, entries, settings, confirm, signDate }) {
  const file = log === 'sup' ? 'supervidiert.docx' : 'eigenstaendig.docx';
  const res = await fetch(`/templates/${file}`);
  if (!res.ok) throw new Error('Vorlage nicht gefunden');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');

  const rowTpl = rowTemplates[log === 'sup' ? 'sup' : 'eigen'];
  const rows = entries
    .map((e) => {
      const cells = [e.nr, fmtDate(e.date), examText(e), e.befund];
      if (log === 'sup') cells.push((e.supervisorName || '').toUpperCase(), '');
      return fill(rowTpl, Object.fromEntries(cells.map((c, i) => [`C${i}`, esc(c)])));
    })
    .join('');

  const out = fill(xml, {
    ROWS: rows,
    KOMPONENTE: esc(settings.komponente),
    CHECK: confirm ? '☒' : '☐',
    CHECKVAL: confirm ? '1' : '0',
    NAME: esc(settings.name),
    VORNAME: esc(settings.vorname),
    DATUM: esc(fmtDate(signDate)),
  });
  zip.file('word/document.xml', out);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
