(function () {
  const LB = window.LogBeautifier;

  /**
   * Parse UPDATE statements (Postgres-ish)
   * Supports: UPDATE [ONLY] table [alias] SET a=b, ... [FROM ...] [WHERE ...] [RETURNING ...]
   */
  LB.parseUpdate = function parseUpdate(sql) {
    const s = String(sql || "").trim();
    if (!/^UPDATE\b/i.test(s)) return null;

    // --- scan helpers ---
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

        // word boundary match
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

    // --- find SET ---
    const setPos = scanKeywordOutside(0, "SET");
    if (setPos < 0) return null;

    // --- target (table + alias) ---
    let head = s.slice(0, setPos).trim();
    head = head.replace(/^UPDATE\s+/i, "").trim();
    head = head.replace(/^ONLY\s+/i, "").trim();

    // token reader (quoted or bare)
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
    const t1 = readToken(head, p);
    const table = (t1.token || "").trim();
    p = t1.end;
    const t2 = readToken(head, p);
    const alias = (t2.token || "").trim();
    // alias is optional, but if it equals "" or looks like keyword, ignore
    const safeAlias = alias && !/^SET$/i.test(alias) ? alias : "";

    // --- split SET / FROM / WHERE / RETURNING ---
    const afterSet = setPos + 3;
    const next = firstClauseAfter(afterSet, ["FROM", "WHERE", "RETURNING"]);
    const setText = s.slice(afterSet, next.idx >= 0 ? next.idx : s.length).trim();

    let fromText = "";
    let whereText = "";
    let returningText = "";

    if (next.idx >= 0) {
      if (next.kw === "FROM") {
        const next2 = firstClauseAfter(next.idx + 4, ["WHERE", "RETURNING"]);
        fromText = s.slice(next.idx + 4, next2.idx >= 0 ? next2.idx : s.length).trim();
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

    // --- parse SET assignments ---
    function splitAssign(expr) {
      let depth = 0;
      let inStr = false;
      let inDq = false;
      for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        const n = expr[i + 1];
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
        if (depth === 0 && c === "=") {
          return { col: expr.slice(0, i).trim(), value: expr.slice(i + 1).trim() };
        }
      }
      return { col: expr.trim(), value: "" };
    }

    const assignments = LB.splitByCommaOutsideParens(setText).map(splitAssign);

    const fromTables = fromText ? LB.parseFrom("FROM " + fromText) : [];
    // for WHERE we reuse the existing where parser by re-wrapping
    const whereConds = whereText ? LB.parseWhere("WHERE\n  " + whereText) : [];

    return {
      table,
      alias: safeAlias,
      sets: assignments,
      fromTables,
      whereConds,
      returning: returningText,
    };
  };
})();
