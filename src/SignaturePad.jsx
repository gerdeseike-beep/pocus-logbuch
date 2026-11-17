import { useEffect, useRef, useState } from 'react';

/** Unterschriftenfeld (Finger, Stift oder Maus). Liefert ein zugeschnittenes PNG als Data-URL. */
export default function SignaturePad({ title, subtitle, onSave, onCancel }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a2a6b';
  }, []);

  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.preventDefault();
    canvas.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setEmpty(false);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => (drawing.current = false);

  const clear = () => {
    const c = canvas.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  const save = () => {
    const c = canvas.current;
    const ctx = c.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 <= x0) return;
    const pad = 6;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad);
    y1 = Math.min(height - 1, y1 + pad);
    const out = document.createElement('canvas');
    // auf max. 600 px Breite verkleinern, damit die Datei klein bleibt
    const scale = Math.min(1, 600 / (x1 - x0));
    out.width = Math.round((x1 - x0) * scale);
    out.height = Math.round((y1 - y0) * scale);
    out.getContext('2d').drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
    onSave({ dataUrl: out.toDataURL('image/png'), w: out.width, h: out.height });
  };

  return (
    <div className="modal" onClick={onCancel}>
      <div className="card stack sigbox" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2>{title}</h2>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        <canvas
          ref={canvas}
          className="sigpad"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="row between">
          <button className="btn ghost" onClick={clear}>Löschen</button>
          <div className="row">
            <button className="btn ghost" onClick={onCancel}>Abbrechen</button>
            <button className="btn primary" disabled={empty} onClick={save}>Übernehmen</button>
          </div>
        </div>
      </div>
    </div>
  );
}
