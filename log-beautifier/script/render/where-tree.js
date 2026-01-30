(function () {
  const LB = window.LogBeautifier;

  // WHERE as tree view (subquery)
  LB.createWhereTree = function createWhereTree(conds) {
    const root = document.createElement("ul");
    root.className = "where-tree";

    conds.forEach((c) => {
      let expr = LB.stripOuterParens(c.trim());

      expr.split(/\s+AND\s+|\s+OR\s+/i).forEach((part) => {
        let cond = LB.stripOuterParens(part.trim());
        if (cond) {
          const li = document.createElement("li");
          li.innerHTML = LB.highlightSQL(cond);
          root.appendChild(li);
        }
      });
    });

    return root;
  };
})();
