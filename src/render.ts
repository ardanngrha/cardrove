import DOMPurify from 'dompurify';
export type Card = {
  id: string;
  note_id: string;
  deck_id: string;
  deck_name: string;
  ord: number;
  fields: string[];
  tags: string;
  model: {
    name: string;
    mediaPrefix?: string;
    css: string;
    type: number;
    flds: { name: string; ord: number }[];
    tmpls: { name: string; ord: number; qfmt: string; afmt: string }[];
  };
  state: string | null;
  version: number;
  modified: number;
  reps: number | null;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const media = (s: string, prefix = '') =>
  '/api/media/' + encodeURIComponent(prefix ? prefix + ':' + s : s);
const plain = (s: string) => {
  const d = document.createElement('div');
  d.innerHTML = DOMPurify.sanitize(s);
  return d.textContent ?? '';
};
function furigana(s: string, kind = 'furigana') {
  return s.replace(/([^\s<>\[\]]+)\[([^\]]+)\]/g, (_, base, reading) =>
    kind === 'kana' ? reading : kind === 'kanji' ? base : `<ruby>${base}<rt>${reading}</rt></ruby>`,
  );
}
function cloze(s: string, ord: number, answer: boolean): string {
  return s.replace(/{{c(\d+)::([\s\S]*?)(?:::([^{}]*?))?}}/g, (_, n, text, hint) =>
    Number(n) === ord + 1
      ? `<span class="cloze">${answer ? text : '[' + (hint || '…') + ']'}</span>`
      : text,
  );
}
export function template(
  source: string,
  fields: Record<string, string>,
  ord: number,
  answer: boolean,
): string {
  type Piece = { value: string; children?: Piece[]; invert?: boolean };
  const root: Piece[] = [],
    stack: { name: string; pieces: Piece[] }[] = [{ name: '', pieces: root }];
  let at = 0;
  for (const m of source.matchAll(/{{([^{}]+)}}/g)) {
    const current = stack[stack.length - 1];
    current.pieces.push({ value: source.slice(at, m.index) });
    const token = m[1].trim();
    if (token[0] === '#' || token[0] === '^') {
      const p: Piece = { value: token.slice(1), children: [], invert: token[0] === '^' };
      current.pieces.push(p);
      stack.push({ name: p.value, pieces: p.children! });
    } else if (token[0] === '/') {
      if (stack.length > 1 && current.name === token.slice(1)) stack.pop();
    } else current.pieces.push({ value: '\0' + token });
    at = m.index! + m[0].length;
  }
  stack[stack.length - 1].pieces.push({ value: source.slice(at) });
  const walk = (pieces: Piece[]): string =>
    pieces
      .map((p) => {
        if (p.children) {
          const yes = !!plain(fields[p.value] ?? '').trim();
          return yes !== !!p.invert ? walk(p.children) : '';
        }
        if (!p.value.startsWith('\0')) return p.value;
        const parts = p.value.slice(1).split(':'),
          key = parts.pop()!,
          filters = parts;
        let value = fields[key] ?? '';
        for (const filter of filters.reverse()) {
          if (filter === 'cloze') value = cloze(value, ord, answer);
          else if (['furigana', 'kana', 'kanji'].includes(filter)) value = furigana(value, filter);
          else if (filter === 'text') value = escape(plain(value));
          else if (filter === 'hint')
            value = answer ? value : `<details><summary>${escape(key)}</summary>${value}</details>`;
          else if (filter === 'type') value = answer ? value : '<span class="type-hint">[…]</span>';
          else value = '';
        }
        return value;
      })
      .join('');
  return walk(root);
}
export function cardDocument(
  card: Card,
  answer = false,
  urls?: Record<string, string>,
  theme = 'light',
) {
  const asset = (s: string) =>
    urls
      ? urls[(card.model.mediaPrefix ? card.model.mediaPrefix + ':' : '') + s] || ''
      : media(s, card.model.mediaPrefix);
  const allowed = new Set(Object.values(urls ?? {}));
  const origins = [...new Set([...allowed].filter(Boolean).map((u) => new URL(u).origin))].join(
    ' ',
  );
  const values: Record<string, string> = {
    Tags: escape(card.tags),
    Type: escape(card.model.name),
    Deck: escape(card.deck_name),
    Subdeck: escape(card.deck_name.split('::').pop() ?? ''),
    Card: escape(card.model.tmpls[card.model.type === 1 ? 0 : card.ord]?.name ?? ''),
    'info-Ease': '',
    CardFlag: '',
  };
  card.model.flds.forEach((f, i) => (values[f.name] = card.fields[i] ?? ''));
  const t = card.model.tmpls[card.model.type === 1 ? 0 : card.ord] ?? card.model.tmpls[0];
  values.FrontSide = template(t.qfmt, values, card.ord, false);
  let html = template(answer ? t.afmt : t.qfmt, values, card.ord, answer);
  html = html.replace(
    /\[sound:([^\]]+)\]/g,
    (_, name) => `<audio controls preload="none" src="${asset(name)}"></audio>`,
  );
  html = DOMPurify.sanitize(html, {
    ADD_TAGS: ['audio'],
    ADD_ATTR: ['controls', 'preload'],
    FORBID_TAGS: [
      'style',
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'video',
      'link',
      'meta',
    ],
    FORBID_ATTR: ['srcset'],
  });
  const longContent = plain(html).length > 400;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('[src]').forEach((el) => {
    const value = el.getAttribute('src') ?? '';
    if ((!urls && value.startsWith('/api/media/')) || allowed.has(value)) return;
    if (/^(https?:|data:|\/\/)/i.test(value)) {
      el.removeAttribute('src');
      return;
    }
    try {
      el.setAttribute('src', asset(decodeURIComponent(value)));
    } catch {
      el.removeAttribute('src');
    }
  });
  parsed.querySelectorAll('a').forEach((el) => {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  });
  let css = (card.model.css ?? '')
    .replace(/<\/style/gi, '')
    .replace(/@import\s+[^;]+;/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_, q, name) => `url("${asset(name)}")`);
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const ink = dark ? '#eeeae0' : '#2c2b27';
  const muted = dark ? '#b6b3a9' : '#68665e';
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: ${origins}; media-src 'self' ${origins}; font-src 'self' ${origins}; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>
    :root{color-scheme:${dark ? 'dark' : 'light'};color:${ink}}
    html,body{margin:0;background:transparent;color:inherit}
    body.card{font-family:system-ui,sans-serif;font-size:${longContent ? '20' : '26'}px;line-height:1.6;text-align:center;padding:30px 24px;box-sizing:border-box;overflow-wrap:anywhere}
    img{max-width:100%;height:auto;object-fit:contain}audio{max-width:100%;display:block;margin:18px auto}ruby{ruby-align:center}rt{font-size:.5em;color:${muted}}hr{border:0;border-top:1px solid ${dark ? '#505147' : '#d8d4cb'};margin:24px auto}.cloze{color:${dark ? '#f4aa82' : '#a84426'};font-weight:bold}.type-hint{font-size:16px;color:${muted}}
    ${css}
    html,body.card{background:transparent!important}body.card{max-width:100%;min-width:0;color:${ink}!important}img{max-width:100%!important;height:auto!important}pre{white-space:pre-wrap;overflow-wrap:anywhere}.footer{position:static!important;background:transparent!important;padding:12px 0!important}.subtle,.footer{font-size:12px!important;line-height:1.6!important;color:${muted}!important}#ease-div{display:none}
    @media(max-width:500px){body.card{padding:24px 16px;font-size:${longContent ? '18' : '24'}px}body.card div[style*="font-size"]{max-width:100%;overflow-wrap:anywhere}img{max-height:360px;object-fit:contain}}
    </style></head><body dir="auto" class="card card${card.ord + 1}${dark ? ' nightMode night_mode' : ''}">${parsed.body.innerHTML}</body></html>`;
}
export function preview(card: Card) {
  const values: Record<string, string> = {
    Tags: card.tags,
    Deck: card.deck_name,
    Type: card.model.name,
    FrontSide: '',
  };
  card.model.flds.forEach((field, i) => (values[field.name] = card.fields[i] ?? ''));
  const format = card.model.tmpls[card.model.type === 1 ? 0 : card.ord] ?? card.model.tmpls[0];
  const text = (html: string) =>
    plain(html)
      .replace(/\[sound:[^\]]+\]/g, '[Audio]')
      .trim();
  return {
    front: text(template(format.qfmt, values, card.ord, false)),
    back: text(template(format.afmt, values, card.ord, true)),
  };
}
