"""Bereitet die SGUM-Vorlagen fuer den Export vor (Platzhalter einsetzen).
Aufruf: python3 tools/prepare_templates.py <eigenstaendig.docx> <supervidiert.docx>
"""
import re, sys, zipfile, shutil

def prep(src, dst, row_height):
    zin = zipfile.ZipFile(src)
    x = zin.read('word/document.xml').decode('utf-8')

    # Komponente (Dropdown) -> Platzhalter
    x = x.replace('<w:showingPlcHdr/>', '', 1)
    x = re.sub(r'(<w:alias w:val="Beantragte Komponente"/>.*?<w:sdtContent>).*?(</w:sdtContent>)',
               r'\1<w:r><w:rPr><w:rStyle w:val="Formatvorlage3"/><w:sz w:val="20"/></w:rPr><w:t>{{KOMPONENTE}}</w:t></w:r>\2',
               x, count=1, flags=re.S)

    # Checkbox Bestaetigung
    x = x.replace('<w14:checked w14:val="0"/>', '<w14:checked w14:val="{{CHECKVAL}}"/>', 1)
    x = x.replace('<w:t>☐</w:t>', '<w:t>{{CHECK}}</w:t>', 1)

    # Formularfelder Name, Vorname, Datum
    pos = 0
    for key in ['NAME', 'VORNAME', 'DATUM']:
        pat = re.compile(r'(<w:fldChar w:fldCharType="separate"/></w:r>)((?:<w:r[ >](?:(?!</w:r>).)*?<w:noProof/>.*?</w:r>)+)(<w:r[ >](?:(?!</w:r>).)*?<w:fldChar w:fldCharType="end"/>)', re.S)
        m = pat.search(x, pos)
        assert m, key
        first = re.search(r'<w:r[ >].*?</w:r>', m.group(2), re.S).group(0)
        first = re.sub(r'<w:t>.*?</w:t>', '<w:t xml:space="preserve">{{%s}}</w:t>' % key, first)
        first = first.replace('<w:noProof/>', '<w:noProof/><w:x-done/>')
        x = x[:m.start(2)] + first + x[m.end(2):]
        pos = m.start(2) + len(first)
    x = x.replace('<w:x-done/>', '')

    # Tabelle: nicht schwebend, Kopfzeilen wiederholen, Datenzeilen ersetzen
    x = re.sub(r'<w:tblpPr [^>]*/>', '', x, count=1)
    rows = re.findall(r'<w:tr [^>]*>.*?</w:tr>', x, re.S)
    assert len(rows) == 12, len(rows)
    for h in rows[:2]:
        x = x.replace(h, h.replace('<w:trPr>', '<w:trPr><w:cantSplit/><w:tblHeader/>', 1), 1)
    proto = rows[2]
    i = 0
    def cell(m):
        nonlocal i
        s = m.group(0).replace('</w:pPr></w:p>', '</w:pPr><w:r><w:rPr><w:rFonts w:cs="Arial"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">{{C%d}}</w:t></w:r></w:p>' % i)
        i += 1
        return s
    proto = re.sub(r'<w:tc>.*?</w:tc>', cell, proto, flags=re.S)
    proto = re.sub(r'<w:trHeight w:val="\d+"/>', '<w:cantSplit/><w:trHeight w:val="%d"/>' % row_height, proto)
    proto = re.sub(r' w14:paraId="[0-9A-F]+"', '', proto)
    first, last = x.find(rows[2]), x.find(rows[-1]) + len(rows[-1])
    x = x[:first] + '{{ROWS}}' + x[last:]
    # Platz fuer optionale Sammelbestaetigung des Supervisors direkt nach der Tabelle
    t = x.find('</w:tbl>') + len('</w:tbl>')
    x = x[:t] + '{{SUPBLOCK}}' + x[t:]

    zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'word/document.xml':
            data = x.encode('utf-8')
        zout.writestr(item, data)
    zout.close()
    return proto

if __name__ == '__main__':
    import json
    out = {}
    out['eigen'] = prep(sys.argv[1], 'public/templates/eigenstaendig.docx', 400)
    out['sup'] = prep(sys.argv[2], 'public/templates/supervidiert.docx', 600)
    json.dump(out, open('src/export/rowTemplates.json', 'w'), ensure_ascii=False)
    zipfile.ZipFile(sys.argv[1]).extract('word/media/image1.png', '/tmp/_logo')
    shutil.copy('/tmp/_logo/word/media/image1.png', 'src/assets/sgum-logo.png')
