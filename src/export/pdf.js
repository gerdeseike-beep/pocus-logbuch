import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import logoUrl from '../assets/sgum-logo.png';
import { examText, fmtDate } from '../utils.js';

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

export async function buildPdf({ log, entries, settings, confirm, signDate }) {
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
    body = entries.map((e) => [e.nr, fmtDate(e.date), examText(e), e.befund || '', (e.supervisorName || '').toUpperCase(), '']);
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
  });

  // Antragsteller-Block
  let y = doc.lastAutoTable.finalY + 12;
  const H = doc.internal.pageSize.getHeight();
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
  const lx = MARGIN + 40;
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
  doc.text('________________________________', lx + 10, y);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    footer(doc);
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`Seite ${i} / ${pages}`, W - MARGIN, H - 10.5, { align: 'right' });
    doc.setTextColor(0);
  }
  return doc.output('blob');
}
