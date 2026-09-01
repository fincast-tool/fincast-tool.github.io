/**
 * fincast Hub - Central Advertising & Monetization Engine
 * 
 * Features:
 * - 3-Second Google Better Ads Compliant Interstitial Modal with subtle transparent circle close button
 * - In-Page Responsive Display Ad Placements (728x90 Leaderboard, 300x250 Rectangle)
 * - Clean, button-free dark-theme placeholders
 * - 1-Click Toggle for real Google AdSense Integration
 * - Automatic bypass for Premium/Admin users
 * - 100% SVG Vector Icons (No Emojis)
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
            terminalGuidedMid: '1000000008',
            terminalResearchMid: '1000000009',
            terminalLoadingSpot: '1000000010',
            calculatorTop: '1000000006',
            hypeTop: '1000000007'
        },

        // Interstitial Ad Settings (Google Better Ads Standards Compliant)
        interstitialCountdownSeconds: 3, // Exakt 3 Sekunden (Google-konform)
        interstitialDelayMs: 600,        // Kurze Verzögerung nach Seitenladebeginn
        sessionKey: 'fc_ad_interstitial_seen',
        sessionFrequencyMinutes: 30      // Nur 1x alle 30 Min. für Gäste
    };

    // =========================================================================
    // SVG VECTOR ICONS (Zero Emojis, Pure Professional SVGs)
    // =========================================================================
    const SVG_ICONS = {
        timer: `<svg class="fc-countdown-timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        close: `<svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        sponsored: `<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
        target: `<svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
        chart: `<svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
        shield: `<svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        megaphone: `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`
    };

    // =========================================================================
    // AUTHENTICATION & PREMIUM USER BYPASS (FREE VS PREMIUM)
    // =========================================================================
    function isUserPremium() {
        try {
            // Check terminal session token and user profile
            const sessionRaw = localStorage.getItem('terminal_session');
            if (sessionRaw) {
                const session = JSON.parse(sessionRaw);
                const tier = (session.tier || session.user?.tier || '').toLowerCase();
                // Admin continues to see ads! Only tier === 'premium' or 'pro' bypasses ads
                if (tier === 'premium' || tier === 'pro') {
                    return true;
                }
            }

            // Check generic fincast user token
            const fcUserRaw = localStorage.getItem('fincast_user') || sessionStorage.getItem('fincast_user');
            if (fcUserRaw) {
                const fcUser = JSON.parse(fcUserRaw);
                const tier = (fcUser.tier || '').toLowerCase();
                if (tier === 'premium' || tier === 'pro' || fcUser.isPremium === true) {
                    return true;
                }
            }
        } catch (e) {
            console.warn('[fincast Ads] Auth Check Error:', e);
        }
        return false;
    }

    // =========================================================================
    // GOOGLE ADSENSE DYNAMIC LOADER
    // =========================================================================
    function loadGoogleAdSenseScript() {
        if (document.getElementById('fincast-adsense-script')) return;

        const script = document.createElement('script');
        script.id = 'fincast-adsense-script';
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
        return `
        <div id="fcInterstitialOverlay" class="fc-interstitial-overlay" role="dialog" aria-modal="true" aria-label="Werbung">
            <div class="fc-interstitial-card">
                <!-- Subtle In-Ad Badge -->
                <span class="fc-interstitial-badge">
                    ${SVG_ICONS.sponsored}
                    <span>Anzeige</span>
                </span>

                <!-- In-Ad Floating Countdown / Subtle Close Action -->
                <div id="fcCountdownContainer" class="fc-countdown-box">
                    <div class="fc-countdown-pill" id="fcCountdownPill">
                        ${SVG_ICONS.timer}
                        <span><strong id="fcCountdownNum" style="color:var(--fc-ad-gold);">${FINCAST_ADS_CONFIG.interstitialCountdownSeconds}</strong>s</span>
                    </div>
                </div>

                <!-- Body (Clean Display Placeholder or Google Ads Slot) -->
                <div class="fc-interstitial-body">
                    ${FINCAST_ADS_CONFIG.mode === 'google_ads' ? `
                        <ins class="adsbygoogle"
                             style="display:inline-block;width:336px;height:280px"
                             data-ad-client="${FINCAST_ADS_CONFIG.googleAdClient}"
                             data-ad-slot="${FINCAST_ADS_CONFIG.adSlots.interstitial}"></ins>
                    ` : `
                        <div style="text-align:center; max-width: 440px; width:100%;">
                            <div style="display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; border-radius:12px; background:rgba(214,168,58,0.1); border:1px solid rgba(214,168,58,0.25); margin-bottom:0.75rem; color:var(--fc-ad-gold);">
                                ${SVG_ICONS.megaphone}
                            </div>
                            <h3 class="fc-placeholder-title" style="font-size:1.2rem; margin-bottom:0.35rem;">
                                Hier könnte Ihre Werbung stehen
                            </h3>
                            <p class="fc-placeholder-desc" style="font-size:0.8rem; margin:0 auto; max-width:380px;">
                                Werbeplatzierung &bull; fincast Institutional Network
                            </p>
                        </div>
                    `}
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
                    // Transform to subtle semi-transparent round circle button
                    countdownContainer.innerHTML = `
                        <button type="button" class="fc-close-circle-btn" id="fcCloseInterstitialBtn" aria-label="Schließen" title="Schließen">
                            ${SVG_ICONS.close}
                        </button>
                    `;

                    const closeBtn = document.getElementById('fcCloseInterstitialBtn');
                    if (closeBtn) {
                        closeBtn.addEventListener('click', closeInterstitial);
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
    // IN-PAGE DISPLAY BANNER GENERATOR (CLEAN STANDARD DIMENSIONS)
    // =========================================================================
    function createPlaceholderBanner(slotName, customTitle, customDesc) {
        const isHorizontal = slotName === 'hubLeaderboardTop' || 
                             slotName === 'hubLeaderboardMid' || 
                             slotName === 'terminalGuidedMid' || 
                             slotName === 'terminalResearchMid' || 
                             slotName === 'calculatorTop' || 
                             slotName === 'hypeTop';

        if (isHorizontal) {
            return `
            <div class="fc-placeholder-card fc-placeholder-horizontal">
                <div class="fc-placeholder-left">
                    <div class="fc-placeholder-tag">
                        ${SVG_ICONS.sponsored}
                        <span>Anzeige &bull; fincast Media Network</span>
                    </div>
                    <h4 class="fc-placeholder-title">${customTitle || 'Hier könnte Ihre Werbung stehen'}</h4>
                    <p class="fc-placeholder-desc">${customDesc || 'Werbeplatzierung &bull; 728x90 Responsive Banner'}</p>
                </div>
                <div class="fc-placeholder-right">
                    <span>728x90</span>
                </div>
            </div>
            `;
        }

        // Standard / Rectangle Slot (300x250)
        return `
        <div class="fc-placeholder-card fc-placeholder-box">
            <div class="fc-placeholder-tag">
                ${SVG_ICONS.sponsored}
                <span>Anzeige</span>
            </div>
            <div style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:10px; background:rgba(214,168,58,0.08); border:1px solid rgba(214,168,58,0.2); color:var(--fc-ad-gold); margin:0.25rem 0;">
                ${SVG_ICONS.target}
            </div>
            <h4 class="fc-placeholder-title">${customTitle || 'Hier könnte Ihre Werbung stehen'}</h4>
            <p class="fc-placeholder-desc">${customDesc || 'Werbeplatzierung &bull; 300x250 Medium Rectangle'}</p>
        </div>
        `;
    }

    function renderInPageAds() {
        const isPremium = isUserPremium();

        if (isPremium) {
            document.body.classList.add('fc-premium-user');
            // Hide all ad containers for premium users
            document.querySelectorAll('.fc-ad-slot, .fc-ad-sticky-bottom').forEach(el => {
                el.style.display = 'none';
            });
            return;
        }

        document.body.classList.remove('fc-premium-user');

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
                // Clean Standard Placeholder Mode
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
