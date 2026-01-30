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
      results.push({ formatted, insertInfo });
    }

    LB.render(results);
    window._lastParsed = results.map((r) => r.formatted);
  };

  LB.render = function render(results) {
    const outputDiv = LB.$("#output");
    outputDiv.innerHTML = "";

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

      if (/^\s*SELECT\b/i.test(r.formatted)) {
        const { distinct, cols } = LB.parseSelect(r.formatted);
        const tables = LB.parseFrom(r.formatted).map((t) => {
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

        const conds = LB.parseWhere(r.formatted);
        const orderBy = LB.parseOrderBy(r.formatted);
        const limit = LB.parseLimit(r.formatted);

        if (cols && cols.length) {
          const det = document.createElement("details");
          det.className = "group";
          det.open = true;

          const sum = document.createElement("summary");
          sum.textContent = distinct ? "Select Distinct Columns" : "Select Columns";
          det.appendChild(sum);

          det.appendChild(LB.createSelectTable(cols));
          left.appendChild(det);
        }

        if (tables.length) {
          const det = document.createElement("details");
          det.className = "group";
          det.open = true;
          const sum = document.createElement("summary");
          sum.textContent = "From / Joins";
          det.appendChild(sum);

          det.appendChild(LB.createFromTableImproved(tables));
          right.appendChild(det);
        }

        if (conds.length) {
          const det = document.createElement("details");
          det.className = "group";
          det.open = true;
          const sum = document.createElement("summary");
          sum.textContent = "Where";
          det.appendChild(sum);
          det.appendChild(LB.createWhereBlock(conds));
          right.appendChild(det);
        }

        if (orderBy.length) {
          const det = document.createElement("details");
          det.className = "group";
          det.open = true;
          const sum = document.createElement("summary");
          sum.textContent = "Order By";
          det.appendChild(sum);
          det.appendChild(LB.createOrderByTable(orderBy));
          right.appendChild(det);
        }

        if (limit) {
          right.appendChild(LB.createLimitGroup(limit));
        }
      } else if (/^\s*INSERT\b/i.test(r.formatted) && r.insertInfo) {
        left.appendChild(LB.createInsertInspector(r.insertInfo));
        if (r.insertInfo.returning) {
          right.appendChild(LB.createReturningGroup(r.insertInfo.returning));
        }
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
