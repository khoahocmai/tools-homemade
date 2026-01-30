(function () {
  const LB = window.LogBeautifier;

  LB.parseSelect = function parseSelect(sql) {
    const distinct = /\bSELECT\s+DISTINCT\b/i.test(sql); // có DISTINCT không
    const m = /SELECT\s+(?:DISTINCT\s+)?([\s\S]*?)FROM/i.exec(sql);
    if (!m) return { distinct: false, cols: [] };

    const cols = LB.splitByCommaOutsideParens(m[1]);
    const result = cols.map((c) => {
      const asMatch = /\s+AS\s+/i.exec(c);
      if (asMatch) {
        const [expr, alias] = c.split(/\s+AS\s+/i);
        return { expr: expr.trim(), alias: alias.trim() };
      }
      return { expr: c.trim(), alias: "" };
    });

    return { distinct, cols: result };
  };
})();
