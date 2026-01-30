(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.normalizeTextForSimilarity = function normalizeTextForSimilarity(s) {
    return (s || "")
      .toLowerCase()
      .replace(/\r\n|\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, "\n")
      .trim();
  };

  TC.levenshteinDistance = function levenshteinDistance(str1, str2) {
    const a = String(str1 || "");
    const b = String(str2 || "");
    const m = a.length;
    const n = b.length;

    // Use a 2-row DP for memory.
    const prev = new Uint32Array(n + 1);
    const curr = new Uint32Array(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      const ai = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
        const del = prev[j] + 1;
        const ins = curr[j - 1] + 1;
        const sub = prev[j - 1] + cost;
        curr[j] = Math.min(del, ins, sub);
      }
      prev.set(curr);
    }
    return prev[n];
  };

  TC.calculateSimilarity = function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;
    const maxLen = Math.max(str1.length, str2.length);
    const distance = TC.levenshteinDistance(str1, str2);
    return (maxLen - distance) / maxLen;
  };

  TC.similarityPercentByLevenshtein = function similarityPercentByLevenshtein(a, b) {
    const A = TC.normalizeTextForSimilarity(a);
    const B = TC.normalizeTextForSimilarity(b);
    if (!A && !B) return 100;
    if (!A || !B) return 0;

    const maxLen = Math.max(A.length, B.length);
    const dist = TC.levenshteinDistance(A, B);
    const sim = 1 - dist / maxLen;
    return Math.max(0, Math.min(100, Math.round(sim * 100)));
  };
})();
