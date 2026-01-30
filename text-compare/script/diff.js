(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.mergeAdjacentSpans = function mergeAdjacentSpans(html, cls) {
    const re = new RegExp(
      `<span class="${cls}">([^<]*)</span>(\\s*)<span class="${cls}">([^<]*)</span>`,
      "g"
    );
    let merged = html;
    while (re.test(merged)) {
      merged = merged.replace(re, `<span class="${cls}">$1$2$3</span>`);
    }
    return merged;
  };

  TC.compareCharacters = function compareCharacters(word1, word2) {
    let prefixEnd = 0;
    while (
      prefixEnd < Math.min(word1.length, word2.length) &&
      word1[prefixEnd] === word2[prefixEnd]
    ) {
      prefixEnd++;
    }

    let suffixStart1 = word1.length;
    let suffixStart2 = word2.length;
    while (
      suffixStart1 > prefixEnd &&
      suffixStart2 > prefixEnd &&
      word1[suffixStart1 - 1] === word2[suffixStart2 - 1]
    ) {
      suffixStart1--;
      suffixStart2--;
    }

    const prefix = word1.substring(0, prefixEnd);
    const suffix1 = word1.substring(suffixStart1);
    const suffix2 = word2.substring(suffixStart2);

    const middle1 = word1.substring(prefixEnd, suffixStart1);
    const middle2 = word2.substring(prefixEnd, suffixStart2);

    let result1 = prefix;
    let result2 = prefix;

    if (middle1) result1 += `<span class="removed">${middle1}</span>`;
    if (middle2) result2 += `<span class="added">${middle2}</span>`;

    result1 += suffix1;
    result2 += suffix2;

    return { word1: result1, word2: result2 };
  };

  TC.compareWordsInLines = function compareWordsInLines(line1, line2) {
    const words1 = String(line1 || "").split(/(\s+)/);
    const words2 = String(line2 || "").split(/(\s+)/);

    let result1 = "";
    let result2 = "";
    const maxWords = Math.max(words1.length, words2.length);

    for (let i = 0; i < maxWords; i++) {
      const w1 = words1[i] || "";
      const w2 = words2[i] || "";

      if (w1 === w2) {
        result1 += w1;
        result2 += w2;
      } else if (!w1) {
        result2 += `<span class="added">${w2}</span>`;
      } else if (!w2) {
        result1 += `<span class="removed">${w1}</span>`;
      } else if (w1.trim() && w2.trim()) {
        const cd = TC.compareCharacters(w1, w2);
        result1 += cd.word1;
        result2 += cd.word2;
      } else {
        result1 += w1;
        result2 += w2;
      }
    }

    result1 = TC.mergeAdjacentSpans(result1, "removed");
    result2 = TC.mergeAdjacentSpans(result2, "added");

    return { line1: result1, line2: result2 };
  };

  TC.compareJsonLine = function compareJsonLine(line1, line2) {
    const keyRegex = /^(\s*"[^"]+"\s*:\s*)(.*)$/;
    const m1 = String(line1 || "").match(keyRegex);
    const m2 = String(line2 || "").match(keyRegex);

    if (m1 && m2 && m1[1] === m2[1]) {
      const keyPart = m1[1];
      const v1 = m1[2];
      const v2 = m2[2];

      if (v1 === v2) return { line1, line2 };

      return {
        line1: keyPart + `<span class="removed">${v1}</span>`,
        line2: keyPart + `<span class="added">${v2}</span>`,
      };
    }

    return TC.compareWordsInLines(line1, line2);
  };

  TC.isSimilar = function isSimilar(a, b) {
    if (!a || !b) return false;

    const trimA = String(a).trim();
    const trimB = String(b).trim();

    if (trimA === trimB) return true;

    // JSON key pattern
    const keyRegex = /^(\s*"[^"]+"\s*:\s*)(.*)$/;
    const m1 = trimA.match(keyRegex);
    const m2 = trimB.match(keyRegex);
    if (m1 && m2 && m1[1] === m2[1]) return true;

    // JSON braces
    if (/^\s*[{}[\]]\s*,?$/.test(trimA) && /^\s*[{}[\]]\s*,?$/.test(trimB)) return true;

    // Similarity score (strict)
    const similarity = TC.calculateSimilarity(trimA, trimB);
    return similarity > 0.9;
  };

  TC.escapeHtml = function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };
})();
