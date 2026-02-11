(function () {
    if (window.__sr_hooked) return;
    window.__sr_hooked = true;

    window.__sr_api_cache = { readings: null, bookmarks: null };
    const TARGET_PATH_1 = 'api/readings';
    const TARGET_PATH_2 = 'api/bookmarks';

    function relay(url, json) {
        if (!json || !json.success) return;
        if (url.includes(TARGET_PATH_1)) window.__sr_api_cache.readings = json;
        if (url.includes(TARGET_PATH_2)) window.__sr_api_cache.bookmarks = json;

        window.postMessage({
            source: '__sr_api',
            url: url,
            payload: JSON.stringify(json)
        }, '*');
    }

    // --- Hook Fetch ---
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const resp = await origFetch.apply(this, args);
        try {
            const url = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
            if (url.includes(TARGET_PATH_1) || url.includes(TARGET_PATH_2)) {
                const clone = resp.clone();
                const json = await clone.json();
                relay(url, json);
            }
        } catch (e) { }
        return resp;
    };

    // --- Hook XHR ---
    // QUAN TRỌNG: CHỈ hook 'open', KHÔNG ĐỤNG VÀO 'send'!
    // Việc thay thế send bằng wrapper function sẽ phá vỡ CORS của Pusher/Socket.
    // Thay vào đó, gắn listener ngay trong open nếu URL khớp.

    const origOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        // Debug: Log tất cả XHR requests
        if (typeof url === 'string' && url.includes('api')) {
            console.log('[StoryRescue Interceptor] XHR URL:', url);
        }

        // Chỉ gắn listener nếu đúng API truyện
        if (typeof url === 'string' &&
            (url.includes(TARGET_PATH_1) || url.includes(TARGET_PATH_2))) {

            console.log('[StoryRescue Interceptor] ✅ Matched target URL:', url);
            const capturedUrl = url; // Capture URL cho closure
            this.addEventListener('load', function () {
                try {
                    if (this.responseText) {
                        relay(capturedUrl, JSON.parse(this.responseText));
                    }
                } catch (e) { }
            });
        }

        // Luôn gọi open gốc, không điều kiện
        return origOpen.apply(this, [method, url, ...rest]);
    };

    // XMLHttpRequest.prototype.send KHÔNG BỊ THAY ĐỔI -> Luôn là native function
    // -> Pusher/Socket sẽ hoạt động 100% bình thường

    // --- Communication ---
    window.addEventListener('message', (e) => {
        if (e.data?.source === '__sr_query_cache') {
            window.postMessage({ source: '__sr_cache_data', cache: JSON.stringify(window.__sr_api_cache) }, '*');
        }
    });

    console.log('[StoryRescue] Interceptor v7 (Zero-Send) Active ✓');
})();
