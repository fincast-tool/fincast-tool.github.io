const Redis = require('ioredis');

module.exports = async function handler(req, res) {
    const { action, params, data, email, key: tickerKey } = req.body || {};
    const redis = new Redis(process.env.KV_REDIS_URL || process.env.REDIS_URL);

    try {
        // --- USER MANAGEMENT ---
        if (action === 'get_users') {
            let users = await redis.get('terminal_users');
            let usersArray = users ? JSON.parse(users) : [];
            const adminEmail = process.env.ADMIN_EMAIL;
            const adminHash = process.env.ADMIN_PASSWORD_HASH;
            
            if (adminEmail && !usersArray.find(u => u.email === adminEmail)) {
                usersArray.push({
                    email: adminEmail, passwordHash: adminHash, firstName: 'Admin', lastName: 'System',
                    tier: 'premium', isAdmin: true, emailVerified: true, model: 'gemini-3.5-flash', createdAt: new Date().toISOString()
                });
                await redis.set('terminal_users', JSON.stringify(usersArray));
            }
            // Strip sensitive credentials (passwords, salts, verification tokens) before returning
            // Note: verificationCode and emailVerified are included so admin can inspect & unlock users in Master Control
            const safeUsers = usersArray.map(u => {
                const { password, passwordHash, salt, verificationToken, ...safe } = u;
                return {
                    ...safe,
                    emailVerified: u.emailVerified !== undefined ? u.emailVerified : true
                };
            });
            return res.status(200).json(safeUsers);
        }

        if (action === 'admin_verify_user') {
            const targetEmail = (req.body.email || email || '').trim().toLowerCase();
            const setVerified = req.body.verified !== undefined ? Boolean(req.body.verified) : true;

            let users = await redis.get('terminal_users');
            let usersArray = users ? JSON.parse(users) : [];
            const index = usersArray.findIndex(u => u.email === targetEmail);
            if (index > -1) {
                usersArray[index].emailVerified = setVerified;
                if (setVerified) {
                    usersArray[index].emailVerifiedAt = new Date().toISOString();
                    usersArray[index].verificationCode = null;
                    usersArray[index].verificationExpires = null;
                }
                await redis.set('terminal_users', JSON.stringify(usersArray));
                return res.status(200).json({ success: true, emailVerified: setVerified });
            }
            return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
        }

        if (action === 'save_user') {
            let users = await redis.get('terminal_users');
            let usersArray = users ? JSON.parse(users) : [];
            const index = usersArray.findIndex(u => u.email === data.email);
            if (index > -1) { 
                const existing = usersArray[index];
                usersArray[index] = { 
                    ...existing, 
                    ...data,
                    // Preserve existing credentials unless explicitly updated
                    password: existing.password,
                    passwordHash: existing.passwordHash,
                    emailVerified: data.emailVerified !== undefined ? data.emailVerified : (existing.emailVerified !== undefined ? existing.emailVerified : true)
                }; 
            } else { 
                usersArray.push({
                    tier: 'free',
                    isAdmin: false,
                    emailVerified: data.emailVerified !== undefined ? data.emailVerified : true,
                    model: 'gemini-3.5-flash',
                    ...data
                }); 
            }
            await redis.set('terminal_users', JSON.stringify(usersArray));
            return res.status(200).json({ success: true });
        }

        if (action === 'delete_user') {
            let users = await redis.get('terminal_users');
            let usersArray = users ? JSON.parse(users) : [];
            usersArray = usersArray.filter(u => u.email !== req.body.email);
            await redis.set('terminal_users', JSON.stringify(usersArray));
            return res.status(200).json({ success: true });
        }

        // --- QUERY TRACKING ---
        if (action === 'get_all_queries') {
            const keys = await redis.keys('queries:*');
            const allStats = {};
            for (const key of keys) {
                const userEmail = key.split(':')[1];
                const stats = await redis.get(key);
                const parsed = stats ? JSON.parse(stats) : { count: 0, counts: {} };
                const sumCounts = Object.values(parsed.counts || {}).reduce((a, b) => a + b, 0);
                const totalCount = Math.max(parsed.count || 0, sumCounts);
                allStats[userEmail] = {
                    count: totalCount,
                    counts: parsed.counts || {}
                };
            }
            return res.status(200).json(allStats);
        }

        if (action === 'get_queries') {
            const stats = await redis.get(`queries:${email}`);
            const parsed = stats ? JSON.parse(stats) : { count: 0, counts: {} };
            const sumCounts = Object.values(parsed.counts || {}).reduce((a, b) => a + b, 0);
            const totalCount = Math.max(parsed.count || 0, sumCounts);
            return res.status(200).json({
                count: totalCount,
                counts: parsed.counts || {}
            });
        }

        if (action === 'increment_query') {
            const key = `queries:${email}`;
            const stats = await redis.get(key);
            let statsObj = stats ? JSON.parse(stats) : { count: 0, counts: {} };
            
            statsObj.count = (statsObj.count || 0) + 1;
            
            // Falls ein Modell mitgesendet wurde, auch dort zählen
            if (req.body.model) {
                if (!statsObj.counts) statsObj.counts = {};
                statsObj.counts[req.body.model] = (statsObj.counts[req.body.model] || 0) + 1;
            }
            
            await redis.set(key, JSON.stringify(statsObj));
            return res.status(200).json({ success: true, count: statsObj.count, counts: statsObj.counts });
        }

        if (action === 'reset_queries') {
            const targetEmail = req.body.email || req.body.userId;
            await redis.del(`queries:${targetEmail}`);
            return res.status(200).json({ success: true });
        }

        // --- ARCHIVE LOGIC ---
        if (action === 'get_archive') {
            const key = `archive:${email}`;
            const type = await redis.type(key);
            
            if (type === 'list') {
                const list = await redis.lrange(key, 0, -1);
                // Konvertiere altes Listen-Format in neues Objekt-Format für das Frontend
                const archiveObj = {};
                list.forEach(item => {
                    const parsed = JSON.parse(item);
                    const ticker = parsed.ticker || 'UNKNOWN';
                    archiveObj[ticker] = parsed;
                });
                return res.status(200).json(archiveObj);
            } else {
                const archive = await redis.get(key);
                return res.status(200).json(archive ? JSON.parse(archive) : {});
            }
        }

        if (action === 'save_archive') {
            const key = `archive:${email}`;
            const archive = await redis.get(key);
            let archiveObj = archive ? JSON.parse(archive) : {};
            
            // Füge die neue Analyse unter dem Ticker-Key hinzu
            if (tickerKey) {
                archiveObj[tickerKey] = data;
            } else {
                // Fallback falls kein Key gesendet wurde (sollte nicht passieren)
                const fallbackKey = new Date().getTime().toString();
                archiveObj[fallbackKey] = data;
            }
            
            await redis.set(key, JSON.stringify(archiveObj));
            return res.status(200).json({ success: true });
        }

        if (action === 'delete_single_archive') {
            const key = `archive:${email}`;
            const archive = await redis.get(key);
            if (archive) {
                let archiveObj = JSON.parse(archive);
                delete archiveObj[tickerKey];
                await redis.set(key, JSON.stringify(archiveObj));
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'delete_archive') {
            await redis.del(`archive:${req.body.email}`);
            return res.status(200).json({ success: true });
        }

        // --- SHARE LINK LOGIC ---
        if (action === 'save_shared_report') {
            const id = Math.random().toString(36).substring(2, 15);
            await redis.set(`shared:${id}`, JSON.stringify(data), 'EX', 60 * 60 * 24 * 10); // 10 Tage gültig
            return res.status(200).json({ id });
        }

        if (action === 'get_shared_report') {
            const report = await redis.get(`shared:${req.body.id}`);
            if (!report) return res.status(404).json({ error: 'Bericht nicht gefunden.' });
            return res.status(200).json(JSON.parse(report));
        }

        // --- HYPE BAROMETER LOGIC ---
        if (action === 'save_hype') {
            const { timeframe, data: hypeData } = req.body;
            if (!timeframe || !hypeData) {
                return res.status(400).json({ error: 'Missing timeframe or data' });
            }
            await redis.set(`hype:${timeframe}`, JSON.stringify(hypeData));
            return res.status(200).json({ success: true });
        }

        if (action === 'get_hype') {
            const { timeframe } = req.body;
            if (!timeframe) {
                return res.status(400).json({ error: 'Missing timeframe' });
            }
            const hypeData = await redis.get(`hype:${timeframe}`);
            if (!hypeData) {
                return res.status(404).json({ error: 'No data found' });
            }
            return res.status(200).json(JSON.parse(hypeData));
        }

        // --- GLOBAL STOCK SCREENER LOGIC ---
        function isCompletedScreenerEntry(item) {
            if (!item || typeof item !== 'object') return false;
            const data = item.data || item;
            if (!data || typeof data !== 'object') return false;
            const execText = (data.executive_summary || data.citadel || data.morgan_stanley || data.goldman_sachs || '').toString().trim();
            if (!execText || execText.length < 15 || execText.toUpperCase() === 'PENDING') return false;
            return true;
        }

        if (action === 'get_global_screener') {
            const raw = await redis.get('global_stock_screener');
            let screenerMap = {};
            if (raw) {
                try {
                    screenerMap = JSON.parse(raw);
                    if (typeof screenerMap !== 'object' || screenerMap === null || Array.isArray(screenerMap)) {
                        screenerMap = {};
                    }
                } catch (e) {
                    screenerMap = {};
                }
            }

            let hasInvalid = false;
            const validMap = {};
            for (const [k, v] of Object.entries(screenerMap)) {
                if (isCompletedScreenerEntry(v)) {
                    validMap[k] = v;
                } else {
                    hasInvalid = true;
                }
            }

            if (hasInvalid) {
                await redis.set('global_stock_screener', JSON.stringify(validMap)).catch(() => {});
            }

            return res.status(200).json(validMap);
        }

        if (action === 'save_global_screener') {
            const rawKey = (req.body && (req.body.key || req.body.tickerKey || req.body.ticker)) || tickerKey || (req.body && req.body.data && (req.body.data.ticker || req.body.data.symbol));
            const itemData = req.body && req.body.data !== undefined ? req.body.data : data;

            if (!rawKey || itemData === undefined || itemData === null) {
                return res.status(400).json({ error: 'Missing key or data' });
            }

            const normalizedKey = String(rawKey).trim().toUpperCase();
            if (!normalizedKey) {
                return res.status(400).json({ error: 'Invalid key' });
            }

            if (!isCompletedScreenerEntry(itemData)) {
                return res.status(400).json({ error: 'Cannot save screener item without completed AI analysis' });
            }

            const raw = await redis.get('global_stock_screener');
            let screenerMap = {};
            if (raw) {
                try {
                    screenerMap = JSON.parse(raw);
                    if (typeof screenerMap !== 'object' || screenerMap === null || Array.isArray(screenerMap)) {
                        screenerMap = {};
                    }
                } catch (e) {
                    screenerMap = {};
                }
            }

            screenerMap[normalizedKey] = itemData;
            await redis.set('global_stock_screener', JSON.stringify(screenerMap));
            return res.status(200).json({ success: true, key: normalizedKey });
        }

        if (action === 'delete_global_screener_item') {
            const rawKey = (req.body && (req.body.key || req.body.tickerKey || req.body.ticker)) || tickerKey || (req.body && req.body.data && (req.body.data.ticker || req.body.data.symbol));
            if (!rawKey) {
                return res.status(400).json({ error: 'Missing key' });
            }

            const normalizedKey = String(rawKey).trim().toUpperCase();
            const raw = await redis.get('global_stock_screener');
            if (raw) {
                try {
                    let screenerMap = JSON.parse(raw);
                    if (typeof screenerMap === 'object' && screenerMap !== null && !Array.isArray(screenerMap)) {
                        delete screenerMap[normalizedKey];
                        await redis.set('global_stock_screener', JSON.stringify(screenerMap));
                    }
                } catch (e) {
                    // Ignore malformed JSON in Redis
                }
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'sync_archives_to_screener') {
            const archiveKeys = await redis.keys('archive:*');
            const rawScreener = await redis.get('global_stock_screener');
            let screenerMap = {};
            if (rawScreener) {
                try {
                    screenerMap = JSON.parse(rawScreener);
                    if (typeof screenerMap !== 'object' || screenerMap === null || Array.isArray(screenerMap)) {
                        screenerMap = {};
                    }
                } catch (e) {
                    screenerMap = {};
                }
            }

            let syncedCount = 0;

            for (const aKey of archiveKeys) {
                try {
                    const keyType = await redis.type(aKey);
                    if (keyType === 'list') {
                        const list = await redis.lrange(aKey, 0, -1);
                        for (const item of list) {
                            try {
                                const parsed = typeof item === 'string' ? JSON.parse(item) : item;
                                if (parsed && typeof parsed === 'object' && isCompletedScreenerEntry(parsed)) {
                                    const ticker = (parsed.ticker || parsed.symbol || '').toString().trim().toUpperCase();
                                    if (ticker && ticker !== 'UNKNOWN') {
                                        screenerMap[ticker] = { ...(screenerMap[ticker] || {}), ...parsed };
                                        syncedCount++;
                                    }
                                }
                            } catch (e) {
                                // Ignore malformed item in archive
                            }
                        }
                    } else if (keyType === 'string') {
                        const rawArchive = await redis.get(aKey);
                        if (rawArchive) {
                            const parsedArchive = JSON.parse(rawArchive);
                            if (parsedArchive && typeof parsedArchive === 'object') {
                                if (Array.isArray(parsedArchive)) {
                                    for (const item of parsedArchive) {
                                        if (item && typeof item === 'object' && isCompletedScreenerEntry(item)) {
                                            const ticker = (item.ticker || item.symbol || '').toString().trim().toUpperCase();
                                            if (ticker && ticker !== 'UNKNOWN') {
                                                screenerMap[ticker] = { ...(screenerMap[ticker] || {}), ...item };
                                                syncedCount++;
                                            }
                                        }
                                    }
                                } else {
                                    for (const [subKey, item] of Object.entries(parsedArchive)) {
                                        if (item && typeof item === 'object' && isCompletedScreenerEntry(item)) {
                                            const ticker = (item.ticker || item.symbol || subKey).toString().trim().toUpperCase();
                                            if (ticker && ticker !== 'UNKNOWN') {
                                                screenerMap[ticker] = { ...(screenerMap[ticker] || {}), ...item };
                                                syncedCount++;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error(`Error processing archive key ${aKey}:`, err);
                }
            }

            const cleanScreenerMap = {};
            for (const [k, v] of Object.entries(screenerMap)) {
                if (isCompletedScreenerEntry(v)) {
                    cleanScreenerMap[k] = v;
                }
            }

            await redis.set('global_stock_screener', JSON.stringify(cleanScreenerMap));
            return res.status(200).json({ success: true, syncedCount, totalCount: Object.keys(cleanScreenerMap).length });
        }

        res.status(400).json({ error: 'Unknown action: ' + action });
    } catch (error) {
        console.error('Storage API Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await redis.quit();
    }
}
