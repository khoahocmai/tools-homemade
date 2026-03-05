(function () {
  const LB = window.LogBeautifier;

  /**
   * Parse DELETE statements (Postgres-ish)
   * Supports: DELETE FROM table [alias] [USING ...] [WHERE ...] [RETURNING ...]
   */
  LB.parseDelete = function parseDelete(sql) {
    const s = String(sql || "").trim();
    if (!/^DELETE\b/i.test(s)) return null;

    function scanKeywordOutside(start, kwUpper) {
      let depth = 0;
      let inStr = false;
      let inDq = false;
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        const n = s[i + 1];

        if (inStr) {
          if (c === "'" && n === "'") { i++; continue; }
          if (c === "'") inStr = false;
          continue;
        }
        if (inDq) {
          if (c === '"' && n === '"') { i++; continue; }
          if (c === '"') inDq = false;
          continue;
        }
        if (c === "'") { inStr = true; continue; }
        if (c === '"') { inDq = true; continue; }
        if (c === "(") { depth++; continue; }
        if (c === ")") { depth = Math.max(0, depth - 1); continue; }
        if (depth !== 0) continue;

        if ((c === kwUpper[0] || c === kwUpper[0].toLowerCase()) && /\w/.test(c)) {
          const chunk = s.slice(i, i + kwUpper.length);
          if (chunk.toUpperCase() === kwUpper) {
            const before = s[i - 1];
            const after = s[i + kwUpper.length];
            if (!before || !/[A-Z0-9_]/i.test(before)) {
              if (!after || !/[A-Z0-9_]/i.test(after)) {
                return i;
              }
            }
          }
        }
      }
      return -1;
    }

    function firstClauseAfter(start, clauses) {
      let best = { idx: -1, kw: "" };
      for (const kw of clauses) {
        const i = scanKeywordOutside(start, kw);
        if (i >= 0 && (best.idx < 0 || i < best.idx)) best = { idx: i, kw };
      }
      return best;
    }

    const fromPos = scanKeywordOutside(0, "FROM");
    if (fromPos < 0) return null;

    const afterFrom = fromPos + 4;
    const next = firstClauseAfter(afterFrom, ["USING", "WHERE", "RETURNING"]);
    const targetText = s.slice(afterFrom, next.idx >= 0 ? next.idx : s.length).trim();

    // read table + alias
    function readToken(str, pos) {
      while (pos < str.length && /\s/.test(str[pos])) pos++;
      if (pos >= str.length) return { token: "", end: pos };
      if (str[pos] === '"') {
        const { text, end } = LB.readQuoted(str, pos);
        return { token: text, end };
      }
      const st = pos;
      while (pos < str.length && !/\s/.test(str[pos])) pos++;
      return { token: str.slice(st, pos), end: pos };
    }

    let p = 0;
    const t1 = readToken(targetText, p);
    const table = (t1.token || "").trim();
    p = t1.end;
    const t2 = readToken(targetText, p);
    const alias = (t2.token || "").trim();
    const safeAlias = alias && !/^USING$|^WHERE$|^RETURNING$/i.test(alias) ? alias : "";

    let usingText = "";
    let whereText = "";
    let returningText = "";

    if (next.idx >= 0) {
      if (next.kw === "USING") {
        const next2 = firstClauseAfter(next.idx + 5, ["WHERE", "RETURNING"]);
        usingText = s.slice(next.idx + 5, next2.idx >= 0 ? next2.idx : s.length).trim();
        if (next2.idx >= 0 && next2.kw === "WHERE") {
          const next3 = firstClauseAfter(next2.idx + 5, ["RETURNING"]);
          whereText = s.slice(next2.idx + 5, next3.idx >= 0 ? next3.idx : s.length).trim();
          if (next3.idx >= 0) returningText = s.slice(next3.idx + 9).trim();
        } else if (next2.idx >= 0 && next2.kw === "RETURNING") {
          returningText = s.slice(next2.idx + 9).trim();
        }
      }

      if (next.kw === "WHERE") {
        const next2 = firstClauseAfter(next.idx + 5, ["RETURNING"]);
        whereText = s.slice(next.idx + 5, next2.idx >= 0 ? next2.idx : s.length).trim();
        if (next2.idx >= 0) returningText = s.slice(next2.idx + 9).trim();
      }

      if (next.kw === "RETURNING") {
        returningText = s.slice(next.idx + 9).trim();
      }
    }

    const usingTables = usingText ? LB.parseFrom("FROM " + usingText) : [];
    const whereConds = whereText ? LB.parseWhere("WHERE\n  " + whereText) : [];

    return {
      table,
      alias: safeAlias,
      usingTables,
      whereConds,
      returning: returningText,
    };
  };
})();
