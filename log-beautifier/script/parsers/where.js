(function () {
  const LB = window.LogBeautifier;

  LB.parseWhere = function parseWhere(sql) {
    const lines = sql.split("\n");
    const out = [];
    let inWhere = false;
    let depth = 0;

    for (let line of lines) {
      for (let c of line) {
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
      }

      const trimmed = line.trim();

      if (/^\(?\s*WHERE\b/i.test(trimmed) && depth === 0) {
        inWhere = true;
        continue;
      }

      if (inWhere) {
        if (/^(GROUP BY|ORDER BY|LIMIT|OFFSET|RETURNING)\b/i.test(trimmed) && depth === 0) {
          break;
        }
        if (trimmed) out.push(trimmed);
      }
    }

    if (out.length) {
      return out
        .join(" ")
        .split(/\bAND\b|\bOR\b/i)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  LB.parseOrderBy = function parseOrderBy(sql) {
    const m = /ORDER BY([\s\S]*?)(LIMIT|OFFSET|$)/i.exec(sql);
    if (!m) return [];
    return LB.splitByCommaOutsideParens(m[1].trim()).map((c) => c.trim());
  };

  LB.parseLimit = function parseLimit(sql) {
    const m = /\bLIMIT\s+(\d+)/i.exec(sql);
    return m ? m[1] : "";
  };

  LB.stripOuterParens = function stripOuterParens(s) {
    let prev;
    do {
      prev = s;
      if (s.startsWith("(") && s.endsWith(")")) {
        let depth = 0,
          balanced = true;
        for (let i = 0; i < s.length; i++) {
          if (s[i] === "(") depth++;
          else if (s[i] === ")") {
            depth--;
            if (depth < 0) {
              balanced = false;
              break;
            }
          }
        }
        if (balanced && depth === 0) {
          s = s.slice(1, -1).trim();
        }
      }
    } while (s !== prev);
    return s;
  };
})();
