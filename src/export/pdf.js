import { jsPDF } from 'jspdf';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { autoTable } from 'jspdf-autotable';
import logoUrl from '../assets/sgum-logo.png';
import { examText, fmtDate } from '../utils.js';
import { supBlockLines } from './docx.js';

const RED = [255, 0, 0];
const GREY = [217, 217, 217];
const MARGIN = 25; // mm, wie Vorlage (1417 twips)

let logoCache;
async function loadLogo() {
  if (logoCache) return logoCache;
  const blob = await (await fetch(logoUrl)).blob();
  logoCache = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
  return logoCache;
}

function header(doc, logo) {
  doc.addImage(logo, 'PNG', MARGIN, 10, 52, 18.5);
}

function footer(doc) {
  const h = doc.internal.pageSize.getHeight();
  const y = h - 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...RED);
  doc.text('SGUM SSUM', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  const parts = [
    ['Bahnhofstrasse 7b ', 0],
    ['I ', 1],
    ['6210 Sursee ', 0],
    ['T ', 1],
    ['+41 926 07 88 ', 0],
    ['E ', 1],
    ['sgum@sgum.ch ', 0],
    ['W ', 1],
    ['www.sgum.ch', 0],
  ];
  let x = MARGIN;
  for (const [t, red] of parts) {
    doc.setTextColor(...(red ? RED : [0, 0, 0]));
    doc.text(t, x, y + 3.5);
    x += doc.getTextWidth(t);
  }
  doc.setTextColor(0, 0, 0);
}

export async function buildPdf({ log, entries, settings, confirm, signDate, collective, sigs = {} }) {
  const supSig = log === 'sup' ? sigs.supervisor : null;
  const appSig = sigs.applicant;
  // Signaturfelder fuer Adobe Acrobat & Co. (nur wo keine gezeichnete Unterschrift steht)
  const fields = [];
  const addField = (name, x, y, w, h) => fields.push({ name, page: doc.getCurrentPageInfo().pageNumber, x, y, w, h });
  // Ein Ankreuzfeld mit vielen Widgets: ein Klick setzt das Kreuz in allen Zeilen
  const boxes = [];
  const texts = [];
  const addText = (name, x, y, w, h) => texts.push({ name, page: doc.getCurrentPageInfo().pageNumber, x, y, w, h });
  const addBox = (x, y, size) => boxes.push({ page: doc.getCurrentPageInfo().pageNumber, x, y, w: size, h: size });
  const fit = (sig, maxH, maxW) => {
    const h = Math.min(maxH, (maxW * sig.h) / sig.w);
    return [(h * sig.w) / sig.h, h];
  };
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadLogo();
  const W = doc.internal.pageSize.getWidth();
  const usable = W - 2 * MARGIN;

  header(doc, logo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Logbuch Fähigkeitsausweis POCUS', W / 2, 41, { align: 'center' });
  doc.setFontSize(16);
  doc.text(log === 'sup' ? 'Supervidierte Untersuchungen' : 'Eigenständige Untersuchungen', W / 2, 49, {
    align: 'center',
  });
  doc.setFontSize(10);
  const k = 'Komponente: ';
  const kw = doc.getTextWidth(k);
  doc.setFont('helvetica', 'normal');
  const vw = doc.getTextWidth(settings.komponente);
  const kx = W / 2 - (kw + vw) / 2;
  doc.setFont('helvetica', 'bold');
  doc.text(k, kx, 58);
  doc.setFont('helvetica', 'normal');
  doc.text(settings.komponente, kx + kw, 58);

  const tw = (tw) => (tw / 1417) * 25; // twips -> mm
  let head, body, columnStyles;
  if (log === 'sup') {
    head = [
      [
        { content: 'Nr.', rowSpan: 2 },
        { content: 'Datum', rowSpan: 2 },
        { content: 'Untersuchung', rowSpan: 2 },
        { content: 'Hauptbefund / Intervention', rowSpan: 2 },
        { content: 'Supervisor / Tutor / Kursleiter', colSpan: 2 },
      ],
      ['Name (Blockschrift)', 'Unterschrift'],
    ];
    body = entries.map((e) => [e.nr, fmtDate(e.date), examText(e), e.befund || '', e.supervisorName || '', '']);
    const ws = [562, 1304, 2211, 2211, 1587, 1588].map(tw);
    columnStyles = Object.fromEntries(ws.map((w, i) => [i, { cellWidth: (w / ws.reduce((a, b) => a + b)) * usable }]));
  } else {
    head = [['Nr.', 'Datum', 'Untersuchung', 'Hauptbefund / Intervention']];
    body = entries.map((e) => [e.nr, fmtDate(e.date), examText(e), e.befund || '']);
    const ws = [562, 1304, 3402, 3402].map(tw);
    columnStyles = Object.fromEntries(ws.map((w, i) => [i, { cellWidth: (w / ws.reduce((a, b) => a + b)) * usable }]));
  }

  autoTable(doc, {
    head,
    body,
    startY: 64,
    margin: { left: MARGIN, right: MARGIN, top: 34, bottom: 24 },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: 0,
      lineColor: 0,
      lineWidth: 0.2,
      cellPadding: 1.4,
      valign: 'top',
      minCellHeight: log === 'sup' ? 10 : 7,
    },
    headStyles: { fillColor: GREY, textColor: 0, fontStyle: 'bold', fontSize: 9, minCellHeight: 6 },
    columnStyles,
    didDrawPage: () => {
      header(doc, logo);
    },
    didDrawCell: (d) => {
      if (supSig && !collective && d.section === 'body' && d.column.index === 5) {
        const [w, h] = fit(supSig, d.cell.height - 2, d.cell.width - 2);
        doc.addImage(supSig.dataUrl, 'PNG', d.cell.x + 1, d.cell.y + (d.cell.height - h) / 2, w, h);
      } else if (log === 'sup' && collective && d.section === 'body' && d.column.index === 5) {
        addBox(d.cell.x + 2, d.cell.y + 2, 4.5);
      }
      if (log === 'sup' && !collective && !supSig && d.section === 'body' && d.column.index === 5) {
        addField(`Unterschrift_Supervisor_Nr_${d.row.raw[0]}`, d.cell.x + 0.5, d.cell.y + 0.5, d.cell.width - 1, d.cell.height - 1);
      }
    },
  });

  let y = doc.lastAutoTable.finalY + 12;
  const H = doc.internal.pageSize.getHeight();
  const lx = MARGIN + 40;

  // Sammelbestaetigung Supervisor
  if (log === 'sup' && collective) {
    const b = supBlockLines(entries);
    if (y + 42 > H - 24) {
      doc.addPage();
      header(doc, logo);
      y = 40;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(b.title, MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(b.text, usable - 8);
    addBox(MARGIN, y - 3.6, 4.5);
    doc.text(lines, MARGIN + 8, y);
    y += lines.length * 5 + 5;
    doc.text('Name:', MARGIN, y);
    doc.text(b.name, lx, y);
    y += 9;
    doc.text('Datum:', MARGIN, y);
    doc.text(supSig && sigs.supervisorDate ? fmtDate(sigs.supervisorDate) : '________________________________', lx, y);
    if (!supSig) addText('Datum_Supervisor', lx, y - 5, 60, 6);
    y += 9;
    doc.text('Unterschrift:', MARGIN, y);
    if (supSig) {
      const [w, h] = fit(supSig, 14, 60);
      doc.addImage(supSig.dataUrl, 'PNG', lx, y - h + 2, w, h);
    } else {
      doc.text('________________________________', lx, y);
      addField('Unterschrift_Supervisor', lx, y - 7, 70, 8.5);
    }
    y += 16;
  }

  // Antragsteller-Block
  if (y + 50 > H - 24) {
    doc.addPage();
    header(doc, logo);
    y = 40;
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Antragsteller (bitte mit PC ausfüllen):', MARGIN, y);
  y += 6;
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y - 3, 3.2, 3.2);
  if (confirm) {
    doc.line(MARGIN, y - 3, MARGIN + 3.2, y + 0.2);
    doc.line(MARGIN + 3.2, y - 3, MARGIN, y + 0.2);
  }
  doc.setFont('helvetica', 'normal');
  doc.text('Hiermit bestätige ich, dass das Logbuch den Lernzielen der jeweiligen Komponente entspricht', MARGIN + 6, y, {
    maxWidth: usable - 6,
  });
  y += 12;
  for (const [l, v] of [
    ['Name:', settings.name],
    ['Vorname:', settings.vorname],
    ['Datum:', fmtDate(signDate)],
  ]) {
    doc.text(l, MARGIN, y);
    doc.text(v || '', lx, y);
    y += 5;
  }
  y += 7;
  doc.text('Unterschrift Antragsteller:', MARGIN, y);
  if (appSig) {
    const [w, h] = fit(appSig, 14, 60);
    doc.addImage(appSig.dataUrl, 'PNG', lx + 10, y - h + 2, w, h);
  } else {
    doc.text('________________________________', lx + 10, y);
    addField('Unterschrift_Antragsteller', lx + 10, y - 7, 70, 8.5);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    footer(doc);
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`Seite ${i} / ${pages}`, W - MARGIN, H - 10.5, { align: 'right' });
    doc.setTextColor(0);
  }
  if (!fields.length && !boxes.length) return doc.output('blob');
  return addFormFields(doc.output('arraybuffer'), fields, boxes, texts, !!supSig);
}

const MM = 72 / 25.4;

/**
 * Fuegt Formularfelder ein:
 * - leere PDF-Signaturfelder (/FT /Sig), z.B. in Adobe Acrobat mit digitaler ID signierbar
 * - ein Ankreuzfeld "Bestaetigung_Supervisor" mit Widgets in jeder Zeile und im Bestaetigungsblock
 */
async function addFormFields(bytes, fields, boxes, texts, checked) {
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const ctx = pdf.context;
  const pages = pdf.getPages();
  const rect = (page, f) => {
    const ph = page.getHeight();
    return { x: f.x * MM, y: ph - (f.y + f.h) * MM, width: f.w * MM, height: f.h * MM };
  };

  if (boxes.length) {
    const cb = form.createCheckBox('Bestaetigung_Supervisor');
    for (const b of boxes) {
      cb.addToPage(pages[b.page - 1], { ...rect(pages[b.page - 1], b), borderWidth: 0.8 });
    }
    if (checked) cb.check();
  }

  for (const t of texts) {
    const tf = form.createTextField(t.name);
    tf.addToPage(pages[t.page - 1], { ...rect(pages[t.page - 1], t), borderWidth: 0 });
    tf.setFontSize(10);
  }

  for (const f of fields) {
    const page = pages[f.page - 1];
    const r = rect(page, f);
    const widget = ctx.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: PDFString.of(f.name),
      Rect: [r.x, r.y, r.x + r.width, r.y + r.height],
      F: 4,
      P: page.ref,
      MK: { BC: [0.6, 0.6, 0.6] },
      BS: { W: 0.5, S: 'D' },
    });
    const ref = ctx.register(widget);
    form.acroForm.addField(ref);
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (annots) annots.push(ref);
    else page.node.set(PDFName.of('Annots'), ctx.obj([ref]));
  }
  const out = await pdf.save({ useObjectStreams: false });
  return new Blob([out], { type: 'application/pdf' });
}
