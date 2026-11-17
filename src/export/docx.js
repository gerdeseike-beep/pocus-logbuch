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

const EMU_PER_MM = 36000;
let drawingId = 1000;
const drawing = (rId, sig, heightMm) => {
  const cy = Math.round(heightMm * EMU_PER_MM);
  const cx = Math.round((cy * sig.w) / sig.h);
  const id = ++drawingId;
  return (
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="Unterschrift ${id}"/>` +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="sig${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'
  );
};
const fitHeight = (sig, maxH, maxW) => Math.min(maxH, (maxW * sig.h) / sig.w);

async function addImage(zip, name, rId, sig) {
  const b64 = sig.dataUrl.split(',')[1];
  zip.file(`word/media/${name}`, b64, { base64: true });
  const relsPath = 'word/_rels/document.xml.rels';
  const rels = await zip.file(relsPath).async('string');
  zip.file(
    relsPath,
    rels.replace(
      '</Relationships>',
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/></Relationships>`,
    ),
  );
}

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

export async function buildDocx({ log, entries, settings, confirm, signDate, collective, sigs = {} }) {
  const file = log === 'sup' ? 'supervidiert.docx' : 'eigenstaendig.docx';
  const res = await fetch(`/templates/${file}`);
  if (!res.ok) throw new Error('Vorlage nicht gefunden');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  let xml = await zip.file('word/document.xml').async('string');
  const supSig = log === 'sup' ? sigs.supervisor : null;
  const appSig = sigs.applicant;
  if (supSig) await addImage(zip, 'sig_supervisor.png', 'rIdSigSup', supSig);
  if (appSig) {
    await addImage(zip, 'sig_applicant.png', 'rIdSigApp', appSig);
    const line = '<w:t>________________________________</w:t></w:r>';
    xml = xml.replace(line, `</w:r><w:r>${drawing('rIdSigApp', appSig, fitHeight(appSig, 14, 60))}</w:r>`);
  }

  const rowTpl = rowTemplates[log === 'sup' ? 'sup' : 'eigen'];
  const rows = entries
    .map((e) => {
      const cells = [e.nr, fmtDate(e.date), examText(e), e.befund];
      if (log === 'sup') cells.push(e.supervisorName || '', collective ? 's. unten' : supSig ? '@@SIG@@' : '');
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
      para(`Datum:\t${supSig && sigs.supervisorDate ? fmtDate(sigs.supervisorDate) : '________________________________'}`, {
        tabs: true,
        after: 200,
      }) +
      (supSig
        ? para('Unterschrift:\t@@SIG@@', { tabs: true, after: 120 })
        : para('Unterschrift:\t________________________________', { tabs: true, after: 120 }));
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
  let final = out;
  if (supSig) {
    const h = collective ? fitHeight(supSig, 14, 60) : fitHeight(supSig, 9, 25);
    final = final.replace(/<w:t xml:space="preserve">@@SIG@@<\/w:t>/g, () => drawing('rIdSigSup', supSig, h));
  }
  zip.file('word/document.xml', final);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
