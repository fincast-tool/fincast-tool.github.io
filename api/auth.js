const Redis = require('ioredis');
const crypto = require('crypto');

// ==================== HELPER FUNCTIONS ====================

function getRedis() {
    return new Redis(process.env.KV_REDIS_URL || process.env.REDIS_URL);
}

function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return re.test(email.trim().toLowerCase());
}

function validatePasswordStrength(password) {
    if (!password || typeof password !== 'string') return { valid: false, message: 'Passwort erforderlich.' };
    if (password.length < 8) return { valid: false, message: 'Passwort muss mindestens 8 Zeichen lang sein.' };
    if (!/[A-Z]/.test(password)) return { valid: false, message: 'Mindestens ein Großbuchstabe (A-Z) erforderlich.' };
    if (!/[a-z]/.test(password)) return { valid: false, message: 'Mindestens ein Kleinbuchstabe (a-z) erforderlich.' };
    if (!/[0-9]/.test(password)) return { valid: false, message: 'Mindestens eine Ziffer (0-9) erforderlich.' };
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return { valid: false, message: 'Mindestens ein Sonderzeichen erforderlich.' };
    return { valid: true };
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `pbkdf2$100000$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || !password) return false;
    if (storedHash.startsWith('pbkdf2$')) {
        const parts = storedHash.split('$');
        if (parts.length !== 4) return false;
        const iterations = parseInt(parts[1], 10);
        const salt = parts[2];
        const originalHash = parts[3];
        const verifyHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(verifyHash, 'hex'), Buffer.from(originalHash, 'hex'));
    }
    // Legacy MD5 check with fallback
    const legacyMd5 = crypto.createHash('md5').update(password).digest('hex');
    return legacyMd5.toLowerCase() === storedHash.toLowerCase();
}

function sanitizeUser(user) {
    if (!user) return null;
    const { password, passwordHash, salt, verificationCode, verificationToken, verificationExpires, ...safeUser } = user;
    return safeUser;
}

// Rate Limiter
async function checkRateLimit(redis, key, maxAttempts, windowSeconds) {
    const current = await redis.incr(key);
    if (current === 1) {
        await redis.expire(key, windowSeconds);
    }
    return current <= maxAttempts;
}

// E-Mail Dispatcher
async function sendVerificationEmail({ email, firstName, otpCode, verifyToken, origin }) {
    const cleanFirstName = sanitizeString(firstName) || 'Trader';
    const verifyLink = `${origin}/terminal.html?action=verify&token=${verifyToken}&email=${encodeURIComponent(email)}`;

    const subject = `fincast Terminal | Dein Bestätigungscode: ${otpCode}`;

    const textContent = `Hallo ${cleanFirstName},\n\n` +
        `Willkommen beim fincast Strategic Intelligence Terminal.\n\n` +
        `Dein 6-stelliger Bestätigungscode lautet:\n` +
        `${otpCode}\n\n` +
        `Alternativ kannst du deine E-Mail über folgenden Link direkt bestätigen:\n` +
        `${verifyLink}\n\n` +
        `Dieser Code ist 15 Minuten gültig.\n\n` +
        `Falls du diese Registrierung nicht initiiert hast, kannst du diese Nachricht ignorieren.\n\n` +
        `Mit freundlichen Grüßen,\nDein fincast Team`;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>E-Mail Bestätigung</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0d14; color: #e2e8f0; margin: 0; padding: 24px; }
            .container { max-width: 520px; margin: 0 auto; background: #0f1420; border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .header { padding: 28px 24px 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); background: linear-gradient(180deg, #141926 0%, #0f1420 100%); }
            .logo-text { font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 10px; }
            .subtitle { font-size: 11px; color: #d4af37; font-family: monospace; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 4px; }
            .content { padding: 32px 28px; line-height: 1.6; }
            .greeting { font-size: 16px; color: #ffffff; font-weight: 600; margin-bottom: 16px; }
            .desc { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
            .otp-box { background: #1a1f2e; border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
            .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #d4af37; margin: 0; }
            .btn-verify { display: inline-block; background: #d4af37; color: #0a0d14; font-weight: 700; font-size: 13px; text-decoration: none; padding: 12px 28px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 10px; }
            .footer { padding: 20px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); font-size: 11px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo-text">fincast Hub</div>
                <div class="subtitle">Strategic Intelligence Terminal</div>
            </div>
            <div class="content">
                <div class="greeting">Hallo ${cleanFirstName},</div>
                <p class="desc">vielen Dank für deine Registrierung beim fincast Terminal. Bitte verwende den folgenden 6-stelligen Bestätigungscode, um deinen Account zu aktivieren:</p>
                <div class="otp-box">
                    <div class="otp-code">${otpCode}</div>
                </div>
                <div style="text-align: center; margin: 24px 0;">
                    <a href="${verifyLink}" class="btn-verify" target="_blank">E-Mail direkt bestätigen</a>
                </div>
                <p class="desc" style="font-size: 12px; margin-top: 24px;">Dieser Bestätigungscode ist für <strong>15 Minuten</strong> gültig. Falls du keine Registrierung vorgenommen hast, kannst du diese E-Mail einfach ignorieren.</p>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} fincast Hub &bull; Institutional Financial Analytics
            </div>
        </div>
    </body>
    </html>
    `;

    // 1. Try Resend API
    if (process.env.RESEND_API_KEY) {
        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: process.env.EMAIL_FROM || 'fincast Terminal <onboarding@resend.dev>',
                    to: [email],
                    subject,
                    html: htmlContent,
                    text: textContent
                })
            });
            if (res.ok) {
                console.log(`[AUTH] Verification email sent via Resend to: ${email}`);
                return { success: true, provider: 'resend' };
            } else {
                const errText = await res.text();
                console.error('[AUTH] Resend API Error:', errText);
            }
        } catch (e) {
            console.error('[AUTH] Resend Exception:', e);
        }
    }

    // 2. Try Brevo (Sendinblue) API
    if (process.env.BREVO_API_KEY) {
        try {
            const res = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'api-key': process.env.BREVO_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: 'fincast Terminal', email: process.env.EMAIL_FROM || 'info@fincast-tool.vercel.app' },
                    to: [{ email, name: cleanFirstName }],
                    subject,
                    htmlContent,
                    textContent
                })
            });
            if (res.ok) {
                console.log(`[AUTH] Verification email sent via Brevo to: ${email}`);
                return { success: true, provider: 'brevo' };
            }
        } catch (e) {
            console.error('[AUTH] Brevo Exception:', e);
        }
    }

    // 3. Try SendGrid API
    if (process.env.SENDGRID_API_KEY) {
        try {
            const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email, name: cleanFirstName }] }],
                    from: { email: process.env.EMAIL_FROM || 'noreply@fincast-tool.vercel.app', name: 'fincast Terminal' },
                    subject,
                    content: [
                        { type: 'text/plain', value: textContent },
                        { type: 'text/html', value: htmlContent }
                    ]
                })
            });
            if (res.ok) {
                console.log(`[AUTH] Verification email sent via SendGrid to: ${email}`);
                return { success: true, provider: 'sendgrid' };
            }
        } catch (e) {
            console.error('[AUTH] SendGrid Exception:', e);
        }
    }

    // 4. Fallback / Development Simulation mode
    console.log(`\n==================================================`);
    console.log(`[AUTH DEV/FALLBACK] Verification email simulated for: ${email}`);
    console.log(`[AUTH DEV/FALLBACK] OTP Code: ${otpCode}`);
    console.log(`[AUTH DEV/FALLBACK] Verify Link: ${verifyLink}`);
    console.log(`==================================================\n`);

    return { success: true, provider: 'fallback', devOtp: otpCode };
}

// ==================== MAIN API HANDLER ====================

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action } = req.body || {};
    const redis = getRedis();

    const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const origin = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : 'https://fincast-tool.vercel.app');

    try {
        // ----------------------------------------------------
        // ACTION: REGISTER
        // ----------------------------------------------------
        if (action === 'register') {
            const { firstName, lastName, email, password, termsAccepted } = req.body;

            // Rate limit registrations: max 10 per hour per IP
            const allowed = await checkRateLimit(redis, `ratelimit:register:${clientIp}`, 10, 3600);
            if (!allowed) {
                return res.status(429).json({ error: 'Zu viele Registrierungsversuche. Bitte versuche es in einer Stunde erneut.' });
            }

            if (!termsAccepted) {
                return res.status(400).json({ error: 'Bitte akzeptiere die Nutzungsbedingungen und die Datenschutzerklärung.' });
            }

            const cleanFirst = sanitizeString(firstName);
            const cleanLast = sanitizeString(lastName);
            const cleanEmail = (email || '').trim().toLowerCase();

            if (!cleanFirst || !cleanLast || !cleanEmail || !password) {
                return res.status(400).json({ error: 'Alle Felder müssen ausgefüllt sein.' });
            }

            if (!isValidEmail(cleanEmail)) {
                return res.status(400).json({ error: 'Ungültiges E-Mail-Format.' });
            }

            const strength = validatePasswordStrength(password);
            if (!strength.valid) {
                return res.status(400).json({ error: strength.message });
            }

            const usersRaw = await redis.get('terminal_users');
            let usersArray = usersRaw ? JSON.parse(usersRaw) : [];

            const existingUserIndex = usersArray.findIndex(u => u.email === cleanEmail);
            const otpCode = crypto.randomInt(100000, 1000000).toString();
            const verifyToken = crypto.randomBytes(32).toString('hex');
            const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

            if (existingUserIndex > -1) {
                const existing = usersArray[existingUserIndex];
                if (existing.emailVerified) {
                    return res.status(400).json({ error: 'Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an.' });
                }
                // Update unverified user with new password and verification code
                usersArray[existingUserIndex] = {
                    ...existing,
                    firstName: cleanFirst,
                    lastName: cleanLast,
                    password: hashPassword(password),
                    verificationCode: otpCode,
                    verificationToken: verifyToken,
                    verificationExpires: expires,
                    updatedAt: new Date().toISOString()
                };
            } else {
                // New unverified user
                usersArray.push({
                    email: cleanEmail,
                    password: hashPassword(password),
                    firstName: cleanFirst,
                    lastName: cleanLast,
                    apiKey: '',
                    model: 'gemini-3.5-flash',
                    tier: 'free',
                    isAdmin: false,
                    emailVerified: false,
                    verificationCode: otpCode,
                    verificationToken: verifyToken,
                    verificationExpires: expires,
                    createdAt: new Date().toISOString()
                });
            }

            await redis.set('terminal_users', JSON.stringify(usersArray));

            // Send confirmation email
            const emailResult = await sendVerificationEmail({
                email: cleanEmail,
                firstName: cleanFirst,
                otpCode,
                verifyToken,
                origin
            });

            return res.status(200).json({
                success: true,
                message: 'Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse mit dem Code.',
                email: cleanEmail,
                requiresVerification: true,
                devOtp: emailResult.devOtp || undefined
            });
        }

        // ----------------------------------------------------
        // ACTION: VERIFY OTP / TOKEN
        // ----------------------------------------------------
        if (action === 'verify_otp') {
            const { email, code, token } = req.body;
            const cleanEmail = (email || '').trim().toLowerCase();

            if (!cleanEmail || (!code && !token)) {
                return res.status(400).json({ error: 'E-Mail und Bestätigungscode oder Verifizierungslink erforderlich.' });
            }

            // Rate limit verification attempts (max 10 attempts per 15 min per email)
            const allowed = await checkRateLimit(redis, `ratelimit:otp:${cleanEmail}`, 10, 900);
            if (!allowed) {
                return res.status(429).json({ error: 'Zu viele fehlerhafte Versuche. Bitte warte 15 Minuten oder fordere einen neuen Code an.' });
            }

            const usersRaw = await redis.get('terminal_users');
            let usersArray = usersRaw ? JSON.parse(usersRaw) : [];

            const userIndex = usersArray.findIndex(u => u.email === cleanEmail);
            if (userIndex === -1) {
                return res.status(400).json({ error: 'Benutzerkonto nicht gefunden.' });
            }

            const user = usersArray[userIndex];

            if (user.emailVerified) {
                // Already verified - issue new session
                const sessionToken = crypto.randomBytes(32).toString('hex');
                await redis.set(`session:${sessionToken}`, cleanEmail, 'EX', 60 * 60 * 24 * 30); // 30 days
                return res.status(200).json({
                    success: true,
                    message: 'E-Mail wurde bereits bestätigt.',
                    sessionToken,
                    user: sanitizeUser(user)
                });
            }

            // Verify expiration
            if (!user.verificationExpires || Date.now() > user.verificationExpires) {
                return res.status(400).json({ error: 'Der Bestätigungscode ist abgelaufen. Bitte fordere einen neuen Code an.' });
            }

            // Validate code or token
            let isMatch = false;
            if (code && user.verificationCode && code.toString().trim() === user.verificationCode.toString().trim()) {
                isMatch = true;
            } else if (token && user.verificationToken && token.trim() === user.verificationToken.trim()) {
                isMatch = true;
            }

            if (!isMatch) {
                return res.status(400).json({ error: 'Ungültiger Bestätigungscode.' });
            }

            // Mark user as verified and clear OTP
            usersArray[userIndex] = {
                ...user,
                emailVerified: true,
                emailVerifiedAt: new Date().toISOString(),
                verificationCode: null,
                verificationToken: null,
                verificationExpires: null
            };

            await redis.set('terminal_users', JSON.stringify(usersArray));

            // Create session token
            const sessionToken = crypto.randomBytes(32).toString('hex');
            await redis.set(`session:${sessionToken}`, cleanEmail, 'EX', 60 * 60 * 24 * 30);

            return res.status(200).json({
                success: true,
                message: 'E-Mail erfolgreich bestätigt. Willkommen im Terminal!',
                sessionToken,
                user: sanitizeUser(usersArray[userIndex])
            });
        }

        // ----------------------------------------------------
        // ACTION: RESEND OTP
        // ----------------------------------------------------
        if (action === 'resend_otp') {
            const { email } = req.body;
            const cleanEmail = (email || '').trim().toLowerCase();

            if (!cleanEmail || !isValidEmail(cleanEmail)) {
                return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
            }

            // Cooldown: Max 1 resend per 60 seconds per email
            const allowed = await checkRateLimit(redis, `ratelimit:resend:${cleanEmail}`, 1, 60);
            if (!allowed) {
                return res.status(429).json({ error: 'Bitte warte einen Moment, bevor du einen neuen Code anforderst (Cooldown: 60 Sekunden).' });
            }

            const usersRaw = await redis.get('terminal_users');
            let usersArray = usersRaw ? JSON.parse(usersRaw) : [];
            const userIndex = usersArray.findIndex(u => u.email === cleanEmail);

            if (userIndex === -1) {
                return res.status(400).json({ error: 'Benutzerkonto nicht gefunden.' });
            }

            const user = usersArray[userIndex];
            if (user.emailVerified) {
                return res.status(400).json({ error: 'Diese E-Mail ist bereits bestätigt. Du kannst dich direkt anmelden.' });
            }

            const otpCode = crypto.randomInt(100000, 1000000).toString();
            const verifyToken = crypto.randomBytes(32).toString('hex');
            const expires = Date.now() + 15 * 60 * 1000;

            usersArray[userIndex] = {
                ...user,
                verificationCode: otpCode,
                verificationToken: verifyToken,
                verificationExpires: expires
            };

            await redis.set('terminal_users', JSON.stringify(usersArray));

            const emailResult = await sendVerificationEmail({
                email: cleanEmail,
                firstName: user.firstName,
                otpCode,
                verifyToken,
                origin
            });

            return res.status(200).json({
                success: true,
                message: 'Ein neuer Bestätigungscode wurde an deine E-Mail-Adresse gesendet.',
                devOtp: emailResult.devOtp || undefined
            });
        }

        // ----------------------------------------------------
        // ACTION: LOGIN
        // ----------------------------------------------------
        if (action === 'login') {
            const { email, password, rememberMe } = req.body;
            const cleanEmail = (email || '').trim().toLowerCase();

            if (!cleanEmail || !password) {
                return res.status(400).json({ error: 'E-Mail und Passwort erforderlich.' });
            }

            // Rate limit login attempts: Max 6 failed logins per 10 min per email
            const rateKey = `ratelimit:login:${cleanEmail}`;
            const attempts = parseInt((await redis.get(rateKey)) || '0', 10);
            if (attempts >= 6) {
                return res.status(429).json({ error: 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte 10 Minuten.' });
            }

            const usersRaw = await redis.get('terminal_users');
            let usersArray = usersRaw ? JSON.parse(usersRaw) : [];

            // Admin env fallback
            const adminEmail = process.env.ADMIN_EMAIL;
            const adminHash = process.env.ADMIN_PASSWORD_HASH;
            if (adminEmail && !usersArray.find(u => u.email === adminEmail)) {
                usersArray.push({
                    email: adminEmail,
                    password: adminHash,
                    firstName: 'Admin',
                    lastName: 'System',
                    tier: 'premium',
                    isAdmin: true,
                    emailVerified: true,
                    model: 'gemini-3.5-flash',
                    createdAt: new Date().toISOString()
                });
                await redis.set('terminal_users', JSON.stringify(usersArray));
            }

            const userIndex = usersArray.findIndex(u => u.email === cleanEmail);
            if (userIndex === -1) {
                await redis.incr(rateKey);
                await redis.expire(rateKey, 600);
                return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });
            }

            const user = usersArray[userIndex];
            const storedHash = user.password || user.passwordHash;

            const isMatch = verifyPassword(password, storedHash);
            if (!isMatch) {
                await redis.incr(rateKey);
                await redis.expire(rateKey, 600);
                return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });
            }

            // Reset rate limit on success
            await redis.del(rateKey);

            // Auto-migrate legacy MD5 password to PBKDF2
            if (!storedHash.startsWith('pbkdf2$')) {
                usersArray[userIndex].password = hashPassword(password);
                delete usersArray[userIndex].passwordHash;
                await redis.set('terminal_users', JSON.stringify(usersArray));
            }

            // Check if email is verified
            if (user.emailVerified === false) {
                return res.status(403).json({
                    error: 'E-Mail-Adresse noch nicht bestätigt.',
                    requiresVerification: true,
                    email: cleanEmail
                });
            }

            // Issue session token
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const ttl = rememberMe ? (60 * 60 * 24 * 30) : (60 * 60 * 24); // 30 days or 1 day
            await redis.set(`session:${sessionToken}`, cleanEmail, 'EX', ttl);

            return res.status(200).json({
                success: true,
                sessionToken,
                user: sanitizeUser(usersArray[userIndex])
            });
        }

        // ----------------------------------------------------
        // ACTION: VERIFY SESSION
        // ----------------------------------------------------
        if (action === 'verify_session') {
            const { sessionToken } = req.body;
            if (!sessionToken) {
                return res.status(401).json({ error: 'Keine Session angegeben.' });
            }

            const userEmail = await redis.get(`session:${sessionToken}`);
            if (!userEmail) {
                return res.status(401).json({ error: 'Session abgelaufen oder ungültig.' });
            }

            const cleanEmail = userEmail.trim().toLowerCase();
            const usersRaw = await redis.get('terminal_users');
            const usersArray = usersRaw ? JSON.parse(usersRaw) : [];
            const user = usersArray.find(u => u && u.email && u.email.trim().toLowerCase() === cleanEmail);

            if (!user) {
                return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
            }

            const safe = sanitizeUser(user);
            const envAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
            if (safe) {
                if ((envAdminEmail && cleanEmail === envAdminEmail) || user.isAdmin === true || String(user.isAdmin).toLowerCase() === 'true' || user.tier === 'admin') {
                    safe.isAdmin = true;
                } else {
                    safe.isAdmin = false;
                }
            }

            return res.status(200).json({
                success: true,
                user: safe
            });
        }

        // ----------------------------------------------------
        // ACTION: LOGOUT
        // ----------------------------------------------------
        if (action === 'logout') {
            const { sessionToken } = req.body;
            if (sessionToken) {
                await redis.del(`session:${sessionToken}`);
            }
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unbekannte Aktion: ' + action });

    } catch (error) {
        console.error('Auth API Error:', error);
        return res.status(500).json({ error: 'Interner Serverfehler: ' + error.message });
    } finally {
        await redis.quit();
    }
};
