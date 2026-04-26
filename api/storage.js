import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const { action, email, data, key } = req.body;

    try {
        switch (action) {
            case 'get_users':
                const users = await kv.get('terminal_users') || [];
                return res.status(200).json(users);

            case 'save_user':
                let allUsers = await kv.get('terminal_users') || [];
                // Update oder Add
                const idx = allUsers.findIndex(u => u.email === data.email);
                if (idx !== -1) allUsers[idx] = data;
                else allUsers.push(data);
                await kv.set('terminal_users', allUsers);
                return res.status(200).json({ success: true });

            case 'get_queries':
                const queries = await kv.get(`queries:${email}`) || { count: 0, date: '' };
                return res.status(200).json(queries);

            case 'increment_query':
                const today = new Date().toISOString().slice(0, 10);
                let q = await kv.get(`queries:${email}`) || { count: 0, date: today };
                if (q.date !== today) { q.count = 0; q.date = today; }
                q.count++;
                await kv.set(`queries:${email}`, q);
                return res.status(200).json(q);

            case 'save_archive':
                // Wir speichern das Archiv pro User in einem eigenen Key
                await kv.hset(`archive:${email}`, { [key]: data });
                return res.status(200).json({ success: true });

            case 'get_archive':
                const archive = await kv.hgetall(`archive:${email}`) || {};
                return res.status(200).json(archive);

            default:
                return res.status(400).json({ error: 'Unknown action' });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
