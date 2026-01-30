(function () {
  const LB = window.LogBeautifier;

  /* ================== FORMATTER ================== */
  LB.beautifySQL = function beautifySQL(sql) {
    let s = sql;

    // SELECT → xuống dòng sau SELECT
    s = s.replace(/\bSELECT\b/i, "SELECT\n  ");

    // FROM, WHERE, GROUP BY, ORDER BY, HAVING, LIMIT, OFFSET → mỗi cái xuống dòng riêng
    s = s.replace(/\sFROM\s/ig, "\nFROM\n  ");
    s = s.replace(/(\s|\))WHERE\s/ig, "\nWHERE\n  ");
    s = s.replace(/\sGROUP BY\s/ig, "\nGROUP BY\n  ");
    s = s.replace(/\sHAVING\s/ig, "\nHAVING\n  ");
    s = s.replace(/\sORDER BY\s/ig, "\nORDER BY\n  ");
    s = s.replace(/\sLIMIT\s/ig, "\nLIMIT ");
    s = s.replace(/\sOFFSET\s/ig, "\nOFFSET ");

    // JOIN → mỗi JOIN xuống dòng
    s = s.replace(/\s(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\s/ig, (m) => `\n${m.trim()} `);

    // AND/OR trong WHERE → indent thêm
    s = s.replace(/\sAND\s/ig, "\n  AND ");
    s = s.replace(/\sOR\s/ig, "\n  OR ");

    // INSERT: đưa "(" & ")" tách dòng
    s = s.replace(/(INSERT\s+INTO[\s\S]*?)\(\s*/i, (_, p1) => `${p1}\n(\n  `);
    s = s.replace(/(\n\(\n[\s\S]*?)\)/, (all, grp) => grp.replace(/\s*$/, "\n)"));
    s = s.replace(/(\bVALUES\b)\s*\(\s*/i, (_, kw) => `${kw}\n(\n  `);
    s = s.replace(/(\bVALUES\b\s*\n\(\n[\s\S]*?)\)/i, (all, grp) => grp.replace(/\s*$/, "\n)"));
    s = s.replace(/\)\s*(VALUES)\b/ig, (_, kw) => `)\n${kw}`);
    s = s.replace(/\)\s*(RETURNING)\b/ig, (_, kw) => `\n)\n${kw}`);

    return s;
  };
})();
