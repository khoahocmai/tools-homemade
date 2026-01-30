(function () {
  const LB = window.LogBeautifier;

  // SELECT Columns table (improved)
  LB.createSelectTableImproved = function createSelectTableImproved(cols) {
    const table = document.createElement("table");
    table.className = "table mono";
    table.innerHTML = `<thead><tr><th>Expression</th><th>Alias</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector("tbody");

    cols.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${LB.highlightSQL(c.expr)}</td>
        <td class="alias-cell">${c.alias}</td>
      `;
      tbody.appendChild(tr);
    });
    return table;
  };

  // FROM / JOINs table with ON condition
  LB.createFromTableImproved = function createFromTableImproved(tables) {
    const table = document.createElement("table");
    table.className = "table mono";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Type</th>
          <th>Table</th>
          <th>Alias</th>
          <th>On Condition</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    tables.forEach((t) => {
      const tr = document.createElement("tr");

      if (t.isSubquery) {
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "subquery-cell";
        td.innerHTML = `🔍 View Subquery has alias: ${t.alias || ""}`;
        td.onclick = () => {
          LB.showSubqueryModal(t.innerSQL, t.alias);
        };
        tr.appendChild(td);
      } else {
        tr.innerHTML = `
          <td>${t.type}</td>
          <td>${LB.highlightSQL(t.table)}</td>
          <td class="alias-cell">${LB.highlightSQL(t.alias || "")}</td>
          <td>
            ${(t.on || "")
            .split(/\b(AND|OR)\b/i)
            .map((part) => {
              if (/^(AND|OR)$/i.test(part.trim())) {
                return `<div style="color:#34d399;font-weight:bold">${part.trim()}</div>`;
              }
              return `<div>${LB.highlightSQL(part.trim())}</div>`;
            })
            .join("")}
          </td>
        `;
      }

      tbody.appendChild(tr);
    });

    return table;
  };
})();
