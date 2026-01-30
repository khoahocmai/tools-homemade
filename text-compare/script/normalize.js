(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.safeParseJSON = function safeParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch (_) {
      return null;
    }
  };

  // If valid JSON -> pretty format. If not -> lightweight normalization for text diff.
  TC.normalizeJson = function normalizeJson(str) {
    const obj = TC.safeParseJSON(str);
    if (obj !== null) {
      return JSON.stringify(obj, null, 2);
    }
    return String(str || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+$/gm, "")
      .trimEnd();
  };

  // (Not currently used in the UI, but kept from original)
  TC.normalizeCode = function normalizeCode(str, indentSize = 2) {
    str = TC.normalizeLineEndings(str).trimStart();
    const lines = str.split(/\n/);
    if (lines.length > 0 && lines[0].trim() === "") lines.shift();

    let level = 0;
    const result = [];

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("}")) level = Math.max(0, level - 1);

      const indent = " ".repeat(level * indentSize);
      result.push(indent + line);

      if (line.endsWith("{")) level++;
    }
    return result.join("\n");
  };
})();
