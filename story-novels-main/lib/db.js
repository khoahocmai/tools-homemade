// lib/db.js - Database helpers (chrome.storage.local)
import { normalizeUrl } from './url_utils.js';

const STORE_KEY = "story_rescue_db_v1";

export { STORE_KEY };

export async function loadDB() {
    const obj = await chrome.storage.local.get([STORE_KEY]);
    let db = obj[STORE_KEY] || { byLink: {}, updatedAt: Date.now() };

    // Tự động Migrate & Clean DB (Chống trùng lặp)
    let dirty = false;
    const cleanMap = {};

    for (const [key, val] of Object.entries(db.byLink)) {
        const cleanKey = normalizeUrl(key);

        // Cập nhật link bên trong object luôn cho đồng bộ
        if (val.old_link !== cleanKey) {
            val.old_link = cleanKey;
            dirty = true;
        }

        if (cleanMap[cleanKey]) {
            // Merge: Giữ lại cái nào xịn hơn
            const existing = cleanMap[cleanKey];
            if ((val.cur || 0) > (existing.cur || 0)) {
                cleanMap[cleanKey] = val; // Lấy cái mới hơn
            }
            dirty = true;
        } else {
            cleanMap[cleanKey] = val;
            if (cleanKey !== key) dirty = true;
        }
    }

    if (dirty) {
        console.log("[ServiceWorker] DB Migrated & Cleaned.");
        db.byLink = cleanMap;
        saveDB(db);
    }

    return db;
}

export async function saveDB(db) {
    db.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORE_KEY]: db });
}

export function upsertStories(db, items) {
    let updatedCount = 0;
    for (const it of items || []) {
        if (!it?.old_link) continue;

        // Luôn normalize key đầu vào
        const key = normalizeUrl(it.old_link);
        it.old_link = key; // Update item link

        const prev = db.byLink[key];
        const newCur = parseInt(it.cur) || 0;
        const oldCur = prev ? (parseInt(prev.cur) || 0) : -1;

        if (!prev || newCur >= oldCur) {
            db.byLink[key] = {
                name: it.name || (prev ? prev.name : "Truyện"),
                old_link: key,
                cur: Math.max(newCur, oldCur),
                total: parseInt(it.total) || (prev ? prev.total : 0),
                img: it.img || (prev ? prev.img : ""),
                new_link: it.new_link ?? (prev ? prev.new_link : ""),
                author_name: it.author_name || (prev ? (prev.author_name || "") : ""),
                author_local: it.author_local || (prev ? (prev.author_local || "") : "")
            };
            updatedCount++;
        }
    }
    console.log(`[ServiceWorker] Upserted items. Total: ${Object.keys(db.byLink).length}`);
}
