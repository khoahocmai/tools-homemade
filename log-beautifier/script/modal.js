(function () {
  const LB = window.LogBeautifier;

  LB.renderSubqueryBlock = function renderSubqueryBlock(innerSQL, alias) {
    const formattedInner = LB.beautifySQL(innerSQL);

    const { distinct, cols } = LB.parseSelect(formattedInner);
    const tables = LB.parseFrom(formattedInner);
    const conds = LB.parseWhere(formattedInner);
    const orders = LB.parseOrderBy(formattedInner);
    const limit = LB.parseLimit(formattedInner);

    const wrap = document.createElement("div");
    wrap.className = "groups";

    const left = document.createElement("div");
    left.className = "col-left";
    if (cols.length) {
      const det = document.createElement("details");
      det.className = "group";
      det.open = true;
      const sum = document.createElement("summary");
      sum.textContent = distinct ? "Select Distinct Columns" : "Select Columns";
      det.appendChild(sum);
      det.appendChild(LB.createSelectTableImproved(cols));
      left.appendChild(det);
    }

    const right = document.createElement("div");
    right.className = "col-right";

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
      det.appendChild(LB.createWhereTree(conds));
      right.appendChild(det);
    }

    if (orders.length) {
      const det = document.createElement("details");
      det.className = "group";
      det.open = true;
      const sum = document.createElement("summary");
      sum.textContent = "Order By";
      det.appendChild(sum);
      det.appendChild(LB.createOrderByTable(orders));
      right.appendChild(det);
    }

    if (limit) {
      right.appendChild(LB.createLimitGroup(limit));
    }

    wrap.appendChild(left);
    wrap.appendChild(right);
    return wrap;
  };

  LB.showSubqueryModal = function showSubqueryModal(innerSQL, alias) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";

    const header = document.createElement("div");
    header.className = "modal-header";

    const title = document.createElement("h3");
    title.textContent = `Subquery has alias: ${alias || ""}`;

    const copyBtn = document.createElement("button");
    copyBtn.className = "modal-copy";
    copyBtn.innerText = "📋 Copy";
    copyBtn.onclick = () => {
      LB.copyToClipboard(innerSQL);
    };

    header.appendChild(title);
    header.appendChild(copyBtn);

    const body = LB.renderSubqueryBlock(innerSQL, alias);
    modal.appendChild(header);
    modal.appendChild(body);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  };
})();
