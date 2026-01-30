(function () {
  const LB = window.LogBeautifier;

  LB.createSelectTable = function createSelectTable(cols) {
    const table = document.createElement("table");
    table.className = "table mono";
    table.innerHTML = `
      <thead><tr><th>Column</th><th>Alias</th></tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");
    cols.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${LB.highlightSQL(c.expr)}</td><td>${LB.highlightSQL(c.alias)}</td>`;
      tbody.appendChild(tr);
    });
    return table;
  };

  LB.createWhereTable = function createWhereTable(conds) {
    const table = document.createElement("table");
    table.className = "table mono";
    table.innerHTML = `<thead><tr><th>Condition</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector("tbody");
    conds.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${LB.highlightSQL(c)}</td>`;
      tbody.appendChild(tr);
    });
    return table;
  };

  LB.createOrderByTable = function createOrderByTable(orders) {
    const table = document.createElement("table");
    table.className = "table mono";
    const tbody = document.createElement("tbody");
    orders.forEach((o) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${LB.highlightSQL(o)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  };

  LB.createLimitGroup = function createLimitGroup(limit) {
    if (!limit) return null;
    const det = document.createElement("details");
    det.className = "group";
    det.open = true;
    const sum = document.createElement("summary");
    sum.textContent = "Limit";
    const pre = document.createElement("pre");
    pre.innerHTML = LB.highlightSQL("LIMIT " + limit);
    det.appendChild(sum);
    det.appendChild(pre);
    return det;
  };

  LB.createReturningGroup = function createReturningGroup(retText) {
    if (!retText || !retText.trim()) return null;
    const det = document.createElement("details");
    det.className = "group";
    det.open = true;
    const sum = document.createElement("summary");
    sum.textContent = "Returning";
    const pre = document.createElement("pre");
    pre.innerHTML = LB.highlightSQL("RETURNING " + retText.trim());
    det.appendChild(sum);
    det.appendChild(pre);
    return det;
  };

  LB.createInsertInspector = function createInsertInspector(info) {
    const det = document.createElement("details");
    det.className = "group";
    det.open = true;

    const sum = document.createElement("summary");
    sum.textContent = "Query";
    det.appendChild(sum);

    const bar = document.createElement("div");
    bar.className = "subtle";
    bar.style.padding = "8px 12px";
    bar.style.display = "flex";
    bar.style.alignItems = "center";
    bar.style.justifyContent = "flex-start";
    bar.innerHTML = LB.highlightSQL(`INSERT INTO ${info.table}`);
    det.appendChild(bar);

    const table = document.createElement("table");
    table.className = "table mono";
    table.innerHTML = `
      <thead><tr><th style="width:40%">Column</th><th>Value</th></tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    const insertCols = info.columns.map((c) =>
      c
        .replace(/\s+AS\s+.*$/i, "")
        .trim()
        .replace(/^"+|"+$/g, "")
        .replace(/\)+$/, "")
    );

    const rows = info.rows.length
      ? info.rows
      : [Array.from({ length: insertCols.length }, () => "")];

    rows.forEach((row) => {
      insertCols.forEach((colName, idx) => {
        const tr = document.createElement("tr");
        const td1 = document.createElement("td");
        const td2 = document.createElement("td");

        td1.innerHTML = LB.highlightSQL(`"${colName}"`);
        td2.innerHTML = LB.highlightSQL((row[idx] ?? "").trim());

        tr.appendChild(td1);
        tr.appendChild(td2);
        tbody.appendChild(tr);
      });
    });

    det.appendChild(table);
    return det;
  };

  LB.createWhereBlock = function createWhereBlock(conds) {
    const pre = document.createElement("pre");
    pre.innerHTML = LB.highlightSQL(conds.join("\nAND "));
    return pre;
  };
})();
