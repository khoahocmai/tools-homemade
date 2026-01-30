(function () {
  const LB = window.LogBeautifier;

  /* ================== HIGHLIGHT (giữ nguyên hoa/thường) ================== */
  LB.highlightSQL = function highlightSQL(sql) {
    let work = sql;

    // Bảo vệ "ident"
    const dq = [];
    work = work.replace(/"([^"]*)"/g, (m, id, offset, src) => {
      let i = offset - 1; while (i >= 0 && /[\s,()]/.test(src[i])) i--;
      let j = i; while (j >= 0 && /[A-Za-z_]/.test(src[j])) j--;
      const prev = src.slice(j + 1, i + 1);
      const afterAS = /^AS$/i.test(prev);
      const beforeTableCtx = /^(FROM|JOIN|INTO|UPDATE|DELETE)$/i.test(prev);

      // có alias "SomethingEntity" ngay sau?
      let k = offset + m.length; while (k < src.length && /\s/.test(src[k])) k++;
      let beforeEntityAlias = false;
      if (src[k] === '"') {
        let e = k + 1;
        while (e < src.length && src[e] !== '"') e++;
        const nextId = src.slice(k + 1, e);
        beforeEntityAlias = /Entity/i.test(nextId);
      }

      const idx = dq.length;
      dq.push({ id, afterAS, beforeTableCtx, beforeEntityAlias });
      return `__DQ${idx}__`;
    });

    // Bảo vệ strings
    const sq = [];
    work = work.replace(/'(?:''|[^'])*'/g, (m) => {
      const idx = sq.length;
      sq.push(m);
      return `__SQ${idx}__`;
    });

    // Highlight phần còn lại
    let text = LB.escapeHtml(work);
    text = text.replace(
      /\b(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT|RIGHT|INNER|FULL|CROSS|ON|IN|AS|IS|TRUE|FALSE|NOT|NULL|UPDATE|SET|INSERT|INTO|VALUES|DELETE|RETURNING|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET)\b/gi,
      (m) => `<span class="keyword">${m}</span>`
    );
    text = text.replace(/\b\d+(\.\d+)?\b/g, (m) => `<span class="number">${m}</span>`);
    text = text.replace(/\bundefined\b/gi, (m) => `<span class="undef">${m}</span>`);
    text = text.replace(/\bDEFAULT\b/gi, (m) => `<span class="defaultv">${m}</span>`);

    dq.forEach(({ id, afterAS, beforeTableCtx, beforeEntityAlias }, i) => {
      const full = `"${id}"`;
      const isEntityLike = /entity/i.test(id) || /__/.test(id) || beforeEntityAlias || beforeTableCtx;
      const cls = (isEntityLike && !afterAS) ? "entity" : "ident";
      text = text.replace(`__DQ${i}__`, `<span class="${cls}">${LB.escapeHtml(full)}</span>`);
    });
    sq.forEach((s, i) => {
      text = text.replace(`__SQ${i}__`, `<span class="string">${LB.escapeHtml(s)}</span>`);
    });

    return text;
  };
})();
