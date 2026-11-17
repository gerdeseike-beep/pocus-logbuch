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
const FONT = '<w:rFonts w:ascii="HelveticaNeueLT Pro 45 Lt" w:hAnsi="HelveticaNeueLT Pro 45 Lt" w:cstheme="minorBidi"/>';
const para = (text, { bold = false, after = 40, tabs = false } = {}) =>
  `<w:p><w:pPr>${tabs ? '<w:tabs><w:tab w:val="left" w:pos="2268"/></w:tabs>' : ''}<w:spacing w:before="0" w:after="${after}" w:line="276" w:lineRule="auto"/></w:pPr>` +
  String(text)
    .split('\t')
    .map((t, i) => `${i ? `<w:r><w:rPr>${FONT}<w:sz w:val="20"/></w:rPr><w:tab/></w:r>` : ''}<w:r><w:rPr>${FONT}${bold ? '<w:b/>' : ''}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`)
    .join('') +
  '</w:p>';

export function supBlockLines(entries) {
  const name = entries[0]?.supervisorName || '';
  return {
    title: 'Sammelbestätigung Supervisor / Tutor / Kursleiter:',
    text: `Hiermit bestätige ich, dass die oben aufgeführten ${entries.length} Untersuchungen (Nr. ${nrRanges(entries.map((e) => e.nr))}) unter meiner Supervision durchgeführt wurden.`,
    name,
  };
}

export function nrRanges(nrs) {
  const out = [];
  let start = nrs[0];
  let prev = nrs[0];
  for (const n of [...nrs.slice(1), null]) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    out.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = n;
  }
  return out.join(', ');
}

export async function buildDocx({ log, entries, settings, confirm, signDate, collective }) {
  const file = log === 'sup' ? 'supervidiert.docx' : 'eigenstaendig.docx';
  const res = await fetch(`/templates/${file}`);
  if (!res.ok) throw new Error('Vorlage nicht gefunden');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');

  const rowTpl = rowTemplates[log === 'sup' ? 'sup' : 'eigen'];
  const rows = entries
    .map((e) => {
      const cells = [e.nr, fmtDate(e.date), examText(e), e.befund];
      if (log === 'sup') cells.push(e.supervisorName || '', collective ? 's. unten' : '');
      return fill(rowTpl, Object.fromEntries(cells.map((c, i) => [`C${i}`, esc(c)])));
    })
    .join('');

  let supBlock = '';
  if (log === 'sup' && collective) {
    const b = supBlockLines(entries);
    supBlock =
      para('', { after: 120 }) +
      para(b.title, { bold: true, after: 20 }) +
      para(b.text, { after: 160 }) +
      para(`Name:\t${b.name}`, { tabs: true }) +
      para('Datum:\t________________________________', { tabs: true, after: 200 }) +
      para('Unterschrift:\t________________________________', { tabs: true, after: 120 });
  }

  const out = fill(xml, {
    ROWS: rows,
    SUPBLOCK: supBlock,
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
