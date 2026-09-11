/*
 * gaeb.js – Parser für GAEB DA XML (Austauschphasen X81 … X86)
 *
 * Der Parser ist bewusst tolerant:
 *  - Namensräume werden ignoriert (Vergleich über localName), damit DA XML 3.0,
 *    3.1, 3.2 und 3.3 gleichermaßen gelesen werden.
 *  - Fehlende Elemente führen nie zu einem Abbruch, sondern zu leeren Feldern.
 *
 * Öffentliche API (global als `GAEB`):
 *   GAEB.readFile(file)  -> Promise<string>   XML-Text aus Datei oder ZIP-Container
 *   GAEB.parse(xmlText)  -> Objektbaum des Leistungsverzeichnisses
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Datei einlesen (Encoding-Erkennung, ZIP-Container)
   * ------------------------------------------------------------------ */

  const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

  async function readFile(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (ZIP_SIGNATURE.every((b, i) => buffer[i] === b)) {
      return decodeXml(await extractFromZip(buffer));
    }
    return decodeXml(buffer);
  }

  /**
   * Dekodiert die Bytes anhand der Kodierung aus der XML-Deklaration.
   * GAEB-Dateien kommen je nach erzeugendem System in UTF-8 oder ISO-8859-1.
   */
  function decodeXml(bytes) {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      bytes = bytes.subarray(3);
    }
    const head = String.fromCharCode.apply(null, Array.from(bytes.subarray(0, 200)));
    const declared = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head);
    const label = declared ? declared[1] : 'utf-8';
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch (err) {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  /** Liest den ersten XML-Eintrag aus einem ZIP-Container (stored oder deflate). */
  async function extractFromZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view, bytes.length);
    if (eocd < 0) throw new Error('ZIP-Archiv beschädigt: Zentralverzeichnis nicht gefunden.');

    const entryCount = view.getUint16(eocd + 10, true);
    let pointer = view.getUint32(eocd + 16, true);
    let fallback = null;

    for (let i = 0; i < entryCount; i++) {
      if (view.getUint32(pointer, true) !== 0x02014b50) break;
      const method = view.getUint16(pointer + 10, true);
      const compressedSize = view.getUint32(pointer + 20, true);
      const nameLength = view.getUint16(pointer + 28, true);
      const extraLength = view.getUint16(pointer + 30, true);
      const commentLength = view.getUint16(pointer + 32, true);
      const localOffset = view.getUint32(pointer + 42, true);
      const name = new TextDecoder('utf-8').decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
      const entry = { name, method, compressedSize, localOffset };

      if (/\.(x8\d|xml|p8\d)$/i.test(name)) return inflateEntry(bytes, view, entry);
      if (!fallback && !name.endsWith('/')) fallback = entry;
      pointer += 46 + nameLength + extraLength + commentLength;
    }

    if (!fallback) throw new Error('Das ZIP-Archiv enthält keine GAEB-Datei.');
    return inflateEntry(bytes, view, fallback);
  }

  function findEndOfCentralDirectory(view, length) {
    const min = Math.max(0, length - 66000);
    for (let i = length - 22; i >= min; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  async function inflateEntry(bytes, view, entry) {
    const nameLength = view.getUint16(entry.localOffset + 26, true);
    const extraLength = view.getUint16(entry.localOffset + 28, true);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const data = bytes.subarray(start, start + entry.compressedSize);

    if (entry.method === 0) return data;
    if (entry.method !== 8) throw new Error('Nicht unterstützte ZIP-Komprimierung (Methode ' + entry.method + ').');
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Dieser Browser kann komprimierte Archive nicht entpacken. Bitte die entpackte Datei laden.');
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* ------------------------------------------------------------------ *
   * XML-Hilfsfunktionen (namensraumunabhängig)
   * ------------------------------------------------------------------ */

  const localName = (node) => node.localName || node.nodeName.replace(/^.*:/, '');

  function children(node, ...names) {
    if (!node) return [];
    const wanted = names.map((n) => n.toLowerCase());
    const result = [];
    for (const child of node.children) {
      if (!wanted.length || wanted.includes(localName(child).toLowerCase())) result.push(child);
    }
    return result;
  }

  const child = (node, ...names) => children(node, ...names)[0] || null;

  /** Erstes Element mit passendem Namen irgendwo im Teilbaum. */
  function descendant(node, name) {
    if (!node) return null;
    const wanted = name.toLowerCase();
    const stack = Array.from(node.children);
    while (stack.length) {
      const current = stack.shift();
      if (localName(current).toLowerCase() === wanted) return current;
      stack.push(...current.children);
    }
    return null;
  }

  function text(node, ...names) {
    const target = names.length ? child(node, ...names) : node;
    return target ? target.textContent.trim() : '';
  }

  function number(node, ...names) {
    const raw = text(node, ...names);
    if (!raw) return null;
    const value = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  const isYes = (value) => /^(yes|true|1|ja)$/i.test(String(value || '').trim());

  /* ------------------------------------------------------------------ *
   * Formatierte GAEB-Texte (p / span / br) nach HTML
   * ------------------------------------------------------------------ */

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /**
   * Wandelt einen GAEB-Textknoten in HTML um. Bietertextergänzungen
   * (TextComplement) werden als ausfüllbare Lücke hervorgehoben.
   */
  function renderText(node) {
    if (!node) return '';
    let html = '';
    for (const part of node.childNodes) {
      if (part.nodeType === 3) {
        html += escapeHtml(part.nodeValue);
        continue;
      }
      if (part.nodeType !== 1) continue;

      switch (localName(part).toLowerCase()) {
        case 'p':
          html += '<p>' + (renderText(part) || '<br>') + '</p>';
          break;
        case 'br':
          html += '<br>';
          break;
        case 'tab':
          html += '<span class="tx-tab"></span>';
          break;
        case 'span': {
          const styles = [];
          if (isYes(part.getAttribute('Bold'))) styles.push('font-weight:700');
          if (isYes(part.getAttribute('Italic'))) styles.push('font-style:italic');
          if (isYes(part.getAttribute('Underlined')) || isYes(part.getAttribute('Underline'))) {
            styles.push('text-decoration:underline');
          }
          const inner = renderText(part);
          html += styles.length ? '<span style="' + styles.join(';') + '">' + inner + '</span>' : inner;
          break;
        }
        case 'textcomplement': {
          const mark = part.getAttribute('Mark') || '';
          const caption = text(part, 'ComplCaption');
          const inner = renderText(child(part, 'ComplTx') || part) || caption;
          html +=
            '<span class="tx-complement" title="Bietertextergänzung' +
            (mark ? ' ' + escapeHtml(mark) : '') +
            '">' + (inner || '…') + '</span>';
          break;
        }
        default:
          html += renderText(part);
      }
    }
    return html;
  }

  /** Reiner Text ohne Auszeichnung – für Suche und CSV-Export. */
  function plainText(node) {
    if (!node) return '';
    return node.textContent.replace(/\s+/g, ' ').trim();
  }

  /* ------------------------------------------------------------------ *
   * Leistungsverzeichnis parsen
   * ------------------------------------------------------------------ */

  const PHASES = {
    80: 'Kostenermittlung',
    81: 'Leistungsbeschreibung',
    82: 'Kostenanschlag',
    83: 'Angebotsaufforderung',
    84: 'Angebotsabgabe',
    85: 'Nebenangebot',
    86: 'Auftragserteilung',
    87: 'Auftragsbestätigung',
    89: 'Abrechnung',
    94: 'Preisspiegel',
  };

  function parse(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const failure = doc.querySelector('parsererror');
    if (failure) throw new Error('Die Datei ist kein gültiges XML: ' + failure.textContent.split('\n')[0]);

    const root = doc.documentElement;
    if (!root || localName(root).toLowerCase() !== 'gaeb') {
      throw new Error('Kein GAEB-DA-XML: Das Wurzelelement heißt <' + (root ? localName(root) : '?') + '> statt <GAEB>.');
    }

    const info = child(root, 'GAEBInfo');
    const project = child(root, 'PrjInfo');
    const award = child(root, 'Award');
    const awardInfo = child(award, 'AwardInfo');
    const boq = child(award, 'BoQ');
    const boqInfo = child(boq, 'BoQInfo');

    const phase = text(award, 'DP');
    const currency = text(project, 'Cur') || text(awardInfo, 'Currency') || 'EUR';

    const result = {
      info: {
        version: text(info, 'Version'),
        versionDate: text(info, 'VersDate'),
        date: text(info, 'Date'),
        time: text(info, 'Time'),
        program: text(info, 'ProgSystem'),
        phase,
        phaseLabel: PHASES[parseInt(phase, 10)] || '',
      },
      project: {
        name: text(project, 'NamePrj'),
        label: text(project, 'LblPrj'),
        description: plainText(descendant(project, 'DescriptionPrj')),
        currency,
        currencyLabel: text(project, 'CurLbl') || text(awardInfo, 'CurrencyLabel') || currency,
      },
      boq: {
        name: text(boqInfo, 'Name'),
        label: text(boqInfo, 'LblBoQ'),
        date: text(boqInfo, 'Date'),
        outlineMask: readOutlineMask(boqInfo),
      },
      parties: readParties(award),
      nodes: [],
      stats: { items: 0, groups: 0, texts: 0, total: 0, hasPrices: false },
      warnings: [],
    };

    const body = child(boq, 'BoQBody');
    if (!body) {
      result.warnings.push('Die Datei enthält keinen Leistungsverzeichnis-Rumpf (BoQBody).');
      return result;
    }

    result.nodes = readBody(body, [], result);
    result.stats.total = result.nodes.reduce((sum, node) => sum + (node.total || 0), 0);

    const declaredTotal = number(descendant(boq, 'Totals'), 'Total');
    if (declaredTotal !== null) result.stats.declaredTotal = declaredTotal;

    return result;
  }

  /** OZ-Maske aus den Gliederungsangaben, z. B. "2.2.4" für Los.Titel.Position. */
  function readOutlineMask(boqInfo) {
    const breakdowns = children(boqInfo, 'BoQBkdn');
    if (!breakdowns.length) return '';
    return breakdowns
      .map((bkdn) => {
        const length = text(bkdn, 'Length');
        return length ? 'X'.repeat(Math.min(parseInt(length, 10) || 0, 12)) : '';
      })
      .filter(Boolean)
      .join('.');
  }

  const PARTY_ROLES = {
    OWN: 'Auftraggeber',
    CTR: 'Bieter / Auftragnehmer',
    PRC: 'Vergabestelle',
    PLN: 'Planer',
    AWD: 'Vergabestelle',
  };

  function readParties(award) {
    const parties = [];
    for (const element of children(award)) {
      const tag = localName(element).toUpperCase();
      if (!(tag in PARTY_ROLES)) continue;
      const address = descendant(element, 'Address') || element;
      const name = ['Name1', 'Name2', 'Name3', 'Name4']
        .map((field) => text(address, field))
        .filter(Boolean)
        .join(' · ');
      if (!name && !text(address, 'City')) continue;
      parties.push({
        role: PARTY_ROLES[tag],
        name,
        street: text(address, 'Street'),
        city: [text(address, 'PostCode'), text(address, 'City')].filter(Boolean).join(' '),
        contact: text(address, 'Phone') || text(address, 'Email'),
      });
    }
    return parties;
  }

  /**
   * Liest einen BoQBody rekursiv. `path` enthält die Ordnungszahl-Teile
   * der übergeordneten Gliederungsstufen.
   */
  function readBody(body, path, result) {
    const nodes = [];

    for (const element of children(body)) {
      const tag = localName(element).toLowerCase();

      if (tag === 'boqctgy') {
        nodes.push(readGroup(element, path, result));
      } else if (tag === 'itemlist') {
        for (const element2 of children(element)) {
          const node = readLeaf(element2, path, result);
          if (node) nodes.push(node);
        }
      } else {
        const node = readLeaf(element, path, result);
        if (node) nodes.push(node);
      }
    }

    return nodes;
  }

  function readGroup(element, path, result) {
    const rno = element.getAttribute('RNoPart') || '';
    const ownPath = rno ? path.concat(rno) : path.slice();
    const label = child(element, 'LblTx');

    result.stats.groups += 1;

    const group = {
      kind: 'group',
      id: element.getAttribute('ID') || '',
      oz: ownPath.join('.'),
      rno,
      title: plainText(label) || '(ohne Bezeichnung)',
      html: renderText(label),
      children: [],
      total: 0,
      itemCount: 0,
    };

    const body = child(element, 'BoQBody');
    if (body) {
      group.children = readBody(body, ownPath, result);
      for (const node of group.children) {
        group.total += node.total || 0;
        group.itemCount += node.kind === 'item' ? 1 : node.itemCount || 0;
      }
    }

    const declared = number(descendant(element, 'Totals'), 'Total');
    if (declared !== null && !group.total) group.total = declared;

    return group;
  }

  function readLeaf(element, path, result) {
    const tag = localName(element).toLowerCase();
    if (tag === 'item') return readItem(element, path, result);
    if (tag === 'remark' || tag === 'text') return readRemark(element, path, result, tag);
    return null;
  }

  function readItem(element, path, result) {
    const rno = element.getAttribute('RNoPart') || '';
    const index = element.getAttribute('RNoIndex') || '';
    const description = child(element, 'Description');
    const complete = child(description, 'CompleteText');
    const outline = descendant(description, 'TextOutlTxt') || descendant(description, 'OutlineText');
    const detail = descendant(complete || description, 'DetailTxt');

    const quantity = number(element, 'Qty');
    const unitPrice = number(element, 'UP');
    const itemTotal = number(element, 'IT');
    const total = itemTotal !== null ? itemTotal : unitPrice !== null && quantity !== null ? unitPrice * quantity : 0;

    if (unitPrice !== null || itemTotal !== null) result.stats.hasPrices = true;
    result.stats.items += 1;

    const item = {
      kind: 'item',
      id: element.getAttribute('ID') || '',
      oz: (rno ? path.concat(rno) : path).join('.') + (index ? '.' + index : ''),
      rno,
      shortText: plainText(outline) || kuerzen(plainText(detail), 120) || '(ohne Kurztext)',
      html: renderText(detail) || renderText(outline),
      search: '',
      quantity,
      unit: text(element, 'QU'),
      unitPrice,
      total,
      flags: readItemFlags(element),
      complements: countComplements(description),
    };

    item.search = (item.oz + ' ' + item.shortText + ' ' + plainText(detail)).toLowerCase();
    return item;
  }

  /** Positionsarten nach VOB/GAEB, soweit aus der Datei ableitbar. */
  function readItemFlags(element) {
    const flags = [];
    const alnGroup = text(element, 'ALNGroupNo');
    const alnSerial = text(element, 'ALNSerNo');

    if (isYes(element.getAttribute('Provis')) || isYes(text(element, 'Provis'))) {
      const withQty = isYes(element.getAttribute('ProvisQtyRelevant'));
      flags.push({ code: 'bedarf', label: withQty ? 'Bedarfsposition mit GB' : 'Bedarfsposition' });
    }
    if (alnGroup && alnSerial && parseInt(alnSerial, 10) > 0) {
      flags.push({ code: 'alternativ', label: 'Alternativposition ' + alnGroup + '.' + alnSerial });
    } else if (alnGroup) {
      flags.push({ code: 'grund', label: 'Grundposition ' + alnGroup });
    }
    if (isYes(element.getAttribute('LumpSumItem')) || /^(psch|pausch)/i.test(text(element, 'QU'))) {
      flags.push({ code: 'pauschal', label: 'Pauschalposition' });
    }
    if (descendant(element, 'HourlyRate') || /^(h|std)$/i.test(text(element, 'QU'))) {
      flags.push({ code: 'stundenlohn', label: 'Stundenlohnarbeit' });
    }
    if (element.getAttribute('Reference')) {
      flags.push({ code: 'wiederholung', label: 'Wiederholungsposition' });
    }
    return flags;
  }

  function countComplements(description) {
    if (!description) return 0;
    let count = 0;
    const stack = Array.from(description.children);
    while (stack.length) {
      const node = stack.shift();
      if (localName(node).toLowerCase() === 'textcomplement') count += 1;
      stack.push(...node.children);
    }
    return count;
  }

  function readRemark(element, path, result, tag) {
    const rno = element.getAttribute('RNoPart') || '';
    const body = descendant(element, 'DetailTxt') || descendant(element, 'CompleteText') || element;
    result.stats.texts += 1;
    return {
      kind: 'text',
      id: element.getAttribute('ID') || '',
      oz: (rno ? path.concat(rno) : path).join('.'),
      title: tag === 'remark' ? 'Hinweistext' : 'Textelement',
      shortText: kuerzen(plainText(body), 160),
      html: renderText(body),
      search: plainText(body).toLowerCase(),
      total: 0,
    };
  }

  /** Kürzt auf Wortgrenze, damit Vorschautexte nicht mitten im Wort enden. */
  function kuerzen(wert, laenge) {
    if (wert.length <= laenge) return wert;
    const schnitt = wert.slice(0, laenge);
    const luecke = schnitt.lastIndexOf(' ');
    return (luecke > laenge * 0.6 ? schnitt.slice(0, luecke) : schnitt) + ' …';
  }

  /** Alle Knoten des Baums in Dokumentreihenfolge, mit Tiefenangabe. */
  function flatten(nodes, depth = 0, out = []) {
    for (const node of nodes) {
      out.push({ node, depth });
      if (node.children) flatten(node.children, depth + 1, out);
    }
    return out;
  }

  global.GAEB = { readFile, parse, flatten, renderText, plainText, PHASES };
})(typeof window !== 'undefined' ? window : globalThis);
