import { strFromU8, unzipSync } from 'fflate';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Unzips a .docx and parses every XML part; throws if the ZIP or any part is not well-formed. */
export function openDocx(bytes: Uint8Array): { parts: Record<string, string>; doc: Document } {
  const files = unzipSync(bytes);
  const parts: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    const xml = strFromU8(data);
    parts[name] = xml;
    if (/\.(xml|rels)$/.test(name)) {
      const d = new DOMParser().parseFromString(xml, 'application/xml');
      if (d.getElementsByTagName('parsererror').length) throw new Error(`${name} is not well-formed XML`);
    }
  }
  const doc = new DOMParser().parseFromString(parts['word/document.xml'], 'application/xml');
  return { parts, doc };
}

export interface Para {
  style: string | null;
  /** 'rtl' for <w:bidi/>, 'ltr' for <w:bidi w:val="0"/> */
  dir: 'rtl' | 'ltr' | null;
  /** text with <w:tab/> as "\t" and <w:br/> as "\n" */
  text: string;
  runs: { text: string; rtl: boolean; bold: boolean }[];
}

export function paragraphs(doc: Document): Para[] {
  return [...doc.getElementsByTagNameNS(W, 'p')].map((p) => {
    const pPr = p.getElementsByTagNameNS(W, 'pPr')[0];
    const style = pPr?.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') ?? null;
    const bidi = pPr?.getElementsByTagNameNS(W, 'bidi')[0];
    const dir = bidi ? (bidi.getAttributeNS(W, 'val') === '0' ? 'ltr' : 'rtl') : null;
    const runs = [...p.getElementsByTagNameNS(W, 'r')].map((r) => {
      let text = '';
      for (const c of r.childNodes) {
        if (c.nodeType !== 1) continue;
        const e = c as Element;
        if (e.localName === 't') text += e.textContent;
        else if (e.localName === 'tab') text += '\t';
        else if (e.localName === 'br') text += '\n';
      }
      const rPr = r.getElementsByTagNameNS(W, 'rPr')[0];
      return { text, rtl: !!rPr?.getElementsByTagNameNS(W, 'rtl').length, bold: !!rPr?.getElementsByTagNameNS(W, 'b').length };
    });
    return { style, dir, text: runs.map((r) => r.text).join(''), runs };
  });
}

/** Paragraphs after the "متن جلسه" heading. */
export function bodyParagraphs(doc: Document): Para[] {
  const all = paragraphs(doc);
  return all.slice(all.findIndex((p) => p.style === 'Heading1') + 1);
}
