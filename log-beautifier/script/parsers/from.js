(function () {
  const LB = window.LogBeautifier;

  LB.stripOuterParensSafe = function stripOuterParensSafe(sql) {
    sql = sql.trim();
    let changed = true;

    while (changed) {
      changed = false;
      if (sql.startsWith("(") && sql.endsWith(")")) {
        let depth = 0;
        let valid = true;
        for (let i = 0; i < sql.length; i++) {
          if (sql[i] === "(") depth++;
          else if (sql[i] === ")") {
            depth--;
            if (depth === 0 && i < sql.length - 1) {
              valid = false;
              break;
            }
          }
        }
        if (valid && depth === 0) {
          sql = sql.slice(1, -1).trim();
          changed = true;
        }
      }
    }
    return sql;
  };

  LB.parseFrom = function parseFrom(sql) {
    const tables = [];
    const kw = /\b(FROM|(?:LEFT|RIGHT|INNER|FULL|CROSS)\s+JOIN|JOIN)\b/ig;

    let m;
    while ((m = kw.exec(sql)) !== null) {
      // ---- 1) Bỏ qua các match nằm trong subquery (depth > 0)
      let depth = 0,
        inStr = false;
      for (let i = 0; i < m.index; i++) {
        const c = sql[i],
          n = sql[i + 1];
        if (inStr) {
          if (c === "'" && n === "'") {
            i++;
            continue;
          }
          if (c === "'") inStr = false;
          continue;
        }
        if (c === "'") {
          inStr = true;
          continue;
        }
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
      }
      if (depth > 0) continue;

      // ---- 2) Loại JOIN/FROM
      const type = m[1];
      let pos = m.index + m[0].length;
      while (pos < sql.length && /\s/.test(sql[pos])) pos++;

      // ---- 3) Table expr
      let tableExpr = "",
        isSubquery = false;
      if (sql[pos] === "(") {
        isSubquery = true;
        const { text, end } = LB.readBalanced(sql, pos);
        tableExpr = text;
        pos = end;
      } else if (sql[pos] === '"') {
        const { text, end } = LB.readQuoted(sql, pos);
        tableExpr = text;
        pos = end;
      } else {
        const start = pos;
        while (pos < sql.length && !/\s/.test(sql[pos])) pos++;
        tableExpr = sql.slice(start, pos);
      }

      // ---- 4) Alias (nếu lỡ ăn nhầm "ON" thì trả về aliasStart)
      const aliasStart = pos;
      while (pos < sql.length && /\s/.test(sql[pos])) pos++;
      let alias = "";
      if (sql[pos] === '"') {
        const { text, end } = LB.readQuoted(sql, pos);
        alias = text;
        pos = end;
      } else {
        const aStart = pos;
        while (pos < sql.length && /[A-Za-z0-9_.]/.test(sql[pos])) pos++;
        alias = sql.slice(aStart, pos).trim();
      }
      if (/^ON$/i.test(alias)) {
        alias = "";
        pos = aliasStart;
      }

      // ---- 5) ON/USING CHỈ khi là JOIN, và PHẢI đứng ngay sau alias
      let on = "";
      if (/JOIN/i.test(type)) {
        const rest = sql.slice(pos);
        const head = rest.match(/^\s+(ON|USING)\b/i);
        if (head) {
          let j = pos + head[0].length;
          let d2 = 0,
            inStr2 = false;
          for (; j < sql.length; j++) {
            const c = sql[j],
              n = sql[j + 1];
            if (inStr2) {
              if (c === "'" && n === "'") {
                j++;
                continue;
              }
              if (c === "'") inStr2 = false;
              continue;
            }
            if (c === "'") {
              inStr2 = true;
              continue;
            }
            if (c === "(") d2++;
            else if (c === ")") d2 = Math.max(0, d2 - 1);

            if (d2 === 0) {
              const rest2 = sql.slice(j);
              if (
                /^(?:\s+)?(?:(?:LEFT|RIGHT|INNER|FULL|CROSS)\s+JOIN|JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|RETURNING|UNION(?:\s+ALL)?|EXCEPT|INTERSECT)\b/i.test(
                  rest2
                )
              ) {
                break;
              }
            }
          }
          on = sql.slice(pos + head[0].length, j).trim();
        }
      }

      tables.push({
        type,
        table: isSubquery ? "(subquery)" : tableExpr,
        alias,
        isSubquery,
        innerSQL: isSubquery ? LB.stripOuterParensSafe(tableExpr) : null,
        on,
      });
    }
    return tables;
  };
})();
