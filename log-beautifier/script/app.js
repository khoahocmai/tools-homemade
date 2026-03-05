(function () {
  const LB = window.LogBeautifier;

  LB.parseLog = function parseLog() {
    const raw = LB.$("#input")
      .value.replace(/^\s*query:\s*START\s+TRANSACTION.*$/gmi, "")
      .replace(/^\s*query:\s*(COMMIT|ROLLBACK).*$/gmi, "");

    const results = [];
    const blocks = [];
    let m;

    const reSameLine = /(?:query:\s*)?([\s\S]*?)--\s*PARAMETERS:\s*([^\n]*)/gi;
    while ((m = reSameLine.exec(raw)) !== null) {
      blocks.push({ sql: m[1].trim(), paramsText: m[2].trim() });
    }

    for (const b of blocks) {
      const sqlRaw = (b.sql || "").trim();
      if (!sqlRaw) continue;

      if (!/\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sqlRaw)) continue;

      let params = [];

      function fixParamText(str) {
        let openArr = 0, closeArr = 0, openObj = 0, closeObj = 0;
        for (let c of str) {
          if (c === "[") openArr++;
          if (c === "]") closeArr++;
          if (c === "{") openObj++;
          if (c === "}") closeObj++;
        }
        while (closeObj < openObj) {
          if (str.endsWith("]")) str = str.slice(0, -1) + "}" + "]";
          else str += "}";
          closeObj++;
        }
        while (closeArr < openArr) {
          str += "]";
          closeArr++;
        }
        return str;
      }

      let paramTextFixed = fixParamText(b.paramsText.trim());
      try {
        params = JSON.parse(paramTextFixed);
      } catch {
        params = paramTextFixed;
      }

      let i = 0;
      let q = b.sql;

      if (/\$(\d+)/.test(q)) {
        q = q.replace(/\$(\d+)/g, (_, n) => {
          const v = params[Number(n) - 1];
          if (v === null || v === undefined) return "null";
          if (typeof v === "object") {
            let json = JSON.stringify(v);
            json = json.replace(/"/g, "'");
            return `'${json}'`;
          }
          if (typeof v === "number") return String(v);
          return `'${String(v)}'`;
        });
      } else if (/\?/.test(q)) {
        q = q.replace(/\?/g, () => {
          const v = params[i++];
          if (v === null || v === undefined) return "null";
          if (typeof v === "object") {
            let json = JSON.stringify(v);
            json = json.replace(/"/g, "'");
            return `'${json}'`;
          }
          if (typeof v === "number") return String(v);
          return `'${String(v)}'`;
        });
      }

      q = q.replace(/^\s*query:\s*/i, "");
      q = q.replace(/\s*--\s*PARAMETERS:\s*\[[\s\S]*?\]\s*$/i, "");
      if (/^\s*START\s+TRANSACTION\b/i.test(q)) continue;
      if (!q.trim()) continue;

      const formatted = LB.beautifySQL(q);
      const insertInfo = LB.extractInsertInfo(q);
      results.push({ raw: q, formatted, insertInfo });
    }

    LB.render(results);
    window._lastParsed = results.map((r) => r.formatted);
  };

  LB.render = function render(results) {
    const outputDiv = LB.$("#output");
    outputDiv.innerHTML = "";

    function addGroup(parentCol, title, contentNode, open = true) {
      if (!contentNode) return;
      const det = document.createElement("details");
      det.className = "group";
      det.open = open;
      const sum = document.createElement("summary");
      sum.textContent = title;
      det.appendChild(sum);
      det.appendChild(contentNode);
      parentCol.appendChild(det);
    }

    function renderSelect(sqlFormatted, left, right) {
      const { distinct, cols } = LB.parseSelect(sqlFormatted);
      const tables = LB.parseFrom(sqlFormatted).map((t) => {
        if (t.isSubquery) {
          return {
            type: t.type,
            alias: t.alias,
            isSubquery: true,
            innerSQL: t.innerSQL,
            table: "(subquery)",
            on: t.on,
          };
        }
        return t;
      });

      const conds = LB.parseWhere(sqlFormatted);
      const orderBy = LB.parseOrderBy(sqlFormatted);
      const limit = LB.parseLimit(sqlFormatted);

      if (cols && cols.length) {
        addGroup(left, distinct ? "Select Distinct Columns" : "Select Columns", LB.createSelectTable(cols), true);
      }
      if (tables.length) {
        addGroup(right, "From / Joins", LB.createFromTableImproved(tables), true);
      }
      if (conds.length) {
        addGroup(right, "Where", LB.createWhereBlock(conds), true);
      }
      if (orderBy.length) {
        addGroup(right, "Order By", LB.createOrderByTable(orderBy), true);
      }
      if (limit) {
        right.appendChild(LB.createLimitGroup(limit));
      }
    }

    function renderInsert(r, sqlFormatted, left, right) {
      const info = r.insertInfo || LB.extractInsertInfo(r.raw || sqlFormatted) || LB.extractInsertInfo(sqlFormatted);
      if (!info) return;
      left.appendChild(LB.createInsertInspector(info));
      if (info.returning) {
        right.appendChild(LB.createReturningGroup(info.returning));
      }
    }

    function renderUpdate(sqlFormatted, left, right) {
      const info = LB.parseUpdate(sqlFormatted);
      if (!info) return;

      const head = document.createElement("pre");
      head.innerHTML = LB.highlightSQL(`UPDATE ${info.table}${info.alias ? " " + info.alias : ""}`);
      addGroup(left, "Update Target", head, true);

      addGroup(left, "Set", LB.createSetTable(info.sets), true);

      if (info.fromTables && info.fromTables.length) {
        addGroup(right, "From / Joins", LB.createFromTableImproved(info.fromTables), true);
      }
      if (info.whereConds && info.whereConds.length) {
        addGroup(right, "Where", LB.createWhereBlock(info.whereConds), true);
      }
      if (info.returning) {
        right.appendChild(LB.createReturningGroup(info.returning));
      }
    }

    function renderDelete(sqlFormatted, left, right) {
      const info = LB.parseDelete(sqlFormatted);
      if (!info) return;

      const head = document.createElement("pre");
      head.innerHTML = LB.highlightSQL(`DELETE FROM ${info.table}${info.alias ? " " + info.alias : ""}`);
      addGroup(left, "Delete Target", head, true);

      if (info.usingTables && info.usingTables.length) {
        addGroup(right, "Using", LB.createFromTableImproved(info.usingTables), true);
      }
      if (info.whereConds && info.whereConds.length) {
        addGroup(right, "Where", LB.createWhereBlock(info.whereConds), true);
      }
      if (info.returning) {
        right.appendChild(LB.createReturningGroup(info.returning));
      }
    }

    results.forEach((r, idx) => {
      const block = document.createElement("div");
      block.className = "query-block";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `#${idx + 1} • Formatted`;
      block.appendChild(meta);

      const copy = document.createElement("button");
      copy.className = "copy-btn";
      copy.innerText = "📋 Copy";
      copy.onclick = () => LB.copyToClipboard(r.formatted);
      block.appendChild(copy);

      const groupsWrap = document.createElement("div");
      groupsWrap.className = "groups";
      const left = document.createElement("div");
      left.className = "col-left";
      const right = document.createElement("div");
      right.className = "col-right";

      // WITH: render CTEs, then render main statement
      let sqlToRender = r.formatted;
      if (/^\s*WITH\b/i.test(r.raw || r.formatted)) {
        const w = LB.parseWith(r.raw || r.formatted);
        if (w && w.ctes && w.ctes.length) {
          const table = document.createElement("table");
          table.className = "table mono";
          table.innerHTML = `<thead><tr><th>CTE</th><th>Columns</th><th>View</th></tr></thead><tbody></tbody>`;
          const tbody = table.querySelector("tbody");
          w.ctes.forEach((cte) => {
            const tr = document.createElement("tr");
            const cols = (cte.columns || "").trim();
            tr.innerHTML = `
              <td>${LB.highlightSQL(cte.name)}</td>
              <td class="alias-cell">${LB.escapeHtml(cols)}</td>
              <td class="subquery-cell">🔍 View</td>
            `;
            tr.querySelector(".subquery-cell").onclick = () => LB.showSubqueryModal(cte.sql, `CTE: ${cte.name}`);
            tbody.appendChild(tr);
          });
          addGroup(left, w.recursive ? "CTEs (RECURSIVE)" : "CTEs", table, true);
        }
        if (w && w.mainSQL) {
          sqlToRender = LB.beautifySQL(w.mainSQL);
        }
      }

      if (/^\s*SELECT\b/i.test(sqlToRender)) {
        renderSelect(sqlToRender, left, right);
      } else if (/^\s*INSERT\b/i.test(sqlToRender)) {
        renderInsert(r, sqlToRender, left, right);
      } else if (/^\s*UPDATE\b/i.test(sqlToRender)) {
        renderUpdate(sqlToRender, left, right);
      } else if (/^\s*DELETE\b/i.test(sqlToRender)) {
        renderDelete(sqlToRender, left, right);
      } else {
        // fallback: just show formatted SQL
        const pre = document.createElement("pre");
        pre.innerHTML = LB.highlightSQL(sqlToRender);
        addGroup(left, "SQL", pre, true);
      }

      groupsWrap.appendChild(left);
      groupsWrap.appendChild(right);
      block.appendChild(groupsWrap);
      outputDiv.appendChild(block);
    });
  };

  LB.saveJson = function saveJson() {
    const data = {
      input: LB.$("#input").value,
      output: window._lastParsed || [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parsed-sql-log.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  function init() {
    const input = LB.$("#input");
    const btnSave = LB.$("#btnSaveJson");

    input.addEventListener("input", LB.parseLog);
    btnSave.addEventListener("click", LB.saveJson);

    LB.parseLog();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
