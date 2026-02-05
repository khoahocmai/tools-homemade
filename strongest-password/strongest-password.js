(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "strongest_password_v7"; // NEW behavior: sequential unlock from 1

  const pad2 = (n) => String(n).padStart(2, "0");
  const today = new Date();
  const dd = pad2(today.getDate());
  const mm = pad2(today.getMonth() + 1);
  const todayDDMM = `${dd}${mm}`;
  $("todayText").textContent = `${dd}/${mm}`;

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.style.display = "none", 1400);
  }

  function stripDiacritics(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function parseParts(pw) {
    const parts = pw.split("-");
    return {
      parts,
      p1: parts[0] ?? "",
      p2: parts[1] ?? "",
      p3: parts.slice(2).join("-") ?? ""
    };
  }

  function sumDigits(str) {
    const digits = (str.match(/\d/g) || []).map(d => Number(d));
    return digits.reduce((a, b) => a + b, 0);
  }

  function countDigits(str) {
    return (str.match(/\d/g) || []).length;
  }

  function hasVietnameseDiacritics(str) {
    return stripDiacritics(str) !== str;
  }

  function hasNoTripleRepeat(str) {
    return !/(.)\1\1/.test(str);
  }

  function hasConsecutivePair(str) {
    for (let i = 0; i <= 8; i++) {
      if (str.includes(String(i) + String(i + 1))) return true;
    }
    return false;
  }


  function isPrime(n) {
    n = Math.floor(Number(n));
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    const r = Math.floor(Math.sqrt(n));
    for (let i = 3; i <= r; i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  }

  function countVowels(str) {
    // strip accents so "á/à/â/ă/..." count as "a"
    const s = stripDiacritics(String(str).toLowerCase());
    const m = s.match(/[aeiou]/g) || [];
    return m.length;
  }

  function distinctSpecials(str) {
    const arr = (String(str).match(/[^A-Za-z0-9\s]/g) || []);
    return Array.from(new Set(arr));
  }

  function hasBracketPair(str) {
    const s = String(str);
    // any of these pairs in correct order, with or without content inside
    return /\([^\)]*\)/.test(s) || /\[[^\]]*\]/.test(s) || /\{[^}]*\}/.test(s) || /<[^>]*>/.test(s);
  }

  function hasSharedBigram(a, b) {
    const s1 = stripDiacritics(String(a).toLowerCase());
    const s2 = stripDiacritics(String(b).toLowerCase());
    // build all 2-char substrings from s1 (letters only)
    const t1 = s1.replace(/[^a-z]/g, "");
    const t2 = s2.replace(/[^a-z]/g, "");
    const set = new Set();
    for (let i = 0; i < t1.length - 1; i++) {
      set.add(t1.slice(i, i + 2));
    }


    for (const bg of set) {
      if (bg.length === 2 && t2.includes(bg)) return bg;
    }
    return "";
  }

  function countLettersAll(str) {
    const s = String(str);
    try {
      return (s.match(/\p{L}/gu) || []).length; // unicode letters
    } catch {
      return (s.match(/[A-Za-z]/g) || []).length; // fallback
    }
  }

  function hasAlphabetRun3(str) {
    const s = stripDiacritics(String(str).toLowerCase()).replace(/[^a-z]/g, "");
    for (let i = 0; i < s.length - 2; i++) {
      const a = s.charCodeAt(i);
      const b = s.charCodeAt(i + 1);
      const c = s.charCodeAt(i + 2);
      if (b === a + 1 && c === b + 1) return s.slice(i, i + 3);
    }
    return "";
  }

  function firstHexColor(str) {
    const m = String(str).match(/#[0-9a-fA-F]{6}/);
    return m ? m[0] : "";
  }

  function reverse2(s) {
    return String(s).split("").reverse().join("");
  }

  function hasBracketWithTwoDigits(str) {
    const s = String(str);
    return /\(\d{2}\)/.test(s) || /\[\d{2}\]/.test(s) || /\{\d{2}\}/.test(s) || /<\d{2}>/.test(s);
  }



  const animals = ["nai", "meo", "cho", "ga", "heo", "bo", "vit", "ca", "rua", "khi", "ho", "su tu", "sutu", "huou", "voi"];

  // ===== RULE SET (40) =====
  const rules = [
    {
      id: "len10", title: "Ít nhất 10 ký tự", hint: "Gõ chuỗi dài trước rồi tối ưu sau.", check: (pw) => {
        const ok = pw.length >= 10;
        return { ok, msg: ok ? `Đang có ${pw.length} ký tự.` : `Hiện có ${pw.length}/10 ký tự.` };
      }
    },
    {
      id: "upper1", title: "Có ít nhất 1 chữ hoa (A–Z)", hint: "Thêm chữ hoa ở đầu: A… hoặc B…", check: (pw) => {
        const ok = /[A-Z]/.test(pw);
        return { ok, msg: ok ? "OK (có chữ hoa)." : "Chưa thấy chữ hoa." };
      }
    },
    {
      id: "lower1", title: "Có ít nhất 1 chữ thường (a–z)", hint: "Thêm chữ thường vào đâu đó (vd: a).", check: (pw) => {
        const ok = /[a-z]/.test(pw);
        return { ok, msg: ok ? "OK (có chữ thường)." : "Chưa thấy chữ thường." };
      }
    },
    {
      id: "digit1", title: "Có ít nhất 1 chữ số", hint: "Thêm số 0–9 bất kỳ.", check: (pw) => {
        const ok = /\d/.test(pw);
        return { ok, msg: ok ? "OK (có chữ số)." : "Chưa có chữ số nào." };
      }
    },
    {
      id: "special1", title: "Có ít nhất 1 ký tự đặc biệt (!@#$… hoặc -)", hint: "Dùng '-' để tách phần cho dễ ăn luật.", check: (pw) => {
        const ok = /[^A-Za-z0-9\s]/.test(pw);
        return { ok, msg: ok ? "OK (có ký tự đặc biệt)." : "Chưa có ký tự đặc biệt." };
      }
    },
    {
      id: "nospace", title: "Không có dấu cách", hint: "Xóa khoảng trắng (space).", check: (pw) => {
        const ok = !/\s/.test(pw);
        return { ok, msg: ok ? "OK (không có khoảng trắng)." : "Có khoảng trắng rồi." };
      }
    },
    {
      id: "sum10", title: "Tổng các chữ số ≥ 10", hint: "Ví dụ thêm 19 (1+9=10).", check: (pw) => {
        const s = sumDigits(pw);
        const ok = s >= 10;
        return { ok, msg: ok ? `Tổng chữ số = ${s}.` : `Tổng chữ số = ${s} (cần ≥ 10).` };
      }
    },
    {
      id: "animal", title: "Chứa 1 từ con vật (nai/mèo/chó/…)", hint: "Gợi ý dễ nhất: thêm “nai”.", check: (pw) => {
        const low = stripDiacritics(pw.toLowerCase());
        const ok = animals.some(a => low.includes(a.replace(/\s+/g, "")));
        return { ok, msg: ok ? "OK (thấy dấu hiệu con vật)." : "Chưa thấy tên con vật." };
      }
    },

    {
      id: "parts3", title: "Có cấu trúc 3 phần: Phần1-Phần2-Phần3", hint: "Thêm dấu '-' để tách thành 3 phần.", check: (pw) => {
        const { parts } = parseParts(pw);
        const ok = parts.length >= 3 && parts[0] && parts[1] && parts.slice(2).join("-");
        return { ok, msg: ok ? `OK (${parts[0]} - ${parts[1]} - ${parts.slice(2).join("-")}).` : "Chưa đủ 3 phần không rỗng." };
      }
    },
    {
      id: "p1_upper_start", title: "Phần 1 bắt đầu bằng chữ hoa", hint: "Ví dụ: Abc-...", check: (pw) => {
        const { p1 } = parseParts(pw);
        const ok = /^[A-Z]/.test(p1);
        return { ok, msg: ok ? `OK (Phần1 bắt đầu bằng ${p1[0]}).` : "Phần 1 chưa bắt đầu bằng chữ hoa." };
      }
    },
    {
      id: "p2_digits2", title: "Phần 2 có đúng 2 chữ số", hint: "Ví dụ: ...-12-...", check: (pw) => {
        const { p2 } = parseParts(pw);
        const ok = /^\d{2}$/.test(p2);
        return { ok, msg: ok ? "OK (Phần2 = 2 chữ số)." : `Phần2 hiện là "${p2}" (cần đúng 2 số).` };
      }
    },
    {
      id: "p2_consecutive", title: "2 chữ số ở Phần 2 phải là cặp liên tiếp (12,23,...)", hint: "Dễ nhất: ...-12-...", check: (pw) => {
        const { p2 } = parseParts(pw);
        const ok = /^\d{2}$/.test(p2) && hasConsecutivePair(p2);
        return { ok, msg: ok ? "OK (cặp số liên tiếp)." : "Phần2 chưa phải cặp số liên tiếp." };
      }
    },
    {
      id: "p3_has_viet", title: "Phần 3 có ít nhất 1 ký tự tiếng Việt có dấu", hint: "Thêm chữ có dấu: “đ, ơ, ư, á, ạ, …”.", check: (pw) => {
        const { p3 } = parseParts(pw);
        const ok = p3.length > 0 && hasVietnameseDiacritics(p3);
        return { ok, msg: ok ? "OK (Phần3 có dấu tiếng Việt)." : "Phần3 chưa có dấu tiếng Việt." };
      }
    },
    {
      id: "p3_viet2", title: "Phần 3 có ít nhất 2 ký tự có dấu", hint: "Ví dụ: “độ” có 2 ký tự có dấu.", check: (pw) => {
        const { p3 } = parseParts(pw);
        const marks = (p3.normalize("NFD").match(/[\u0300-\u036f]/g) || []).length;
        const ok = marks >= 2;
        return { ok, msg: ok ? `OK (có ${marks} dấu).` : `Mới có ${marks} dấu (cần ≥ 2).` };
      }
    },
    {
      id: "digits5", title: "Tổng cộng có ít nhất 5 chữ số", hint: "Bạn có thể thêm số vào Phần1 hoặc Phần3.", check: (pw) => {
        const c = countDigits(pw);
        const ok = c >= 5;
        return { ok, msg: ok ? `OK (có ${c} chữ số).` : `Mới có ${c}/5 chữ số.` };
      }
    },
    {
      id: "no_triple", title: "Không có ký tự lặp 3 lần liên tiếp (aaa/111/...)", hint: "Nếu có, hãy đổi 1 ký tự ở giữa.", check: (pw) => {
        const ok = hasNoTripleRepeat(pw);
        return { ok, msg: ok ? "OK (không có triple repeat)." : "Có ký tự bị lặp 3 lần liên tiếp." };
      }
    },

    {
      id: "len14", title: "Ít nhất 14 ký tự", hint: "Thêm vài ký tự vào Phần3.", check: (pw) => {
        const ok = pw.length >= 14;
        return { ok, msg: ok ? `OK (${pw.length} ký tự).` : `Hiện có ${pw.length}/14 ký tự.` };
      }
    },
    {
      id: "special2", title: "Có ≥ 2 ký tự đặc biệt (bao gồm '-')", hint: "Bạn đã có '-' rồi, thêm 1 ký tự như ! hoặc @.", check: (pw) => {
        const c = (pw.match(/[^A-Za-z0-9\s]/g) || []).length;
        const ok = c >= 2;
        return { ok, msg: ok ? `OK (${c} ký tự đặc biệt).` : `Mới có ${c}/2 ký tự đặc biệt.` };
      }
    },
    {
      id: "p3_special_not_dash", title: "Phần 3 có ký tự đặc biệt KHÁC '-'", hint: "Ví dụ: ...-...-độ! hoặc độ@.", check: (pw) => {
        const { p3 } = parseParts(pw);
        const ok = /[^A-Za-z0-9\s-]/.test(p3);
        return { ok, msg: ok ? "OK (Phần3 có ký tự đặc biệt khác '-')." : "Phần3 chưa có ký tự đặc biệt (khác '-')." };
      }
    },
    {
      id: "distinct_letters_6", title: "Có ít nhất 6 chữ cái KHÁC NHAU (A–Z/a–z)", hint: "Thêm vài chữ khác nhau (không chỉ lặp).", check: (pw) => {
        const letters = (pw.match(/[A-Za-z]/g) || []).map(ch => ch.toLowerCase());
        const uniq = new Set(letters);
        const ok = uniq.size >= 6;
        return { ok, msg: ok ? `OK (${uniq.size} chữ cái khác nhau).` : `Mới có ${uniq.size}/6 chữ cái khác nhau.` };
      }
    },
    {
      id: "p1_has_animal", title: "Tên con vật phải nằm ở Phần 1 hoặc Phần 3 (không nằm Phần2)", hint: "Đừng để con vật ở Phần2 (phần số).", check: (pw) => {
        const { p1, p2, p3 } = parseParts(pw);
        const low1 = stripDiacritics(p1.toLowerCase());
        const low2 = stripDiacritics(p2.toLowerCase());
        const low3 = stripDiacritics(p3.toLowerCase());
        const in1or3 = animals.some(a => low1.includes(a.replace(/\s+/g, "")) || low3.includes(a.replace(/\s+/g, "")));
        const in2 = animals.some(a => low2.includes(a.replace(/\s+/g, "")));
        const ok = in1or3 && !in2;
        return { ok, msg: ok ? "OK (con vật đúng vị trí)." : "Hãy để con vật ở Phần1 hoặc Phần3 (tránh Phần2)." };
      }
    },
    {
      id: "today_ddmm", title: `Chứa “mã hôm nay” (DDMM) = ${todayDDMM}`, hint: `Thêm ${todayDDMM} vào Phần1 hoặc Phần3.`, check: (pw) => {
        const ok = pw.includes(todayDDMM);
        return { ok, msg: ok ? `OK (đã có ${todayDDMM}).` : `Chưa thấy ${todayDDMM}.` };
      }
    },
    {
      id: "p1_len3", title: "Phần 1 có ít nhất 3 ký tự chữ (A–Z/a–z)", hint: "Ví dụ: Abc-...", check: (pw) => {
        const { p1 } = parseParts(pw);
        const letters = (p1.match(/[A-Za-z]/g) || []).length;
        const ok = letters >= 3;
        return { ok, msg: ok ? "OK (Phần1 đủ chữ)." : `Phần1 mới có ${letters}/3 chữ cái.` };
      }
    },
    {
      id: "p3_has_brand", title: "Phần 3 phải có chữ 'AI' hoặc 'DXP' (tùy bạn)", hint: "Ví dụ: ...-...-độAI! hoặc ...DXP...", check: (pw) => {
        const { p3 } = parseParts(pw);
        const ok = /AI/i.test(p3) || /DXP/i.test(p3);
        return { ok, msg: ok ? "OK (đã có AI/DXP)." : "Phần3 chưa có AI hoặc DXP." };
      }
    },

    {
      id: "bracket_pair", title: "Có ít nhất 1 cặp ngoặc cân: (), [], {} hoặc <>", hint: "Ví dụ: thêm (ok) hoặc [x] vào bất kỳ phần nào.", check: (pw) => {
        const ok = hasBracketPair(pw);
        return { ok, msg: ok ? "OK (đã có cặp ngoặc)." : "Chưa có cặp ngoặc cân như (..), [..], {..} hoặc <..>." };
      }
    },
    {
      id: "vowels6", title: "Có ≥ 6 nguyên âm (a/e/i/o/u) (tính cả chữ có dấu)", hint: "Thêm vài nguyên âm vào Phần3, ví dụ: 'aoiue'.", check: (pw) => {
        const c = countVowels(pw);
        const ok = c >= 6;
        return { ok, msg: ok ? `OK (có ${c} nguyên âm).` : `Mới có ${c}/6 nguyên âm.` };
      }
    },
    {
      id: "sum_prime", title: "Tổng các chữ số phải là số nguyên tố", hint: "Đổi/Thêm 1 chữ số để tổng thành 11, 13, 17, 19, 23, 29...", check: (pw) => {
        const s = sumDigits(pw);
        const ok = isPrime(s);
        return { ok, msg: ok ? `OK (tổng chữ số = ${s} là số nguyên tố).` : `Tổng chữ số = ${s} (chưa phải số nguyên tố).` };
      }
    },
    {
      id: "special_distinct3", title: "Có ≥ 3 ký tự đặc biệt KHÁC NHAU (bao gồm '-')", hint: "Ví dụ: dùng '-', '!', '@' (3 loại).", check: (pw) => {
        const list = distinctSpecials(pw);
        const ok = list.length >= 3;
        const show = list.length ? list.join(" ") : "(chưa có)";
        return { ok, msg: ok ? `OK (${list.length} loại: ${show}).` : `Mới có ${list.length}/3 loại ký tự đặc biệt: ${show}.` };
      }
    },
    {
      id: "p1_upper_exact2", title: "Phần 1 có đúng 2 chữ hoa và KHÔNG được đứng liền nhau", hint: "Ví dụ: 'AbcD...' (A và D không liền).", check: (pw) => {
        const { p1 } = parseParts(pw);
        const uppers = (p1.match(/[A-Z]/g) || []).length;
        const adjacent = /[A-Z]{2}/.test(p1);
        const ok = uppers === 2 && !adjacent;
        return { ok, msg: ok ? "OK (Phần1 có đúng 2 chữ hoa, không liền nhau)." : `Phần1: có ${uppers} chữ hoa, liền nhau? ${adjacent ? "có" : "không"}.` };
      }
    },
    {
      id: "p1_p3_share2", title: "Phần 1 và Phần 3 phải có chung ít nhất 1 cặp 2 chữ cái liên tiếp", hint: "Dễ nhất: copy 2 chữ bất kỳ từ Phần1 sang Phần3 (vd: 'ab').", check: (pw) => {
        const { p1, p3 } = parseParts(pw);
        const bg = hasSharedBigram(p1, p3);
        const ok = !!bg;
        return { ok, msg: ok ? `OK (trùng cặp chữ "${bg}").` : "Chưa thấy cặp 2 chữ cái liên tiếp nào trùng giữa Phần1 và Phần3." };
      }
    },
    {
      id: "p3_upper_triplet", title: "Phần 3 có 3 chữ hoa liên tiếp (VD: DXP)", hint: "Nếu đã có 'DXP' thì rule này tự ăn.", check: (pw) => {
        const { p3 } = parseParts(pw);
        const ok = /[A-Z]{3}/.test(p3);
        return { ok, msg: ok ? "OK (Phần3 có 3 chữ hoa liên tiếp)." : "Phần3 chưa có 3 chữ hoa liên tiếp." };
      }
    },
    {
      id: "p3_checksum_last", title: "Phần 3 phải kết thúc bằng chữ CHECKSUM = (tổng chữ số mod 26) → A–Z", hint: "Nhìn message để biết chữ cần kết thúc. Ví dụ nếu cần 'K' thì để ...K ở cuối Phần3.", check: (pw) => {
        const { p3 } = parseParts(pw);
        const s = sumDigits(pw);
        const need = String.fromCharCode(65 + (s % 26));
        const last = (p3 || "").slice(-1);
        const ok = !!last && last.toUpperCase() === need;
        return { ok, msg: ok ? `OK (CHECKSUM = ${need}).` : `CHECKSUM cần = ${need}. Hiện cuối Phần3 = "${last || "∅"}".` };
      }
    },

    {
      id: "hyphen_exact2",
      title: "Có đúng 2 dấu '-' (chỉ 3 phần, không có '-' trong Phần3)",
      hint: "Chỉ dùng 2 dấu '-' để tách: Phần1-Phần2-Phần3. Đừng thêm '-' trong Phần3.",
      check: (pw) => {
        const c = (String(pw).match(/-/g) || []).length;
        const ok = c === 2;
        return { ok, msg: ok ? "OK (đúng 2 dấu '-')." : `Hiện có ${c} dấu '-' (cần đúng 2).` };
      }
    },
    {
      id: "p2_fibo_set",
      title: "Phần 2 phải là 1 trong các cặp Fibonacci: 12 / 23 / 34",
      hint: "Dễ nhất: đặt Phần2 = 12 (vì đã là cặp liên tiếp).",
      check: (pw) => {
        const { p2 } = parseParts(pw);
        const ok = ["12", "23", "34"].includes(String(p2));
        return { ok, msg: ok ? `OK (Phần2 = ${p2}).` : `Phần2 hiện = "${p2}" (cần 12/23/34).` };
      }
    },
    {
      id: "p3_has_rev_p2",
      title: "Phần 3 phải chứa phiên bản đảo của Phần2 (VD 12 → có '21')",
      hint: "Ví dụ: nếu Phần2 = 12 thì hãy thêm '21' vào Phần3.",
      check: (pw) => {
        const { p2, p3 } = parseParts(pw);
        const rev = reverse2(String(p2 || ""));
        const ok = rev.length === 2 && String(p3 || "").includes(rev);
        return { ok, msg: ok ? `OK (đã có "${rev}" trong Phần3).` : `Cần "${rev}" xuất hiện trong Phần3.` };
      }
    },
    {
      id: "letters_even",
      title: "Tổng số chữ cái (Unicode) trong toàn bộ mật khẩu phải là số CHẴN",
      hint: "Thêm/bớt 1 chữ cái để đổi chẵn/lẻ.",
      check: (pw) => {
        const c = countLettersAll(pw);
        const ok = c > 0 && c % 2 === 0;
        return { ok, msg: ok ? `OK (có ${c} chữ cái — chẵn).` : `Hiện có ${c} chữ cái (cần chẵn).` };
      }
    },
    {
      id: "alpha_run3",
      title: "Có 1 chuỗi 3 chữ cái tăng dần theo alphabet (abc/bcd/...; không phân biệt hoa/thường)",
      hint: "Dễ nhất: thêm 'abc' vào bất kỳ phần nào.",
      check: (pw) => {
        const run = hasAlphabetRun3(pw);
        const ok = !!run;
        return { ok, msg: ok ? `OK (tìm thấy "${run}").` : "Chưa thấy chuỗi 3 chữ tăng dần (vd: abc, bcd, cde...)." };
      }
    },
    {
      id: "hex_color",
      title: "Có 1 mã màu HEX dạng #RRGGBB (VD: #1a2B3c)",
      hint: "Thêm 1 chuỗi như #12abEF vào Phần3 cho dễ.",
      check: (pw) => {
        const hx = firstHexColor(pw);
        const ok = !!hx;
        return { ok, msg: ok ? `OK (đã có ${hx}).` : "Chưa thấy mã HEX dạng #RRGGBB." };
      }
    },
    {
      id: "p3_vowels_gt_p1",
      title: "Số nguyên âm trong Phần3 phải > Phần1 (a/e/i/o/u, tính cả chữ có dấu)",
      hint: "Thêm nguyên âm vào Phần3 (a o i u e...) hoặc bớt ở Phần1.",
      check: (pw) => {
        const { p1, p3 } = parseParts(pw);
        const v1 = countVowels(p1);
        const v3 = countVowels(p3);
        const ok = v3 > v1;
        return { ok, msg: ok ? `OK (P3=${v3} > P1=${v1}).` : `Hiện P3=${v3}, P1=${v1} (cần P3 > P1).` };
      }
    },
    {
      id: "bracket_digits2",
      title: "Phải có ngoặc chứa đúng 2 chữ số: (12) / [12] / {12} / <12>",
      hint: "Dễ nhất: chèn (12) hoặc [34] vào Phần3.",
      check: (pw) => {
        const ok = hasBracketWithTwoDigits(pw);
        return { ok, msg: ok ? "OK (đã có ngoặc chứa 2 chữ số)." : "Chưa thấy mẫu (12) / [12] / {12} / <12>." };
      }
    },

  ];

  // sequential unlock: 1 -> 2 -> 3 ...
  const START_VISIBLE = 1;

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { unlocked: START_VISIBLE, ever: {}, pw: "" };
      const s = JSON.parse(raw);
      return {
        unlocked: Math.max(START_VISIBLE, Math.min(rules.length, Number(s.unlocked || START_VISIBLE))),
        ever: (s.ever && typeof s.ever === "object") ? s.ever : {},
        pw: (typeof s.pw === "string") ? s.pw : ""
      };
    } catch {
      return { unlocked: START_VISIBLE, ever: {}, pw: "" };
    }
  }
  function saveState(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  const state = loadState();

  // DOM refs
  const pwEl = $("pw");
  const rulesEl = $("rules");
  const barFill = $("barFill");
  const passCountEl = $("passCount");
  const totalCountEl = $("totalCount");
  const totalCountEl2 = $("totalCount2");
  const unlockedCountEl = $("unlockedCount");
  const chipEl = $("chip");


  // Restore saved password so unlocked rules make sense.
  // If there is no saved password, reset progress to START_VISIBLE to avoid "rules without password".
  if (state.pw && typeof state.pw === "string") {
    pwEl.value = state.pw;
  } else {
    if (state.unlocked > START_VISIBLE) {
      state.unlocked = START_VISIBLE;
      state.ever = {};
    }
    state.pw = "";
    saveState(state);
  }

  totalCountEl.textContent = String(rules.length);
  totalCountEl2.textContent = String(rules.length);

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function allUnlockedOk(res, unlocked) {
    for (let i = 0; i < unlocked; i++) {
      if (!res[i].ok) return false;
    }
    return true;
  }

  function render() {
    const pw = pwEl.value || "";

    // compute rule results
    const res = rules.map((r) => {
      try {
        const out = r.check(pw);
        return { id: r.id, title: r.title, hint: r.hint, ok: !!out.ok, msg: out.msg || "" };
      } catch (e) {
        return { id: r.id, title: r.title, hint: r.hint, ok: false, msg: "Rule error." };
      }
    });

    // update ever-passed for currently visible rules
    for (const it of res.slice(0, state.unlocked)) {
      if (it.ok) state.ever[it.id] = true;
    }

    // Sequential unlocking:
    // Only unlock when ALL currently unlocked rules are OK.
    // If the password already satisfies multiple next rules, open them "in order" until the first failing rule.
    let advanced = 0;
    while (state.unlocked < rules.length) {
      if (allUnlockedOk(res, state.unlocked)) {
        state.unlocked++;
        advanced++;
      } else {
        break;
      }
    }
    if (advanced > 0) {
      toast(`🔓 Mở thêm ${advanced} luật!`);
    }

    // Persist password + progress together
    state.pw = pw;
    saveState(state);

    // Only count achieved rules among unlocked (avoid spoiler)
    let okUnlocked = 0;
    for (let i = 0; i < state.unlocked; i++) {
      if (res[i].ok) okUnlocked++;
    }

    // progress based on unlocked achievements toward total rules (no spoiler)
    const pct = rules.length ? Math.round((okUnlocked / rules.length) * 100) : 0;
    barFill.style.width = pct + "%";

    passCountEl.textContent = String(okUnlocked);
    unlockedCountEl.textContent = String(state.unlocked);
    chipEl.textContent = `👀 Đang hiện: ${state.unlocked} / ${rules.length}`;

    // render only unlocked rules (NO "next rule" preview)
    rulesEl.innerHTML = "";
    const showCount = state.unlocked;

    for (let i = 0; i < showCount; i++) {
      const it = res[i];
      const ever = !!state.ever[it.id];
      const item = document.createElement("div");
      item.className = "rule " + (it.ok ? "ok" : "bad") + (!it.ok && ever ? " regressed" : "");
      item.innerHTML = `
        <div class="icon">${it.ok ? "✅" : "❌"}</div>
        <div style="min-width:0">
          <div class="title">${escapeHtml(it.title)}</div>
          <div class="msg">${escapeHtml(it.msg)}</div>
        </div>
      `;
      rulesEl.appendChild(item);
    }
  }

  // Buttons
  $("clearBtn").addEventListener("click", () => {
    pwEl.value = "";
    // Clearing password should also reset progress (otherwise you get "rules with no password")
    state.pw = "";
    state.unlocked = START_VISIBLE;
    state.ever = {};
    saveState(state);
    toast("🧹 Đã xóa mật khẩu & reset về rule 1");
    render();
    pwEl.focus();
  });

  $("copyBtn").addEventListener("click", async () => {
    const pw = pwEl.value || "";
    let okUnlocked = 0;
    // compute again quickly
    const res = rules.map(r => ({ ok: !!r.check(pw).ok }));
    for (let i = 0; i < state.unlocked; i++) if (res[i].ok) okUnlocked++;

    const line = `Mật khẩu: ${pw}\nĐã đạt (trong các rule đã mở): ${okUnlocked}/${rules.length}\nĐang hiện: ${state.unlocked}/${rules.length}`;
    try {
      await navigator.clipboard.writeText(line);
      toast("✅ Đã copy!");
    } catch {
      toast("⚠️ Không copy được (trình duyệt chặn).");
    }
  });

  $("hintBtn").addEventListener("click", () => {
    const pw = pwEl.value || "";
    const res = rules.map(r => ({ ...r, out: r.check(pw) }));
    const firstFail = res.slice(0, state.unlocked).find(x => !x.out.ok);
    if (firstFail) {
      toast("💡 " + (firstFail.hint || "Thử chỉnh thêm ký tự."));
      return;
    }
    if (state.unlocked < rules.length) {
      toast("🔓 Bạn đang pass hết rule đang hiện — cứ gõ tiếp, rule sẽ tự mở.");
      return;
    }
    toast("🏆 Bạn đã đạt hết rồi!");
  });

  $("resetBtn").addEventListener("click", () => {
    localStorage.removeItem(KEY);
    pwEl.value = "";
    state.pw = "";
    state.unlocked = START_VISIBLE;
    state.ever = {};
    toast("↩️ Đã reset tiến độ!");
    render();
  });

  pwEl.addEventListener("input", render);

  // initial render
  render();
})();
