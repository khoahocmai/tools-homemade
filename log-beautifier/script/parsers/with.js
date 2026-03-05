(function () {
  const LB = window.LogBeautifier;

  /**
   * Parse WITH (CTE) statements.
   * Returns: { recursive: boolean, ctes: [{name, columns, sql}], mainSQL }
   */
  LB.parseWith = function parseWith(sql) {
    const s = String(sql || "").trim();
    if (!/^WITH\b/i.test(s)) return null;

    let pos = 4; // after WITH
    while (pos < s.length && /\s/.test(s[pos])) pos++;

    let recursive = false;
    if (s.slice(pos, pos + 9).toUpperCase() === "RECURSIVE") {
      recursive = true;
      pos += 9;
    }

    const ctes = [];

    function skipWs() {
      while (pos < s.length && /\s/.test(s[pos])) pos++;
    }

    function readIdent() {
      skipWs();
      if (s[pos] === '"') {
        const { text, end } = LB.readQuoted(s, pos);
        pos = end;
        return text;
      }
      const st = pos;
      while (pos < s.length && /[A-Za-z0-9_$.]/.test(s[pos])) pos++;
      return s.slice(st, pos);
    }

    function readOptionalColumns() {
      skipWs();
      if (s[pos] !== "(") return "";
      const { text, end } = LB.readBalanced(s, pos);
      pos = end;
      return text;
    }

    function expectAS() {
      skipWs();
      if (s.slice(pos, pos + 2).toUpperCase() === "AS") {
        pos += 2;
        return true;
      }
      return false;
    }

    function readCTEBody() {
      skipWs();
      if (s[pos] !== "(") return "";
      const { text, end } = LB.readBalanced(s, pos);
      pos = end;
      return LB.stripOuterParensSafe(text);
    }

    while (pos < s.length) {
      skipWs();

      const name = readIdent();
      if (!name) break;
      const columns = readOptionalColumns();
      skipWs();

      // optional "AS" keyword (standard)
      expectAS();
      skipWs();

      const bodySql = readCTEBody();
      if (!bodySql) break;

      ctes.push({ name, columns, sql: bodySql });

      skipWs();
      if (s[pos] === ",") {
        pos++;
        continue;
      }
      break;
    }

    const mainSQL = s.slice(pos).trim();
    return { recursive, ctes, mainSQL };
  };
})();
