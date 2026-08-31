/**
 * fincast Hub - Central Ad & Monetization Management System
 * Supports 3-second Interstitial / Welcome Ads, Responsive In-Page Ad Slots,
 * Dark-Theme Placeholders, and 1-Click Google AdSense Integration.
 * 
 * Strict Compliance: Professional SVG icons only, NO emojis.
 */

(function () {
    'use strict';

    // =========================================================================
    // GLOBAL MONETIZATION CONFIGURATION
    // =========================================================================
    const FINCAST_ADS_CONFIG = {
        // 'placeholder' = Dark-theme fincast ad placeholders ("Hier könnte Ihre Werbung stehen")
        // 'google_ads'  = Real Google AdSense / Google Ad Manager Integration
        mode: 'placeholder',

        // Google AdSense Publisher ID (z.B. ca-pub-1234567890123456)
        googleAdClient: 'ca-pub-XXXXXXXXXXXXXXXX',

        // Google AdSense Ad Unit Slot IDs
        adSlots: {
            interstitial: '1000000001',
            hubLeaderboardTop: '1000000002',
            hubLeaderboardMid: '1000000003',
            terminalSidebar: '1000000004',
            terminalBottom: '1000000005',
            calculatorTop: '1000000006',
            hypeTop: '1000000007'
        },

        // Interstitial Ad Settings (Google Better Ads Standards Compliant)
        interstitialCountdownSeconds: 3, // Exakt 3 Sekunden (Google-konform)
        interstitialDelayMs: 600,        // Kurze Verzögerung nach Seitenladebeginn
        sessionKey: 'fc_ad_interstitial_seen',
        sessionFrequencyMinutes: 30,     // Nur 1x alle 30 Min. für Gäste

        // Contact & Upgrade Links
        contactEmail: 'info@fincast-tool.vercel.app',
        premiumUrl: 'pages/FAQ.html#premium'
    };

    // =========================================================================
    // SVG VECTOR ICONS (Zero Emojis, Pure Professional SVGs)
    // =========================================================================
    const SVG_ICONS = {
        timer: `<svg class="fc-countdown-timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        close: `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        sponsored: `<svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
        megaphone: `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`,
        target: `<svg class="fc-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
        chart: `<svg class="fc-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
        shield: `<svg class="fc-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        arrowRight: `<svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
        external: `<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        minimize: `<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/></svg>`
    };

    // =========================================================================
    // USER & PREMIUM STATUS DETECTION
    // =========================================================================
    function isUserPremium() {
        try {
            // Check terminal / auth storage
            const sessionToken = localStorage.getItem('terminal_session_token');
            const cachedUserRaw = localStorage.getItem('fincast_cached_user');
            if (cachedUserRaw) {
                const user = JSON.parse(cachedUserRaw);
                if (user && (user.tier === 'premium' || user.tier === 'admin' || user.isAdmin === true)) {
                    return true;
                }
            }
            // Check global user objects if available
            if (window.fincastCurrentUser && (window.fincastCurrentUser.tier === 'premium' || window.fincastCurrentUser.isAdmin)) {
                return true;
            }
            if (window.cachedCurrentUser && (window.cachedCurrentUser.tier === 'premium' || window.cachedCurrentUser.isAdmin)) {
                return true;
            }
        } catch (e) {
            console.warn('[fincast Ads] Auth check error:', e);
        }
        return false;
    }

    // =========================================================================
    // GOOGLE ADSENSE SCRIPT LOADER
    // =========================================================================
    function loadGoogleAdSenseScript() {
        if (FINCAST_ADS_CONFIG.mode !== 'google_ads') return;
        if (document.getElementById('google-adsense-script')) return;

        const script = document.createElement('script');
        script.id = 'google-adsense-script';
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${FINCAST_ADS_CONFIG.googleAdClient}`;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
    }

    // =========================================================================
    // INTERSTITIAL / WELCOME AD BANNER (3-SECOND COUNTDOWN)
    // =========================================================================
    function canShowInterstitial() {
        if (isUserPremium()) return false;

        const lastSeen = sessionStorage.getItem(FINCAST_ADS_CONFIG.sessionKey);
        if (!lastSeen) return true;

        const diffMinutes = (Date.now() - parseInt(lastSeen, 10)) / (1000 * 60);
        return diffMinutes >= FINCAST_ADS_CONFIG.sessionFrequencyMinutes;
    }

    function recordInterstitialSeen() {
        try {
            sessionStorage.setItem(FINCAST_ADS_CONFIG.sessionKey, Date.now().toString());
        } catch (e) {
            // Ignore sessionStorage quota / private browsing errors
        }
    }

    function buildInterstitialHTML() {
        const mailSubject = encodeURIComponent('Werbeplatz Anfrage fincast Hub (Welcome Interstitial)');
        const mailBody = encodeURIComponent('Hallo fincast Team,\n\nich interessiere mich für eine Werbeplatzierung auf fincast Hub.\n\nUnternehmen/Produkt:\nBudget/Zeitraum:\nKontakt:');
        const bookingLink = `mailto:${FINCAST_ADS_CONFIG.contactEmail}?subject=${mailSubject}&body=${mailBody}`;

        return `
        <div id="fcInterstitialOverlay" class="fc-interstitial-overlay" role="dialog" aria-modal="true" aria-label="Werbung">
            <div class="fc-interstitial-card">
                <!-- Header with Badge and 3-Second Countdown / Close Action -->
                <div class="fc-interstitial-header">
                    <span class="fc-interstitial-badge">
                        ${SVG_ICONS.sponsored}
                        <span>Gesponsert &bull; fincast Network</span>
                    </span>
                    <div id="fcCountdownContainer" class="fc-countdown-box">
                        <div class="fc-countdown-pill" id="fcCountdownPill">
                            ${SVG_ICONS.timer}
                            <span>Schließen in <strong id="fcCountdownNum" style="color:var(--fc-ad-gold);">${FINCAST_ADS_CONFIG.interstitialCountdownSeconds}</strong>s</span>
                        </div>
                    </div>
                </div>

                <!-- Body (Placeholder or Google Ads Slot) -->
                <div class="fc-interstitial-body">
                    ${FINCAST_ADS_CONFIG.mode === 'google_ads' ? `
                        <ins class="adsbygoogle"
                             style="display:inline-block;width:336px;height:280px"
                             data-ad-client="${FINCAST_ADS_CONFIG.googleAdClient}"
                             data-ad-slot="${FINCAST_ADS_CONFIG.adSlots.interstitial}"></ins>
                    ` : `
                        <div style="text-align:center; max-width: 480px; width:100%;">
                            <div style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:12px; background:rgba(214,168,58,0.12); border:1px solid rgba(214,168,58,0.3); margin-bottom:0.75rem; color:var(--fc-ad-gold);">
                                ${SVG_ICONS.megaphone}
                            </div>
                            <h3 class="fc-placeholder-title" style="font-size:1.25rem; margin-bottom:0.4rem;">
                                Hier könnte Ihre Werbung stehen
                            </h3>
                            <p class="fc-placeholder-desc" style="font-size:0.85rem; margin-bottom:1.2rem;">
                                Erreichen Sie täglich tausende aktive Trader, Value-Investoren und Finanzanalysten direkt auf der führenden Research-Suite.
                            </p>
                            
                            <div class="fc-placeholder-features" style="justify-content:center; margin-bottom:1.4rem;">
                                <span class="fc-feature-pill">${SVG_ICONS.target} Kaufkräftige Zielgruppe</span>
                                <span class="fc-feature-pill">${SVG_ICONS.chart} Hohe Verweildauer</span>
                                <span class="fc-feature-pill">${SVG_ICONS.shield} 100% Brand Safety</span>
                            </div>

                            <a href="${bookingLink}" class="fc-placeholder-btn" style="padding:0.6rem 1.4rem; font-size:0.85rem; margin:0 auto; display:inline-flex;">
                                <span>Werbeplatz buchen</span>
                                ${SVG_ICONS.arrowRight}
                            </a>
                        </div>
                    `}
                </div>

                <!-- Footer with Disclaimers & Premium Hint -->
                <div class="fc-interstitial-footer">
                    <span class="fc-premium-hint">
                        Keine Lust auf Werbung? <a href="${FINCAST_ADS_CONFIG.premiumUrl}">Jetzt werbefrei mit Premium</a>
                    </span>
                    <span style="font-family:'JetBrains Mono',monospace; font-size:0.65rem; color:#64748B;">
                        fincast v3.5
                    </span>
                </div>
            </div>
        </div>
        `;
    }

    function initInterstitialAd() {
        if (!canShowInterstitial()) return;

        // Inject Interstitial Modal into body if not present
        if (!document.getElementById('fcInterstitialOverlay')) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = buildInterstitialHTML();
            document.body.appendChild(wrapper.firstElementChild);
        }

        const overlay = document.getElementById('fcInterstitialOverlay');
        const countdownContainer = document.getElementById('fcCountdownContainer');
        const countdownNum = document.getElementById('fcCountdownNum');

        if (!overlay || !countdownContainer) return;

        setTimeout(() => {
            overlay.classList.add('fc-visible');
            recordInterstitialSeen();

            // Run Google AdSense if in google_ads mode
            if (FINCAST_ADS_CONFIG.mode === 'google_ads' && window.adsbygoogle) {
                try {
                    (window.adsbygoogle = window.adsbygoogle || []).push({});
                } catch (e) {
                    console.warn('[fincast Ads] AdSense Push Error:', e);
                }
            }

            // Start 3-second non-skippable countdown
            let remaining = FINCAST_ADS_CONFIG.interstitialCountdownSeconds;

            const timerInterval = setInterval(() => {
                remaining--;
                if (countdownNum) {
                    countdownNum.textContent = remaining.toString();
                }

                if (remaining <= 0) {
                    clearInterval(timerInterval);
                    // Transform to Active Close Button
                    countdownContainer.innerHTML = `
                        <button type="button" class="fc-close-btn" id="fcCloseInterstitialBtn" aria-label="Werbung schließen">
                            <span>Schließen</span>
                            ${SVG_ICONS.close}
                        </button>
                    `;

                    const closeBtn = document.getElementById('fcCloseInterstitialBtn');
                    if (closeBtn) {
                        closeBtn.addEventListener('click', closeInterstitial);
                        closeBtn.focus();
                    }
                }
            }, 1000);

        }, FINCAST_ADS_CONFIG.interstitialDelayMs);
    }

    function closeInterstitial() {
        const overlay = document.getElementById('fcInterstitialOverlay');
        if (overlay) {
            overlay.classList.remove('fc-visible');
            setTimeout(() => {
                overlay.remove();
            }, 400);
        }
    }

    // =========================================================================
    // IN-PAGE DISPLAY BANNER GENERATOR
    // =========================================================================
    function createPlaceholderBanner(slotType, titleText, descText) {
        const mailSubject = encodeURIComponent(`Werbeplatz Anfrage fincast Hub (${slotType})`);
        const mailBody = encodeURIComponent(`Hallo fincast Team,\n\nich interessiere mich für den In-Page Werbeplatz [${slotType}] auf fincast Hub.\n\nUnternehmen/Produkt:\nBudget/Zeitraum:\nKontakt:`);
        const bookingLink = `mailto:${FINCAST_ADS_CONFIG.contactEmail}?subject=${mailSubject}&body=${mailBody}`;

        const isHorizontal = slotType === 'leaderboard' || slotType === 'horizontal';

        if (isHorizontal) {
            return `
            <div class="fc-placeholder-card fc-placeholder-horizontal">
                <div class="fc-placeholder-left">
                    <div class="fc-placeholder-tag">
                        ${SVG_ICONS.sponsored}
                        <span>Anzeige &bull; fincast Media Network</span>
                    </div>
                    <h4 class="fc-placeholder-title">${titleText || 'Hier könnte Ihre Werbung stehen'}</h4>
                    <p class="fc-placeholder-desc">${descText || 'Erreichen Sie die aktivste Community institutioneller und privater Finanz-Investoren.'}</p>
                </div>
                <div class="fc-placeholder-actions">
                    <a href="${bookingLink}" class="fc-placeholder-btn">
                        <span>Werbeplatz buchen</span>
                        ${SVG_ICONS.arrowRight}
                    </a>
                </div>
            </div>
            `;
        }

        // Standard / Rectangle Slot
        return `
        <div class="fc-placeholder-card">
            <div class="fc-placeholder-top">
                <span class="fc-placeholder-tag">
                    ${SVG_ICONS.sponsored}
                    <span>Anzeige</span>
                </span>
                <span style="font-family:'JetBrains Mono',monospace; font-size:0.65rem; color:#64748B;">B2B Finance</span>
            </div>
            <h4 class="fc-placeholder-title">${titleText || 'Hier könnte Ihre Werbung stehen'}</h4>
            <p class="fc-placeholder-desc">${descText || 'Präsentieren Sie Ihr Produkt, Ihren Broker oder Ihre Finanzlösung tausenden aktiven Anlegern.'}</p>
            
            <div class="fc-placeholder-features">
                <span class="fc-feature-pill">${SVG_ICONS.target} Hohe Relevanz</span>
                <span class="fc-feature-pill">${SVG_ICONS.shield} Finance Leads</span>
            </div>

            <div class="fc-placeholder-actions">
                <a href="${bookingLink}" class="fc-placeholder-btn">
                    <span>Jetzt anfragen</span>
                    ${SVG_ICONS.arrowRight}
                </a>
                <span class="fc-premium-hint">
                    <a href="${FINCAST_ADS_CONFIG.premiumUrl}">Werbefrei</a>
                </span>
            </div>
        </div>
        `;
    }

    function renderInPageAds() {
        if (isUserPremium()) {
            // Hide all ad containers for premium users
            document.querySelectorAll('.fc-ad-slot').forEach(el => {
                el.style.display = 'none';
            });
            return;
        }

        const adSlots = document.querySelectorAll('[data-fc-ad-slot]');

        adSlots.forEach(container => {
            const slotName = container.getAttribute('data-fc-ad-slot');
            const customTitle = container.getAttribute('data-fc-title');
            const customDesc = container.getAttribute('data-fc-desc');

            if (FINCAST_ADS_CONFIG.mode === 'google_ads') {
                const slotId = FINCAST_ADS_CONFIG.adSlots[slotName] || '1000000000';
                container.innerHTML = `
                    <div class="fc-ad-slot">
                        <ins class="adsbygoogle"
                             style="display:block"
                             data-ad-client="${FINCAST_ADS_CONFIG.googleAdClient}"
                             data-ad-slot="${slotId}"
                             data-ad-format="auto"
                             data-full-width-responsive="true"></ins>
                    </div>
                `;
                if (window.adsbygoogle) {
                    try {
                        (window.adsbygoogle = window.adsbygoogle || []).push({});
                    } catch (e) {
                        console.warn('[fincast Ads] Slot render error:', e);
                    }
                }
            } else {
                // Placeholder Mode
                container.innerHTML = createPlaceholderBanner(slotName, customTitle, customDesc);
            }
        });
    }

    // =========================================================================
    // INITIALIZATION & PUBLIC API
    // =========================================================================
    function init() {
        if (FINCAST_ADS_CONFIG.mode === 'google_ads' && !isUserPremium()) {
            loadGoogleAdSenseScript();
        }

        // Initialize Ads
        renderInPageAds();
        initInterstitialAd();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose global controller for manual triggers or inspection
    window.FincastAds = {
        config: FINCAST_ADS_CONFIG,
        isPremium: isUserPremium,
        refresh: renderInPageAds,
        showInterstitial: () => {
            sessionStorage.removeItem(FINCAST_ADS_CONFIG.sessionKey);
            initInterstitialAd();
        },
        closeInterstitial: closeInterstitial,
        setMode: (mode) => {
            if (mode === 'placeholder' || mode === 'google_ads') {
                FINCAST_ADS_CONFIG.mode = mode;
                renderInPageAds();
            }
        }
    };

})();
