// Worker içinde de çalışan XML yardımcıları (tarayıcı DOMParser'ı Worker'da yoktur).
import { DOMParser } from '@xmldom/xmldom';

export function parseXml(text: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level === 'error' || level === 'fatalError') errors.push(msg);
    },
  } as any).parseFromString(text, 'text/xml') as unknown as Document;
  if (!doc || !doc.documentElement || errors.length > 0 && !doc.documentElement.childNodes.length) {
    throw new Error('XML biçimi bozuk: ' + (errors[0] ?? 'belge okunamadı'));
  }
  return doc;
}

export const localName = (n: Node) => ((n as Element).localName || n.nodeName.replace(/^.*:/, '')).toLowerCase();

export function children(el: Element | Document, name: string): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 1 && localName(n) === name) out.push(n as Element);
  }
  return out;
}

export const child = (el: Element | Document, name: string): Element | undefined => children(el, name)[0];

export function descendants(el: Element | Document, name: string): Element[] {
  const list = (el as Element).getElementsByTagNameNS('*', name);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i] as Element);
  return out;
}

export const text = (el: Element | undefined) => (el?.textContent ?? '').trim();

export function num(el: Element | undefined): number | null {
  if (!el) return null;
  const v = parseFloat(text(el));
  return isFinite(v) ? v : null;
}

export function timeMs(el: Element | undefined): number | null {
  if (!el) return null;
  const t = Date.parse(text(el));
  return isFinite(t) ? t : null;
}
