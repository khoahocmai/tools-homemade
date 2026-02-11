// lib/url_utils.js - URL normalization & slug creation

// Hàm chuẩn hóa URL (Global)
export function normalizeUrl(url) {
    try {
        if (!url) return "";
        // Xử lý link tương đối
        if (!url.startsWith('http')) {
            if (url.startsWith('/')) url = 'https://metruyencv.com' + url;
            else url = 'https://metruyencv.com/' + url;
        }

        const u = new URL(url);

        // 1. Host: Ép thường, bỏ www
        let host = u.hostname.toLowerCase().replace(/^www\./, '');

        // 2. Protocol: Ép https
        const protocol = 'https:';

        // 3. Path: Bỏ trailing slash và query (u.pathname loại bỏ query)
        let path = u.pathname;
        if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);

        // Loại bỏ /chuong- để lấy link gốc truyện
        path = path.replace(/\/chuong-.*$/i, '');

        return `${protocol}//${host}${path}`;
    } catch (e) { return url; }
}

export function createSlug(str) {
    if (!str) return "";
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/[^a-z0-9\s]/g, '');
    return str.trim().replace(/\s+/g, '-');
}
