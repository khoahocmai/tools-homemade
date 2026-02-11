// lib/link_checker.js - Check URL alive & search by name

import { createSlug } from './url_utils.js';

export async function checkUrlAlive(url) {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(id);

        if (res.status === 404) return 'dead';
        if (res.status === 403 || res.status === 503 || res.status === 502) return 'blocked';
        if (!res.ok) return 'dead';

        const origPath = new URL(url).pathname.replace(/\/$/, "");
        const finalPath = new URL(res.url).pathname.replace(/\/$/, "");
        const hostname = new URL(res.url).hostname;

        // Check redirect to 404 page (TangThuVien case)
        if (finalPath.includes("/404") || finalPath === "/404") return 'dead';

        // Check redirect to search page (TruyenAudioCV case)
        if (hostname.includes('truyenaudiocv.org') && res.url.includes('chi-google-tim-kiem')) {
            return 'dead';
        }

        if (origPath !== finalPath) {
            if (finalPath === "" || finalPath === "/" || finalPath.includes("danh-sach")) return 'dead';
        }

        const text = (await res.text()).toLowerCase();
        // Từ khóa lỗi phổ biến (Chung)
        if (text.includes("khÃ´ng tÃ¬m tháº¥y") ||
            text.includes("không tìm thấy") ||
            text.includes("404 not found") ||
            text.includes("trang này không tồn tại") ||
            text.includes("<title>không tìm thấy") ||
            text.includes("<title>404")) {
            return 'dead';
        }

        // Check lỗi đặc thù (Site Specific)
        if (text.includes("truy cập diễn đàn bạch ngọc sách") ||
            text.includes("đi đến bạch ngọc sách") ||
            text.includes("khám phá những bộ truyện hấp dẫn tại diễn đàn") ||
            text.includes("bnsach.com") ||  // BNS redirect to different domain
            text.includes("hệ thống chưa kịp xử lí") ||
            text.includes("yêu cầu của bạn hệ thống") ||
            text.includes("truyện không tồn tại") || // TruyenAudioCV text
            text.includes("error-page-container") || // TruyenAudioCV class
            text.includes("error-template") ||       // TruyenAudioCV class
            text.includes("chi-google-tim-kiem")) {  // TruyenAudioCV redirect/canonical
            return 'dead';
        }

        return 'ok';
    } catch (e) { return 'blocked'; }
}

// Helper: fetch với timeout
async function fetchWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) return null;
        return await res.text();
    } catch (e) {
        clearTimeout(id);
        return null;
    }
}

// Tìm kiếm từ một site cụ thể
async function searchChivi(storyName) {
    try {
        const url = `https://chivi.app/wn/books?bt=${encodeURIComponent(storyName)}`;

        const html = await fetchWithTimeout(url, 15000);
        if (!html) {
            return null;
        }

        const match = html.match(/href="(\/wn\/books\/[A-Za-z0-9_-]+)"/);
        if (match) {
            const fullUrl = `https://chivi.app${match[1]}`;
            return { url: fullUrl, status: 'ok', site: 'chivi.app' };
        }
    } catch (e) {
        // silent error
    }
    return null;
}

async function searchTiemTruyenChu(storyName) {
    try {
        const url = `https://www.tiemtruyenchu.com/danh-sach?keyword=${encodeURIComponent(storyName)}`;

        const html = await fetchWithTimeout(url, 15000);
        if (!html) {
            return null;
        }

        const match = html.match(/href="(\/truyen\/\d+)"/);
        if (match) {
            const fullUrl = `https://www.tiemtruyenchu.com${match[1]}`;
            return { url: fullUrl, status: 'ok', site: 'tiemtruyenchu.com' };
        }
    } catch (e) {
        // silent error
    }
    return null;
}

async function searchSangTacViet(storyName) {
    try {
        // Use API endpoint instead of main page (which uses client-side rendering)
        const url = `https://sangtacviet.app/io/searchtp/searchBooks?find=&findinname=${encodeURIComponent(storyName)}`;

        const html = await fetchWithTimeout(url, 15000);
        if (!html) {
            return null;
        }

        // Support both single and double quotes
        // Fixed: removed space in /truyen/
        const patterns = [
            /class=['"'][^'"]*booksearch[^'"]*['"][^>]*href=['"](\/truyen\/[^'"]+)['"]/,
            /href=['"](\/truyen\/[^\/"'\s]+\/[^\/"'\s]+\/[^\/"'\s]+\/)['"]/,
            /href=['"](\/truyen\/[^'"]+)['"]/
        ];

        for (let i = 0; i < patterns.length; i++) {
            const match = html.match(patterns[i]);
            if (match) {
                const fullUrl = `https://sangtacviet.app${match[1]}`;
                return { url: fullUrl, status: 'ok', site: 'sangtacviet.app' };
            }
        }

    } catch (e) {
        // silent error
    }
    return null;
}

// Check một direct link (slug-based)
async function checkDirectLink(url) {
    const status = await checkUrlAlive(url);
    const site = new URL(url).hostname.replace('www.', '');
    if (status === 'ok' || status === 'blocked') {
        return { url, status, site };
    }
    return null;
}

/**
 * Tìm kiếm SONG SONG tất cả sources
 * - Direct links (slug-based) chạy song song
 * - Search by name (parse HTML) chạy song song
 * - Tất cả chạy cùng lúc với Promise.allSettled
 */
export async function findAllCandidates(storyName) {
    const slug = createSlug(storyName);

    // Direct sites (slug-based)
    const directSites = [
        `https://xtruyen.vn/truyen/${slug}`,
        `https://metruyenchu.com.vn/${slug}`,
        `https://tangthuvien.net/doc-truyen/${slug}`,
        `https://truyenchuth.info/truyen-${slug}`,
        `https://truyenaudiocv.org/${slug}`,
        `https://bachngocsach.com.vn/truyen/${slug}`
    ];

    // Tạo array tất cả promises: Direct + Search
    const allPromises = [
        // Direct links - mỗi link 1 promise
        ...directSites.map(url => checkDirectLink(url)),
        // Search by name - mỗi site 1 promise
        searchChivi(storyName),
        searchTiemTruyenChu(storyName),
        searchSangTacViet(storyName),
    ];

    // Chạy TẤT CẢ SONG SONG
    const results = await Promise.allSettled(allPromises);

    // Gom kết quả, bỏ null/rejected, tránh trùng URL
    const candidates = [];
    const seenUrls = new Set();

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            const candidate = result.value;
            if (!seenUrls.has(candidate.url)) {
                candidates.push(candidate);
                seenUrls.add(candidate.url);
            }
        }
    }

    return candidates;
}
