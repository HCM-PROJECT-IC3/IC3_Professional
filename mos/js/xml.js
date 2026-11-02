/* Trình đọc XML tối giản cho OOXML (chạy được cả trình duyệt lẫn Node để kiểm thử).
   Nút: { name, local, attrs, children, text }. Không hỗ trợ DTD — tệp Office không dùng. */
(function (root) {
  'use strict';

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function decode(s) {
    return s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] !== '#') return ENT[e] ?? m;
      return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
  }

  function node(name, attrs) {
    const i = name.indexOf(':');
    return { name, local: i < 0 ? name : name.slice(i + 1), attrs, children: [], text: '' };
  }

  function parse(src) {
    const doc = node('#doc', {});
    const stack = [doc];
    const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(src))) {
      const top = stack[stack.length - 1];
      if (m[1] !== undefined) top.text += m[1];
      else if (m[2]) { if (stack.length > 1) stack.pop(); }
      else if (m[3]) {
        const attrs = {};
        let a;
        attrRe.lastIndex = 0;
        while ((a = attrRe.exec(m[4]))) attrs[a[1]] = decode(a[2] ?? a[3]);
        const n = node(m[3], attrs);
        top.children.push(n);
        if (!m[5]) stack.push(n);
      } else if (m[6] !== undefined && stack.length > 1) top.text += decode(m[6]);
    }
    return doc;
  }

  // Tìm theo tên đầy đủ ("c:ser") hoặc tên cục bộ ("ser") nếu không có dấu ":".
  function match(n, name) {
    if (name === '*') return true;
    if (name.endsWith(':*')) return n.name.startsWith(name.slice(0, -1));
    return name.indexOf(':') < 0 ? n.local === name : n.name === name;
  }

  function all(n, name, out) {
    out = out || [];
    if (!n) return out;
    for (const c of n.children) {
      if (match(c, name)) out.push(c);
      all(c, name, out);
    }
    return out;
  }
  function first(n, name) {
    if (!n) return null;
    for (const c of n.children) {
      if (match(c, name)) return c;
      const f = first(c, name);
      if (f) return f;
    }
    return null;
  }
  function kids(n, name) { return n ? n.children.filter(c => match(c, name)) : []; }
  function kid(n, name) { return n ? n.children.find(c => match(c, name)) || null : null; }
  // Mọi chữ bên trong (gộp <a:t>/<t>), dùng cho tiêu đề biểu đồ, ô chữ có định dạng...
  function text(n, tag) {
    if (!n) return '';
    if (tag) return all(n, tag).map(t => t.text).join('');
    let s = n.text;
    for (const c of n.children) s += text(c);
    return s;
  }
  function path(n, ...names) {
    let cur = n;
    for (const nm of names) { cur = kid(cur, nm); if (!cur) return null; }
    return cur;
  }

  const api = { parse, all, first, kids, kid, text, path };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MosXml = api;
})(typeof window !== 'undefined' ? window : globalThis);
