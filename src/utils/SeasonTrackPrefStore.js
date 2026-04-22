/*
 * SeasonTrackPrefStore — LRU-bounded persistence for per-season audio/sub picks.
 *
 * Scoped triple (serverUrl, userId, seasonId) so preferences don't bleed across
 * servers or users sharing a TV. Entries are keyed in localStorage as
 *   `player:trackPref:v1|<serverUrl>|<userId>|<seasonId>`
 * and tracked in a newest-first index at `player:trackPref:index`. When the
 * index exceeds the cap, the oldest entries are dropped from both the index
 * and storage, so an active library of hundreds of seasons won't inflate
 * localStorage indefinitely.
 *
 * A stale fingerprint (server re-encoded the season, stream layout changed)
 * is self-healing: findMatchingStream fails to match, callers fall back to
 * the server default, and the next explicit user pick overwrites the entry.
 */

import { storage } from './StorageService.js';
import { logger } from './Logger.js';

const log = logger.child('SeasonTrackPref');

const KEY_PREFIX = 'player:trackPref:v1|';
const INDEX_KEY = 'player:trackPref:index';
const DEFAULT_CAP = 50;

function buildKey(serverUrl, userId, seasonId) {
    return `${KEY_PREFIX}${serverUrl}|${userId}|${seasonId}`;
}

function readIndex() {
    try {
        const raw = storage.getItem(INDEX_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (err) {
        log.warn('Index parse failed, resetting:', err.message);
        return [];
    }
}

function writeIndex(arr) {
    try {
        storage.setItem(INDEX_KEY, JSON.stringify(arr));
    } catch (err) {
        log.warn('Index write failed:', err.message);
    }
}

/**
 * Load the persisted preference for one (serverUrl, userId, seasonId).
 * Returns `{ audio, subtitle, updatedAt }` or null if none exists or the
 * stored blob is malformed. `subtitle` may be the string 'disabled' to
 * represent an explicit "subtitles off" choice.
 */
export function loadSeasonPref(serverUrl, userId, seasonId) {
    if (!serverUrl || !userId || !seasonId) return null;
    const key = buildKey(serverUrl, userId, seasonId);
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return null;
        return obj;
    } catch (err) {
        log.warn('Pref parse failed, removing corrupt entry:', key);
        storage.removeItem(key);
        return null;
    }
}

/**
 * Upsert a season preference and bump it to the front of the LRU index.
 * `pref` must have at least one of { audio, subtitle }; passing null for a
 * field leaves that channel unchanged (merged with existing saved entry).
 * Returns the merged entry that was written, or null on failure.
 */
export function saveSeasonPref(serverUrl, userId, seasonId, pref, { cap = DEFAULT_CAP } = {}) {
    if (!serverUrl || !userId || !seasonId) return null;
    if (!pref || (pref.audio == null && pref.subtitle == null)) return null;

    const key = buildKey(serverUrl, userId, seasonId);
    const existing = loadSeasonPref(serverUrl, userId, seasonId) || {};

    const merged = {
        audio: pref.audio !== undefined ? pref.audio : (existing.audio ?? null),
        subtitle: pref.subtitle !== undefined ? pref.subtitle : (existing.subtitle ?? null),
        updatedAt: Date.now()
    };

    try {
        storage.setItem(key, JSON.stringify(merged));
    } catch (err) {
        log.warn('Pref write failed:', err.message);
        return null;
    }

    // LRU index: remove key if already present, push to front, trim tail.
    const idx = readIndex();
    const filtered = idx.filter((k) => k !== key);
    filtered.unshift(key);

    if (filtered.length > cap) {
        const evicted = filtered.splice(cap);
        for (const ek of evicted) storage.removeItem(ek);
        log.info(`Evicted ${evicted.length} oldest season pref entries (cap=${cap})`);
    }

    writeIndex(filtered);
    return merged;
}

/**
 * Drop every persisted entry for (serverUrl, userId). Call on logout.
 * Other users' entries on the same server stay put.
 */
export function clearSeasonPrefsForUser(serverUrl, userId) {
    if (!serverUrl || !userId) return;
    const prefix = `${KEY_PREFIX}${serverUrl}|${userId}|`;
    const idx = readIndex();
    const kept = [];
    let dropped = 0;
    for (const k of idx) {
        if (k.startsWith(prefix)) {
            storage.removeItem(k);
            dropped += 1;
        } else {
            kept.push(k);
        }
    }
    writeIndex(kept);
    if (dropped > 0) log.info(`Cleared ${dropped} season pref entries for user`);
}
