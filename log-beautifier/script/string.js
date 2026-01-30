(function () {
  const LB = window.LogBeautifier;

  LB.splitByCommaOutsideParens = function splitByCommaOutsideParens(text) {
    const out = [];
    let buf = "";
    let depth = 0;
    let inStr = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inStr) {
        buf += c;
        if (c === "'" && n == "'") { buf += n; i++; }
        else if (c === "'") { inStr = false; }
        continue;
      }
      if (c === "'") { inStr = true; buf += c; continue; }
      if (c === "(") { depth++; buf += c; continue; }
      if (c === ")") { depth = Math.max(0, depth - 1); buf += c; continue; }
      if (c === "," && depth === 0) { out.push(buf.trim()); buf = ""; continue; }
      buf += c;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  };

  LB.readBalanced = function readBalanced(src, i) {
    let depth = 0, inStr = false, j = i;
    for (; j < src.length; j++) {
      const c = src[j], n = src[j + 1];
      if (inStr) {
        if (c === "'" && n === "'") { j++; continue; } // escape ''
        if (c === "'") { inStr = false; continue; }
        continue;
      }
      if (c === "'") { inStr = true; continue; }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) { j++; break; }
      }
    }
    return { text: src.slice(i, j), end: j };
  };

  LB.readQuoted = function readQuoted(src, i) {
    // đọc "identifier", có xử lý "" escape
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === '"' && src[j + 1] === '"') { j += 2; continue; }
      if (src[j] === '"') { j++; break; }
      j++;
    }
    return { text: src.slice(i, j), end: j };
  };
})();
