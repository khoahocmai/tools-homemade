(function () {
  const LB = window.LogBeautifier;

  /* ================== INSERT PARSER (cho inspector) ================== */
  LB.extractInsertInfo = function extractInsertInfo(sql) {
    const mValues = /VALUES\b/i.exec(sql);
    if (!/^\s*INSERT\b/i.test(sql) || !mValues) return null;

    const head = sql.slice(0, mValues.index);
    const mHead = /INSERT\s+INTO\s+([\s\S]*?)\(\s*([\s\S]*?)\s*\)\s*$/i.exec(head);
    if (!mHead) return null;
    const table = mHead[1].trim();
    const cols = LB.splitByCommaOutsideParens(mHead[2].trim());

    let rest = sql.slice(mValues.index + mValues[0].length);
    let returning = "";
    const retPos = rest.search(/\bRETURNING\b/i);
    if (retPos >= 0) {
      returning = rest.slice(retPos + "RETURNING".length).trim();
      rest = rest.slice(0, retPos);
    }

    const rows = [];
    let i = 0;
    while (i < rest.length) {
      while (i < rest.length && /[\s,]/.test(rest[i])) i++;
      if (i >= rest.length) break;
      if (rest[i] !== "(") break;

      i++;
      let depth = 1,
        inStr = false,
        buf = "";
      for (; i < rest.length; i++) {
        const c = rest[i],
          n = rest[i + 1];
        if (inStr) {
          buf += c;
          if (c === "'" && n == "'") {
            buf += n;
            i++;
          } else if (c === "'") {
            inStr = false;
          }
          continue;
        }
        if (c === "'") {
          inStr = true;
          buf += c;
          continue;
        }
        if (c === "(") {
          depth++;
          buf += c;
          continue;
        }
        if (c === ")") {
          depth--;
          if (depth === 0) {
            rows.push(buf.trim());
            i++;
            break;
          }
          buf += c;
          continue;
        }
        buf += c;
      }
    }

    const valueRows = rows.map((r) => LB.splitByCommaOutsideParens(r));
    return { table, columns: cols, rows: valueRows, returning };
  };
})();
