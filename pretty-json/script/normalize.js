(function () {
  const PJ = (window.PJ = window.PJ || {});

  function stripComments(src) {
    let out = "", i = 0, inStr = false, esc = false, inSL = false, inML = false;
    while (i < src.length) {
      const ch = src[i], nxt = src[i + 1];

      if (inSL) { if (ch === "\n") { inSL = false; out += "\n"; } i++; continue; }
      if (inML) { if (ch === "*" && nxt === "/") { inML = false; i += 2; continue; } i++; continue; }

      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        i++;
        continue;
      }

      if (ch === '"') { inStr = true; out += ch; i++; continue; }
      if (ch === "/" && nxt === "/") { inSL = true; i += 2; continue; }
      if (ch === "/" && nxt === "*") { inML = true; i += 2; continue; }

      out += ch; i++;
    }
    return out;
  }

  function stripTrailingCommas(src) {
    let out = "", i = 0, inStr = false, esc = false;
    while (i < src.length) {
      const ch = src[i];
      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        i++;
        continue;
      }
      if (ch === '"') { inStr = true; out += ch; i++; continue; }

      if (ch === ",") {
        let j = i + 1;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === "}" || src[j] === "]") { i++; continue; }
      }

      out += ch; i++;
    }
    return out;
  }

  function replaceUndefined(src) {
    let out = "", i = 0, inStr = false, esc = false;
    while (i < src.length) {
      const ch = src[i];
      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        i++;
        continue;
      }
      if (ch === '"') { inStr = true; out += ch; i++; continue; }

      if (src.slice(i, i + 9) === "undefined" &&
        !/[A-Za-z0-9_$]/.test(src[i - 1] || "") &&
        !/[A-Za-z0-9_$]/.test(src[i + 9] || "")) {
        out += "null"; i += 9; continue;
      }

      out += ch; i++;
    }
    return out;
  }

  // Convert regex literals /.../g to string "/.../g"
  function quoteRegexLiterals(src) {
    let out = "";
    let i = 0;
    let inStr = false, esc = false;

    while (i < src.length) {
      const ch = src[i];
      const nxt = src[i + 1];

      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        i++;
        continue;
      }

      if (ch === '"') { inStr = true; out += ch; i++; continue; }

      // regex literal begins with / but not comment
      if (ch === "/" && nxt !== "/" && nxt !== "*") {
        const start = i;
        i++; // skip opening /

        let inClass = false;
        let escaped = false;

        while (i < src.length) {
          const c = src[i];
          if (escaped) { escaped = false; i++; continue; }
          if (c === "\\") { escaped = true; i++; continue; }
          if (c === "[") inClass = true;
          if (c === "]") inClass = false;
          if (c === "/" && !inClass) { i++; break; }
          i++;
        }

        while (i < src.length && /[a-z]/i.test(src[i])) i++;
        const literal = src.slice(start, i);

        const jsonStr = '"' + literal.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
        out += jsonStr;
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

  // Convert single-quoted strings 'abc' -> "abc" (simple JSON5 helper)
  function fixSingleQuotes(src) {
    let out = "";
    let inDouble = false;
    let inSingle = false;
    let esc = false;

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];

      if (inDouble) {
        out += ch;
        if (!esc && ch === "\\") esc = true;
        else if (!esc && ch === '"') inDouble = false;
        else esc = false;
        continue;
      }

      if (inSingle) {
        if (ch === "'" && !esc) {
          out += '"';
          inSingle = false;
        } else {
          if (ch === "\\" && !esc) esc = true;
          else esc = false;
          out += ch;
        }
        continue;
      }

      if (ch === '"') { inDouble = true; out += ch; continue; }
      if (ch === "'") { inSingle = true; out += '"'; continue; }

      out += ch;
    }

    return out;
  }

  function handleEllipsis(src) {
    let out = "", i = 0, inStr = false, esc = false;
    while (i < src.length) {
      const ch = src[i];

      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        i++;
        continue;
      }
      if (ch === '"') { inStr = true; out += ch; i++; continue; }

      // [ ... ] -> []
      if (ch === "[") {
        let j = i + 1;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src.slice(j, j + 3) === "...") {
          j += 3;
          while (j < src.length && /\s/.test(src[j])) j++;
          if (src[j] === "]") { out += "[]"; i = j + 1; continue; }
        }
      }

      // { ... } -> {}
      if (ch === "{") {
        let j = i + 1;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src.slice(j, j + 3) === "...") {
          j += 3;
          while (j < src.length && /\s/.test(src[j])) j++;
          if (src[j] === "}") { out += "{}"; i = j + 1; continue; }
        }
      }

      // ... -> null
      if (src.slice(i, i + 3) === "...") { out += "null"; i += 3; continue; }

      out += ch; i++;
    }
    return out;
  }

  // Fix invalid escapes in JSON strings: "\q" -> "q"
  function fixInvalidEscapes(src) {
    let out = "", i = 0, inStr = false, esc = false;
    while (i < src.length) {
      const ch = src[i];

      if (!inStr) {
        if (ch === '"') { inStr = true; out += ch; i++; continue; }
        out += ch; i++; continue;
      }

      if (!esc) {
        if (ch === "\\") { esc = true; i++; continue; }
        if (ch === '"') { inStr = false; out += ch; i++; continue; }
        out += ch; i++; continue;
      }

      const n = src[i];

      if (n === '"' || n === "\\" || n === "/" || n === "b" || n === "f" || n === "n" || n === "r" || n === "t") {
        out += "\\" + n; i++; esc = false; continue;
      }

      if (n === "u" && /^[0-9a-fA-F]{4}/.test(src.slice(i + 1, i + 5))) {
        out += "\\u" + src.slice(i + 1, i + 5);
        i += 5; esc = false; continue;
      }

      // invalid => drop backslash, keep char
      out += n;
      i++; esc = false;
    }
    return out;
  }

  function autoFixJson(src) {
    let s = (src ?? "").trim();
    if (!s) return s;

    // Keep it conservative: only balance braces/brackets
    const openBraces = (s.match(/{/g) || []).length;
    const closeBraces = (s.match(/}/g) || []).length;
    const openBrackets = (s.match(/\[/g) || []).length;
    const closeBrackets = (s.match(/]/g) || []).length;

    if (openBraces > closeBraces) s += "}".repeat(openBraces - closeBraces);
    if (openBrackets > closeBrackets) s += "]".repeat(openBrackets - closeBrackets);

    return s;
  }

  // Quote object keys + fill missing values with null (best-effort)
  function quoteKeysAndExpandShorthand(src) {
    let out = "", i = 0, inStr = false, esc = false;
    const stack = [];

    while (i < src.length) {
      const ch = src[i];

      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        i++;
        continue;
      }

      if (ch === '"') { inStr = true; out += ch; i++; continue; }

      if (ch === "{" || ch === "[") { stack.push(ch); out += ch; i++; continue; }
      if (ch === "}" || ch === "]") { stack.pop(); out += ch; i++; continue; }

      const inObject = stack.length && stack[stack.length - 1] === "{";

      if (inObject && (ch === "{" || ch === ",")) {
        out += ch; i++;
        while (i < src.length && /\s/.test(src[i])) out += src[i++];

        // quoted key
        if (src[i] === '"') {
          const m = /^"([^"]+)"/.exec(src.slice(i));
          if (m) {
            const name = m[1];
            let j = i + m[0].length;
            while (j < src.length && /\s/.test(src[j])) j++;

            if (src[j] === "," || src[j] === "}") { out += `"${name}": null`; i = j; continue; }

            if (src[j] === ":") {
              out += `"${name}":`;
              j++;
              while (j < src.length && /\s/.test(src[j])) j++;
              if (src[j] === "," || src[j] === "}") { out += " null"; i = j; continue; }
              i = j;
              continue;
            }
          }
        }

        // unquoted key
        const m = /^[A-Za-z_$][\w$-]*/.exec(src.slice(i));
        if (m) {
          const name = m[0];
          let j = i + name.length, buf = "";
          while (j < src.length && /\s/.test(src[j])) buf += src[j++];

          if (src[j] === "," || src[j] === "}") { out += `"${name}": null`; i = j; continue; }

          if (src[j] === ":") {
            out += `"${name}"${buf}:`;
            j++;
            while (j < src.length && /\s/.test(src[j])) j++;
            if (src[j] === "," || src[j] === "}") { out += " null"; i = j; continue; }
            i = j;
            continue;
          }
        }
        continue;
      }

      out += ch; i++;
    }

    return out;
  }

  function normalizeJson(raw) {
    let s = autoFixJson(raw);
    s = stripComments(s);
    s = quoteRegexLiterals(s);
    s = stripTrailingCommas(s);
    s = fixSingleQuotes(s);
    s = replaceUndefined(s);
    s = handleEllipsis(s);
    s = quoteKeysAndExpandShorthand(s);
    s = fixInvalidEscapes(s);
    return s;
  }

  PJ.normalize = { normalizeJson };
})();