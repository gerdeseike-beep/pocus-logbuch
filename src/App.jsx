import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, firebaseConfigured, googleProvider } from './firebase.js';
import { BEFUND_QUICK, DEFAULT_SETTINGS, EXAM_TYPES, KOMPONENTEN, LOGS } from './constants.js';
import { downloadBlob, examText, fmtDate, numbered, slug, todayIso } from './utils.js';

const TABS = [
  { id: 'dashboard', label: 'Übersicht' },
  { id: 'neu', label: 'Erfassen' },
  { id: 'liste', label: 'Einträge' },
  { id: 'export', label: 'Export' },
  { id: 'einstellungen', label: 'Einstellungen' },
];

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (!firebaseConfigured) return <NotConfigured />;
  if (user === undefined) return <div className="center muted">Laden …</div>;
  if (!user) return <Login />;
  return <Main user={user} />;
}

function NotConfigured() {
  return (
    <div className="center card narrow">
      <h1>POCUS Logbuch</h1>
      <p>Firebase ist noch nicht konfiguriert. Bitte die Umgebungsvariablen <code>VITE_FIREBASE_…</code> setzen (siehe README).</p>
    </div>
  );
}

function Login() {
  const [err, setErr] = useState('');
  return (
    <div className="center card narrow">
      <h1>POCUS Logbuch</h1>
      <p className="muted">FA POCUS, Komponente 1 Basis-Notfall-Sonographie</p>
      <button className="btn primary" onClick={() => signInWithPopup(auth, googleProvider).catch((e) => setErr(e.message))}>
        Mit Google anmelden
      </button>
      {import.meta.env.VITE_USE_EMULATOR && (
        <button className="btn ghost" onClick={() => signInAnonymously(auth)}>
          Test-Login (Emulator)
        </button>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function useUserData(uid) {
  const [entries, setEntries] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'users', uid, 'entries'), (s) => {
      setEntries(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoaded(true);
    });
    const u2 = onSnapshot(collection(db, 'users', uid, 'supervisors'), (s) =>
      setSupervisors(
        s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)),
      ),
    );
    const u3 = onSnapshot(doc(db, 'users', uid), (s) => {
      const d = s.data()?.settings || {};
      setSettings({
        ...DEFAULT_SETTINGS,
        ...d,
        totalTarget: { ...DEFAULT_SETTINGS.totalTarget, ...(d.totalTarget || {}) },
      });
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, [uid]);

  const supName = useMemo(() => Object.fromEntries(supervisors.map((s) => [s.id, s.name])), [supervisors]);
  // Aktuellen Supervisor-Namen verwenden (falls spaeter korrigiert)
  const entriesResolved = useMemo(
    () => entries.map((e) => (e.supervisorId && supName[e.supervisorId] ? { ...e, supervisorName: supName[e.supervisorId] } : e)),
    [entries, supName],
  );

  return { entries: entriesResolved, supervisors, settings, loaded };
}

function Main({ user }) {
  const [tab, setTab] = useState('dashboard');
  const [editing, setEditing] = useState(null);
  const data = useUserData(user.uid);
  const ref = {
    entries: collection(db, 'users', user.uid, 'entries'),
    supervisors: collection(db, 'users', user.uid, 'supervisors'),
    user: doc(db, 'users', user.uid),
  };

  const startEdit = (e) => {
    setEditing(e);
    setTab('neu');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo-dot" />
          POCUS Logbuch
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); if (t.id !== 'neu') setEditing(null); }}>
              {t.label}
            </button>
          ))}
        </nav>
        <button className="btn ghost small" onClick={() => signOut(auth)} title={user.email}>
          Abmelden
        </button>
      </header>
      <main>
        {tab === 'dashboard' && <Dashboard {...data} onNew={() => setTab('neu')} />}
        {tab === 'neu' && (
          <EntryForm
            key={editing?.id || 'new'}
            {...data}
            refs={ref}
            editing={editing}
            onDone={() => {
              if (editing) {
                setEditing(null);
                setTab('liste');
              }
            }}
          />
        )}
        {tab === 'liste' && <EntryList {...data} refs={ref} onEdit={startEdit} />}
        {tab === 'export' && <Export {...data} />}
        {tab === 'einstellungen' && <Settings {...data} refs={ref} />}
      </main>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Bar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${value >= max ? 'done' : ''}`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function Dashboard({ entries, settings, loaded, onNew }) {
  const count = (log, type) => entries.filter((e) => e.log === log && (!type || (e.types || []).includes(type))).length;
  const totals = { eigen: count('eigen'), sup: count('sup') };
  const sorted = EXAM_TYPES.map((t) => ({ ...t, eigen: count('eigen', t.id), sup: count('sup', t.id) }));
  const max = Math.max(1, ...sorted.map((t) => t.eigen + t.sup));
  const rare = [...sorted].sort((a, b) => a.eigen + a.sup - (b.eigen + b.sup)).slice(0, 4);
  const untyped = entries.filter((e) => !(e.types || []).length).length;

  if (!loaded) return <p className="muted">Laden …</p>;

  return (
    <div className="stack">
      <div className="grid2">
        {Object.values(LOGS).map((l) => (
          <div className="card" key={l.id}>
            <div className="kpi-label">{l.title}</div>
            <div className="kpi">
              {totals[l.id]} <span className="muted">/ {settings.totalTarget[l.id]}</span>
            </div>
            <Bar value={totals[l.id]} max={settings.totalTarget[l.id]} />
            <div className="muted small">
              {totals[l.id] >= settings.totalTarget[l.id]
                ? 'Ziel erreicht'
                : `Noch ${settings.totalTarget[l.id] - totals[l.id]} offen`}
            </div>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="card hint">
          <strong>Bisher am seltensten:</strong> {rare.map((t) => `${t.label} (${t.eigen + t.sup})`).join(', ')}
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h2>Pro Untersuchungstyp</h2>
          <button className="btn primary small" onClick={onNew}>+ Erfassen</button>
        </div>
        <p className="muted small">
          Eine Untersuchung kann mehrere Typen abdecken und zählt dann bei jedem Typ.
          {untyped > 0 && ` ${untyped} Einträge ohne Typ (z.B. Volumenstatus) zählen nur im Gesamttotal.`}
        </p>
        <table className="types">
          <thead>
            <tr>
              <th>Untersuchung</th>
              <th className="num">Eigenst.</th>
              <th className="num">Superv.</th>
              <th className="num">Total</th>
              <th className="barcol" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td className="num">{t.eigen}</td>
                <td className="num">{t.sup}</td>
                <td className="num"><strong>{t.eigen + t.sup}</strong></td>
                <td className="barcol">
                  <div className="bar neutral"><div style={{ width: `${((t.eigen + t.sup) / max) * 100}%` }} /></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Erfassen ---------------- */

function EntryForm({ supervisors, refs, editing, onDone }) {
  const [log, setLog] = useState(editing?.log || localStorage.getItem('lastLog') || 'eigen');
  const [date, setDate] = useState(editing?.date || todayIso());
  const [types, setTypes] = useState(editing?.types || []);
  const [extra, setExtra] = useState(editing?.extra || '');
  const [befund, setBefund] = useState(editing?.befund || '');
  const [supId, setSupId] = useState(editing?.supervisorId || localStorage.getItem('lastSup') || '');
  const [newSup, setNewSup] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supId && supervisors[0]) setSupId(supervisors[0].id);
  }, [supervisors, supId]);

  const toggle = (id) => setTypes((ts) => (ts.includes(id) ? ts.filter((x) => x !== id) : [...ts, id]));

  const valid = date && (types.length > 0 || extra.trim()) && (log === 'eigen' || supId || newSup.trim());

  const save = async (ev) => {
    ev.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      let supervisorId = null;
      let supervisorName = null;
      if (log === 'sup') {
        if (supId === '__new' || (!supId && newSup.trim())) {
          const r = await addDoc(refs.supervisors, { name: newSup.trim(), createdAt: Date.now(), lastUsed: Date.now() });
          supervisorId = r.id;
          supervisorName = newSup.trim();
          setNewSup('');
          setSupId(r.id);
        } else {
          supervisorId = supId;
          supervisorName = supervisors.find((s) => s.id === supId)?.name || '';
          updateDoc(doc(refs.supervisors, supId), { lastUsed: Date.now() }).catch(() => {});
        }
        localStorage.setItem('lastSup', supervisorId);
      }
      const data = { log, date, types, extra: extra.trim(), befund: befund.trim(), supervisorId, supervisorName };
      if (editing) {
        await updateDoc(doc(refs.entries, editing.id), data);
        setMsg('Geändert.');
      } else {
        await addDoc(refs.entries, { ...data, createdAt: Date.now() });
        setMsg('Gespeichert.');
      }
      localStorage.setItem('lastLog', log);
      setTypes([]);
      setExtra('');
      setBefund('');
      setTimeout(() => setMsg(''), 2500);
      onDone?.();
    } catch (e) {
      setMsg('Fehler: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={save}>
      <h2>{editing ? 'Eintrag bearbeiten' : 'Neue Untersuchung'}</h2>

      <div className="seg">
        {Object.values(LOGS).map((l) => (
          <button type="button" key={l.id} className={log === l.id ? 'active' : ''} onClick={() => setLog(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      <label>
        Datum
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <div>
        <div className="lbl">Untersuchung (mehrere möglich)</div>
        <div className="chips">
          {EXAM_TYPES.map((t) => (
            <button type="button" key={t.id} className={`chip ${types.includes(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <input placeholder="Zusatz (optional), z.B. eFAST, Lunge bds." value={extra} onChange={(e) => setExtra(e.target.value)} />
      </div>

      <label>
        Hauptbefund / Intervention
        <textarea rows={2} value={befund} onChange={(e) => setBefund(e.target.value)} placeholder="z.B. Kein Perikarderguss, kein Pneumothorax" />
      </label>
      <div className="chips small">
        {BEFUND_QUICK.map((b) => (
          <button type="button" key={b} className="chip" onClick={() => setBefund((x) => (x ? `${x}, ${b}` : b))}>
            {b}
          </button>
        ))}
      </div>

      {log === 'sup' && (
        <label>
          Supervisor / Tutor / Kursleiter
          <select value={supervisors.length ? supId : '__new'} onChange={(e) => setSupId(e.target.value)}>
            {supervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new">+ Neuer Supervisor …</option>
          </select>
          {(supId === '__new' || !supervisors.length) && (
            <input autoFocus placeholder="Name, z.B. Dr. med. Muster" value={newSup} onChange={(e) => setNewSup(e.target.value)} />
          )}
        </label>
      )}

      <div className="row">
        <button className="btn primary" disabled={!valid || busy}>
          {editing ? 'Änderung speichern' : 'Speichern'}
        </button>
        {editing && (
          <button type="button" className="btn ghost" onClick={onDone}>
            Abbrechen
          </button>
        )}
        {msg && <span className="ok">{msg}</span>}
      </div>
    </form>
  );
}

/* ---------------- Liste ---------------- */

function EntryList({ entries, supervisors, refs, onEdit }) {
  const [log, setLog] = useState('eigen');
  const [sup, setSup] = useState('');
  const rows = numbered(entries, log)
    .filter((e) => !sup || e.supervisorId === sup)
    .reverse();

  const del = async (e) => {
    if (window.confirm(`Eintrag Nr. ${e.nr} vom ${fmtDate(e.date)} löschen?`)) await deleteDoc(doc(refs.entries, e.id));
  };

  return (
    <div className="card stack">
      <div className="row between wrap">
        <div className="seg">
          {Object.values(LOGS).map((l) => (
            <button key={l.id} className={log === l.id ? 'active' : ''} onClick={() => setLog(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        {log === 'sup' && (
          <select value={sup} onChange={(e) => setSup(e.target.value)}>
            <option value="">Alle Supervisoren</option>
            {supervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="muted">Noch keine Einträge.</p>
      ) : (
        <div className="tablewrap">
          <table className="list">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Datum</th>
                <th>Untersuchung</th>
                <th>Befund</th>
                {log === 'sup' && <th>Supervisor</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{e.nr}</td>
                  <td className="nowrap">{fmtDate(e.date)}</td>
                  <td>{examText(e)}</td>
                  <td>{e.befund}</td>
                  {log === 'sup' && <td>{e.supervisorName}</td>}
                  <td className="nowrap">
                    <button className="icon" title="Bearbeiten" onClick={() => onEdit(e)}>✎</button>
                    <button className="icon" title="Löschen" onClick={() => del(e)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Export ---------------- */

function Export({ entries, supervisors, settings }) {
  const [confirm, setConfirm] = useState(true);
  const [signDate, setSignDate] = useState(todayIso());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const supCounts = Object.fromEntries(
    supervisors.map((s) => [s.id, entries.filter((e) => e.log === 'sup' && e.supervisorId === s.id).length]),
  );

  const run = async (log, format, supervisor) => {
    setErr('');
    let list = numbered(entries, log);
    if (supervisor) list = list.filter((e) => e.supervisorId === supervisor.id);
    if (!list.length) return setErr('Keine Einträge für diese Auswahl.');
    const key = `${log}-${format}-${supervisor?.id || ''}`;
    setBusy(key);
    try {
      const opts = { log, entries: list, settings, confirm, signDate };
      const mod = format === 'pdf' ? await import('./export/pdf.js') : await import('./export/docx.js');
      const blob = format === 'pdf' ? await mod.buildPdf(opts) : await mod.buildDocx(opts);
      const who = [settings.name, settings.vorname].filter(Boolean).join('_');
      const base =
        log === 'sup'
          ? `Logbuch_POCUS_supervidiert_${slug(supervisor.name)}`
          : 'Logbuch_POCUS_eigenstaendig';
      downloadBlob(blob, `${base}${who ? '_' + slug(who) : ''}_${signDate}.${format}`);
    } catch (e) {
      setErr('Export fehlgeschlagen: ' + e.message);
    } finally {
      setBusy('');
    }
  };

  const Buttons = ({ log, supervisor }) => (
    <div className="row">
      {['pdf', 'docx'].map((f) => (
        <button key={f} className="btn small" disabled={!!busy} onClick={() => run(log, f, supervisor)}>
          {busy === `${log}-${f}-${supervisor?.id || ''}` ? '…' : f.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Angaben im Dokument</h2>
        {!settings.name && <p className="error">Name und Vorname fehlen noch (Einstellungen).</p>}
        <div className="muted small">
          {settings.vorname} {settings.name} · Komponente {settings.komponente}
        </div>
        <div className="row wrap">
          <label className="inline">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Bestätigung ankreuzen
          </label>
          <label className="inline">
            Datum <input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <div>
            <h2>Eigenständige Untersuchungen</h2>
            <div className="muted small">{entries.filter((e) => e.log === 'eigen').length} Einträge</div>
          </div>
          <Buttons log="eigen" />
        </div>
      </div>

      <div className="card stack">
        <h2>Supervidierte Untersuchungen</h2>
        <p className="muted small">Ein Dokument pro Supervisor, zur Unterschrift. Die Nummerierung entspricht dem Gesamtlogbuch.</p>
        {supervisors.length === 0 && <p className="muted">Noch keine Supervisoren erfasst.</p>}
        {supervisors.map((s) => (
          <div className="row between sup-row" key={s.id}>
            <div>
              <strong>{s.name}</strong>
              <div className="muted small">{supCounts[s.id]} Untersuchungen</div>
            </div>
            <Buttons log="sup" supervisor={s} />
          </div>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

/* ---------------- Einstellungen ---------------- */

function Settings({ settings, supervisors, entries, refs }) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState('');
  useEffect(() => setS(settings), [settings]);

  const save = async () => {
    await setDoc(refs.user, { settings: s }, { merge: true });
    setSaved('Gespeichert.');
    setTimeout(() => setSaved(''), 2000);
  };

  const rename = async (sup) => {
    const name = window.prompt('Name des Supervisors', sup.name);
    if (name && name.trim()) await updateDoc(doc(refs.supervisors, sup.id), { name: name.trim() });
  };
  const remove = async (sup) => {
    const n = entries.filter((e) => e.supervisorId === sup.id).length;
    if (n) return window.alert(`${sup.name} ist ${n} Einträgen zugeordnet und kann nicht gelöscht werden.`);
    if (window.confirm(`${sup.name} löschen?`)) await deleteDoc(doc(refs.supervisors, sup.id));
  };

  const [importMsg, setImportMsg] = useState('');
  const importFile = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = (data.entries || []).filter((e) => e.date && (e.log === 'eigen' || e.log === 'sup'));
      if (!list.length) return setImportMsg('Keine gültigen Einträge in der Datei.');
      const supByName = Object.fromEntries(supervisors.map((x) => [x.name.trim().toLowerCase(), x.id]));
      const key = (e) => [e.log, e.date, (e.types || []).join(','), e.extra || '', e.befund || ''].join('|');
      // Aeltere Version derselben Importdatei ersetzen
      const keep = new Set(list.map(key));
      const replace = new Set((data.replaceKeys || []).filter((k) => !keep.has(k)));
      const toRemove = entries.filter((e) => replace.has(key(e)));
      let batch = writeBatch(db);
      let ops = 0;
      for (const e of toRemove) {
        batch.delete(doc(refs.entries, e.id));
        if (++ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      const removedIds = new Set(toRemove.map((e) => e.id));
      const existing = new Set(entries.filter((e) => !removedIds.has(e.id)).map(key));
      let added = 0;
      let skipped = 0;
      for (const e of list) {
        if (existing.has(key(e))) {
          skipped++;
          continue;
        }
        let supervisorId = null;
        let supervisorName = null;
        if (e.log === 'sup' && e.supervisorName) {
          supervisorName = e.supervisorName.trim();
          const k = supervisorName.toLowerCase();
          if (!supByName[k]) {
            const r = doc(refs.supervisors);
            batch.set(r, { name: supervisorName, createdAt: Date.now(), lastUsed: Date.now() });
            supByName[k] = r.id;
            ops++;
          }
          supervisorId = supByName[k];
        }
        batch.set(doc(refs.entries), {
          log: e.log,
          date: e.date,
          types: e.types || [],
          extra: e.extra || '',
          befund: e.befund || '',
          supervisorId,
          supervisorName,
          createdAt: e.createdAt || Date.now() + added,
        });
        existing.add(key(e));
        added++;
        if (++ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops) await batch.commit();
      setImportMsg(
        `${added} Einträge importiert` +
          (skipped ? `, ${skipped} bereits vorhanden und übersprungen` : '') +
          (toRemove.length ? `, ${toRemove.length} ältere Importeinträge ersetzt` : '') +
          '.',
      );
    } catch (err) {
      setImportMsg('Import fehlgeschlagen: ' + err.message);
    }
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify({ settings, supervisors, entries }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `pocus-logbuch-backup_${todayIso()}.json`);
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Antragsteller</h2>
        <div className="grid2">
          <label>
            Name
            <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          </label>
          <label>
            Vorname
            <input value={s.vorname} onChange={(e) => setS({ ...s, vorname: e.target.value })} />
          </label>
        </div>
        <label>
          Komponente
          <select value={s.komponente} onChange={(e) => setS({ ...s, komponente: e.target.value })}>
            {KOMPONENTEN.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>

        <h2>Ziele</h2>
        <div className="grid2">
          {Object.values(LOGS).map((l) => (
            <label key={l.id}>
              {l.title}
              <input
                type="number"
                min="0"
                value={s.totalTarget[l.id]}
                onChange={(e) => setS({ ...s, totalTarget: { ...s.totalTarget, [l.id]: Number(e.target.value) } })}
              />
            </label>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" onClick={save}>Speichern</button>
          {saved && <span className="ok">{saved}</span>}
        </div>
      </div>

      <div className="card stack">
        <h2>Supervisoren</h2>
        {supervisors.length === 0 && <p className="muted">Werden beim ersten supervidierten Eintrag angelegt.</p>}
        {supervisors.map((sup) => (
          <div className="row between sup-row" key={sup.id}>
            <span>{sup.name}</span>
            <span>
              <button className="icon" title="Umbenennen" onClick={() => rename(sup)}>✎</button>
              <button className="icon" title="Löschen" onClick={() => remove(sup)}>✕</button>
            </span>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h2>Daten</h2>
        <div className="row between wrap">
          <span className="muted small">Datensicherung aller Einträge als JSON</span>
          <button className="btn small" onClick={backup}>Backup herunterladen</button>
        </div>
        <div className="row between wrap">
          <span className="muted small">Einträge aus JSON-Datei importieren (Backup oder Importdatei). Doppelte werden übersprungen.</span>
          <label className="btn small filebtn">
            Import …
            <input type="file" accept="application/json,.json" onChange={importFile} hidden />
          </label>
        </div>
        {importMsg && <span className="ok">{importMsg}</span>}
      </div>
    </div>
  );
}
