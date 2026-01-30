(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  // Fast line-by-line diff with small "shift" tolerance.
  TC.performSimpleLineDiff = function performSimpleLineDiff(lines1, lines2) {
    const result1 = [];
    const result2 = [];
    const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };

    for (let i = 0, j = 0; i < lines1.length || j < lines2.length;) {
      const line1 = lines1[i] || "";
      const line2 = lines2[j] || "";

      if (!line1 && line2) {
        result1.push({ content: "", type: "missing" });
        result2.push({ content: line2, type: "added" });
        stats.added++;
        j++;
        continue;
      }

      if (line1 && !line2) {
        result1.push({ content: line1, type: "removed" });
        result2.push({ content: "", type: "missing" });
        stats.removed++;
        i++;
        continue;
      }

      if (line1.trim() === line2.trim()) {
        result1.push({ content: line1, type: "unchanged" });
        result2.push({ content: line2, type: "unchanged" });
        i++;
        j++;
        stats.unchanged++;
        continue;
      }

      // Try to find a near shift within +/-2 lines.
      let foundShift = false;
      for (let offset = 1; offset <= 2; offset++) {
        if (j + offset < lines2.length && TC.isSimilar(line1, lines2[j + offset])) {
          for (let k = 0; k < offset; k++) {
            result1.push({ content: "", type: "missing" });
            result2.push({ content: lines2[j + k], type: "added" });
            stats.added++;
          }
          result1.push({ content: line1, type: "unchanged" });
          result2.push({ content: lines2[j + offset], type: "unchanged" });
          i++;
          j += offset + 1;
          stats.unchanged++;
          foundShift = true;
          break;
        }

        if (i + offset < lines1.length && TC.isSimilar(lines1[i + offset], line2)) {
          for (let k = 0; k < offset; k++) {
            result1.push({ content: lines1[i + k], type: "removed" });
            result2.push({ content: "", type: "missing" });
            stats.removed++;
          }
          result1.push({ content: lines1[i + offset], type: "unchanged" });
          result2.push({ content: line2, type: "unchanged" });
          i += offset + 1;
          j++;
          stats.unchanged++;
          foundShift = true;
          break;
        }
      }
      if (foundShift) continue;

      const d = TC.compareJsonLine(line1, line2);
      result1.push({ content: d.line1, type: "modified" });
      result2.push({ content: d.line2, type: "modified" });
      stats.modified++;
      i++;
      j++;
    }

    return { result1, result2, stats };
  };

  // --- Advanced LCS alignment (kept for future use) ---
  function createDiffWorker() {
    const workerScript = `
self.onmessage = function(e) {
  const { lines1, lines2 } = e.data;
  const m = lines1.length;
  const n = lines2.length;
  const dp = new Uint32Array((m + 1) * (n + 1));
  const idx = (i, j) => i * (n + 1) + j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (lines1[i - 1] === lines2[j - 1]) dp[idx(i, j)] = dp[idx(i - 1, j - 1)] + 1;
      else dp[idx(i, j)] = Math.max(dp[idx(i - 1, j)], dp[idx(i, j - 1)]);
    }
  }
  const lcs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (lines1[i - 1] === lines2[j - 1]) { lcs.unshift({ i1: i - 1, i2: j - 1, line: lines1[i - 1] }); i--; j--; }
    else if (dp[idx(i - 1, j)] > dp[idx(i, j - 1)]) i--;
    else j--;
  }
  self.postMessage({ lcs });
};`;
    const blob = new Blob([workerScript], { type: "application/javascript" });
    return new Worker(URL.createObjectURL(blob));
  }

  function computeLCSFallback(lines1, lines2) {
    const m = lines1.length;
    const n = lines2.length;
    const dp = new Uint32Array((m + 1) * (n + 1));
    const idx = (i, j) => i * (n + 1) + j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (lines1[i - 1] === lines2[j - 1]) dp[idx(i, j)] = dp[idx(i - 1, j - 1)] + 1;
        else dp[idx(i, j)] = Math.max(dp[idx(i - 1, j)], dp[idx(i, j - 1)]);
      }
    }
    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (lines1[i - 1] === lines2[j - 1]) { lcs.unshift({ i1: i - 1, i2: j - 1, line: lines1[i - 1] }); i--; j--; }
      else if (dp[idx(i - 1, j)] > dp[idx(i, j - 1)]) i--;
      else j--;
    }
    return lcs;
  }

  TC.computeLCS = async function computeLCS(lines1, lines2) {
    const workerAvailable = !!window.Worker;
    if (workerAvailable && (lines1.length > 1000 || lines2.length > 1000)) {
      return new Promise((resolve) => {
        const w = createDiffWorker();
        w.onmessage = (e) => { const lcs = e.data.lcs || []; w.terminate(); resolve(lcs); };
        w.postMessage({ lines1, lines2 });
      });
    }
    return computeLCSFallback(lines1, lines2);
  };
})();
