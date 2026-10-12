/* SQL Quest - sound & animation effects (add-on, works on every page).
 *
 * Loaded by: login, dashboard, game and practice pages.
 * It does NOT modify any existing script. It watches the page with
 * MutationObservers and click listeners and reacts to what the page already does.
 *
 * Sounds are generated with the Web Audio API (no audio files).
 * Two buttons (bottom-left) let the player mute sounds (🔊) or turn off
 * the ambient visuals (✨). Both choices are saved in localStorage.
 */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const reducedMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    const finePointer = window.matchMedia ? window.matchMedia('(pointer: fine)').matches : false;

    const SOUND_KEY = 'sqlQuest.soundEnabled';
    const VISUALS_KEY = 'sqlQuest.visualFx';
    const ACTION_WINDOW_MS = 60000; // effects only react shortly after a player action
    const MILESTONE_EVERY = 5; // big confetti every N correct answers

    const readPref = key => {
        try {
            return localStorage.getItem(key) !== 'off';
        } catch {
            return true; // storage blocked - keep default
        }
    };
    const writePref = (key, enabled) => {
        try {
            localStorage.setItem(key, enabled ? 'on' : 'off');
        } catch {
            /* ignore */
        }
    };

    let soundEnabled = readPref(SOUND_KEY);
    let visualsEnabled = readPref(VISUALS_KEY);
    document.body.classList.toggle('fx-visuals-off', !visualsEnabled);

    const lastAction = { submit: 0, hint: 0, next: 0, generate: 0, chat: 0 };
    const recent = kind => Date.now() - lastAction[kind] < ACTION_WINDOW_MS;

    let correctCount = 0;
    let streak = 0;

    /* ======================= Sound (Web Audio) ======================= */

    let audioContext = null;
    const getAudio = () => {
        if (!audioContext) {
            const AudioCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtor) return null;
            try {
                audioContext = new AudioCtor();
            } catch {
                return null;
            }
        }
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        return audioContext;
    };

    const tone = (frequency, delay, duration, { type = 'sine', gain = 0.12, slideTo = null } = {}) => {
        const ctx = getAudio();
        if (!ctx) return;
        const start = ctx.currentTime + delay;
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(envelope).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.05);
    };

    const sounds = {
        correct() {
            [523.25, 659.25, 783.99].forEach((note, index) =>
                tone(note, index * 0.09, 0.22, { type: 'triangle', gain: 0.14 }));
        },
        wrong() {
            tone(220, 0, 0.32, { type: 'sawtooth', gain: 0.1, slideTo: 90 });
            tone(165, 0.12, 0.34, { type: 'square', gain: 0.06, slideTo: 70 });
        },
        softError() {
            tone(330, 0, 0.12, { type: 'square', gain: 0.05 });
        },
        hint() {
            tone(880, 0, 0.18, { gain: 0.1 });
            tone(1318.5, 0.1, 0.28, { gain: 0.08 });
        },
        milestone() {
            [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((note, index) =>
                tone(note, index * 0.08, 0.3, { type: 'triangle', gain: 0.13 }));
        },
        gameOver() {
            [392, 349.23, 311.13, 261.63].forEach((note, index) =>
                tone(note, index * 0.2, 0.42, { type: 'sawtooth', gain: 0.08, slideTo: note * 0.94 }));
        },
        toggleOn() {
            tone(660, 0, 0.1, { gain: 0.08 });
        },
        whoosh() {
            tone(280, 0, 0.28, { gain: 0.045, slideTo: 1100 });
        },
        combo() {
            tone(1046.5, 0, 0.12, { type: 'triangle', gain: 0.08 });
            tone(1568, 0.08, 0.25, { type: 'triangle', gain: 0.07 });
        },
        tick() {
            tone(1250, 0, 0.045, { type: 'square', gain: 0.016 });
        },
        select(index = 0) {
            const base = [523.25, 659.25, 783.99][index % 3];
            tone(base, 0, 0.14, { type: 'triangle', gain: 0.09 });
            tone(base * 2, 0.07, 0.16, { type: 'sine', gain: 0.05 });
        },
        start() {
            [261.63, 329.63, 392, 523.25, 659.25].forEach((note, index) =>
                tone(note, index * 0.07, 0.22, { type: 'triangle', gain: 0.1 }));
            tone(130.81, 0, 0.5, { type: 'sine', gain: 0.1, slideTo: 261.63 });
        },
        open() {
            tone(420, 0, 0.16, { gain: 0.05, slideTo: 760 });
        },
        message() {
            tone(988, 0, 0.08, { gain: 0.05 });
            tone(1318.5, 0.07, 0.13, { gain: 0.04 });
        },
    };

    const play = (name, ...args) => {
        if (!soundEnabled) return;
        try {
            sounds[name](...args);
        } catch {
            /* never let audio break the page */
        }
    };

    // Browsers only allow audio after a user gesture - unlock on the first one.
    const unlockAudio = () => {
        getAudio();
        document.removeEventListener('pointerdown', unlockAudio, true);
        document.removeEventListener('keydown', unlockAudio, true);
    };
    document.addEventListener('pointerdown', unlockAudio, true);
    document.addEventListener('keydown', unlockAudio, true);

    /* ======================= Visual helpers ======================= */

    const restartClass = (element, className, removeAfterMs = 1000) => {
        if (!element || reducedMotion) return;
        element.classList.remove(className);
        void element.offsetWidth; // force reflow so the animation restarts
        element.classList.add(className);
        window.setTimeout(() => element.classList.remove(className), removeAfterMs);
    };

    const flash = kind => {
        if (reducedMotion) return;
        const overlay = document.createElement('div');
        overlay.className = 'fx-flash';
        overlay.dataset.kind = kind;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.append(overlay);
        window.setTimeout(() => overlay.remove(), 800);
    };

    const floatText = (text, anchor) => {
        if (reducedMotion || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        const label = document.createElement('span');
        label.className = 'fx-float';
        label.textContent = text;
        label.setAttribute('aria-hidden', 'true');
        label.style.left = `${rect.left + rect.width / 2 - 14}px`;
        label.style.top = `${rect.bottom + 4}px`;
        document.body.append(label);
        window.setTimeout(() => label.remove(), 1200);
    };

    const showCombo = count => {
        if (reducedMotion) return;
        const toast = document.createElement('div');
        toast.className = 'fx-combo';
        toast.textContent = `🔥 COMBO x${count}`;
        toast.setAttribute('aria-hidden', 'true');
        document.body.append(toast);
        window.setTimeout(() => toast.remove(), 1700);
    };

    /* ----------------------- Confetti (canvas) ----------------------- */

    const confettiColors = ['#00fff5', '#00ff88', '#b967ff', '#ffd166', '#ff356e'];
    let confettiCanvas = null;
    let confettiParticles = [];
    let confettiFrame = 0;

    const stepConfetti = () => {
        const ctx = confettiCanvas.getContext('2d');
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        confettiParticles = confettiParticles.filter(p => p.life > 0 && p.y < confettiCanvas.height + 40);
        confettiParticles.forEach(p => {
            p.vy += 0.18;
            p.vx *= 0.99;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.spin;
            p.life -= 1;
            ctx.save();
            ctx.globalAlpha = Math.min(1, p.life / 30);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
        });
        if (confettiParticles.length) {
            confettiFrame = requestAnimationFrame(stepConfetti);
        } else {
            confettiFrame = 0;
            confettiCanvas.remove();
            confettiCanvas = null;
        }
    };

    const confetti = (count, originX = 0.5, originY = 0.35) => {
        if (reducedMotion) return;
        if (!confettiCanvas) {
            confettiCanvas = document.createElement('canvas');
            confettiCanvas.className = 'fx-confetti';
            confettiCanvas.setAttribute('aria-hidden', 'true');
            document.body.append(confettiCanvas);
        }
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
        for (let index = 0; index < count; index++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 9;
            confettiParticles.push({
                x: confettiCanvas.width * originX,
                y: confettiCanvas.height * originY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 4,
                size: 6 + Math.random() * 8,
                rotation: Math.random() * Math.PI,
                spin: (Math.random() - 0.5) * 0.4,
                color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
                life: 70 + Math.random() * 60,
            });
        }
        if (!confettiFrame) confettiFrame = requestAnimationFrame(stepConfetti);
    };

    // Shared "answer was right / wrong" reactions (game + practice).
    const celebrateCorrect = () => {
        correctCount += 1;
        streak += 1;
        flash('success');
        if (streak >= 2) {
            showCombo(streak);
            window.setTimeout(() => play('combo'), 350);
        }
        if (correctCount % MILESTONE_EVERY === 0) {
            play('milestone');
            confetti(170);
        } else {
            play('correct');
            confetti(45);
        }
    };

    /* ======================= Global (every page) ======================= */

    // --- Page entrance: soft fade + one neon scan line ---
    if (!reducedMotion) {
        document.body.classList.add('fx-page-in');
        window.setTimeout(() => document.body.classList.remove('fx-page-in'), 900);
        if (visualsEnabled) {
            const scan = document.createElement('div');
            scan.className = 'fx-scan';
            scan.setAttribute('aria-hidden', 'true');
            document.body.append(scan);
            window.setTimeout(() => scan.remove(), 1500);
        }
    }

    // --- Ambient floating particles ---
    const ambientColors = ['0,255,245', '185,103,255', '0,255,136'];
    let ambientCanvas = null;
    let ambientFrame = 0;
    let ambientDots = [];

    const seedAmbient = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const count = Math.min(70, Math.round((width * height) / 26000));
        ambientDots = Array.from({ length: count }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            r: 0.8 + Math.random() * 1.8,
            vx: (Math.random() - 0.5) * 0.12,
            vy: -(0.08 + Math.random() * 0.22),
            phase: Math.random() * Math.PI * 2,
            color: ambientColors[Math.floor(Math.random() * ambientColors.length)],
        }));
    };

    const drawAmbient = time => {
        const ctx = ambientCanvas.getContext('2d');
        const width = ambientCanvas.width;
        const height = ambientCanvas.height;
        ctx.clearRect(0, 0, width, height);
        ambientDots.forEach(dot => {
            dot.x += dot.vx;
            dot.y += dot.vy;
            if (dot.y < -10) { dot.y = height + 10; dot.x = Math.random() * width; }
            if (dot.x < -10) dot.x = width + 10;
            if (dot.x > width + 10) dot.x = -10;
            const alpha = Math.max(0.06, 0.28 + 0.34 * Math.sin(time / 1200 + dot.phase));
            ctx.beginPath();
            ctx.fillStyle = `rgba(${dot.color},${alpha * 0.18})`;
            ctx.arc(dot.x, dot.y, dot.r * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.fillStyle = `rgba(${dot.color},${alpha})`;
            ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ambientFrame = requestAnimationFrame(drawAmbient);
    };

    const sizeAmbient = () => {
        if (!ambientCanvas) return;
        ambientCanvas.width = window.innerWidth;
        ambientCanvas.height = window.innerHeight;
        seedAmbient();
    };

    const startAmbient = () => {
        if (reducedMotion || !visualsEnabled || document.hidden || ambientFrame) return;
        if (!ambientCanvas) {
            ambientCanvas = document.createElement('canvas');
            ambientCanvas.className = 'fx-ambient';
            ambientCanvas.setAttribute('aria-hidden', 'true');
            document.body.prepend(ambientCanvas);
            sizeAmbient();
        }
        ambientFrame = requestAnimationFrame(drawAmbient);
    };

    const stopAmbient = () => {
        if (ambientFrame) cancelAnimationFrame(ambientFrame);
        ambientFrame = 0;
    };

    window.addEventListener('resize', sizeAmbient);
    document.addEventListener('visibilitychange', () => (document.hidden ? stopAmbient() : startAmbient()));
    startAmbient();

    // --- Cursor glow (desktop mouse only) ---
    if (!reducedMotion && finePointer) {
        const glow = document.createElement('div');
        glow.className = 'fx-cursor-glow';
        glow.setAttribute('aria-hidden', 'true');
        document.body.append(glow);
        let glowX = 0;
        let glowY = 0;
        let glowQueued = false;
        window.addEventListener('pointermove', event => {
            glowX = event.clientX;
            glowY = event.clientY;
            if (glowQueued) return;
            glowQueued = true;
            requestAnimationFrame(() => {
                glowQueued = false;
                glow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0)`;
                glow.classList.add('is-active');
            });
        }, { passive: true });
        document.addEventListener('mouseleave', () => glow.classList.remove('is-active'));
    }

    // --- Click ring + UI sounds for any button on any page ---
    const SILENT_BUTTON_IDS = new Set([
        'submitButton', 'hintButton', 'nextHintButton', 'authSwitchButton',
        'startGameButton',
    ]);

    document.addEventListener('click', event => {
        const button = event.target.closest && event.target.closest('button, .button, .btn, [role="button"]');
        if (!button || button.disabled) return;

        // Remember player actions the page-specific effects wait for.
        if (button.id === 'submitButton') lastAction.submit = Date.now();
        if (button.id === 'hintButton' || button.id === 'nextHintButton') lastAction.hint = Date.now();
        if (button.id === 'nextQuestionButton' || button.classList.contains('next-question')) lastAction.next = Date.now();
        if (button.id === 'generateButton') lastAction.generate = Date.now();
        if (button.id === 'chatSend') lastAction.chat = Date.now();

        if (button.classList.contains('fx-sound-toggle')) return;

        // Neon ring where the pointer clicked.
        if (!reducedMotion && (event.clientX || event.clientY)) {
            const ring = document.createElement('span');
            ring.className = 'fx-ripple';
            ring.setAttribute('aria-hidden', 'true');
            ring.style.left = `${event.clientX}px`;
            ring.style.top = `${event.clientY}px`;
            document.body.append(ring);
            window.setTimeout(() => ring.remove(), 700);
        }

        // Sounds
        if (button.id === 'startGameButton') {
            play('start');
        } else if (button.classList.contains('difficulty-button')) {
            const siblings = Array.from(button.parentElement ? button.parentElement.children : []);
            play('select', Math.max(0, siblings.indexOf(button)));
        } else if (!SILENT_BUTTON_IDS.has(button.id)) {
            play('tick');
        }
    }, true);

    // Forms submitted with Enter count as actions too.
    document.addEventListener('submit', event => {
        const id = event.target && event.target.id;
        if (id === 'answerForm') lastAction.submit = Date.now();
        if (id === 'topicForm') lastAction.generate = Date.now();
        if (id === 'chatForm') lastAction.chat = Date.now();
    }, true);

    // --- Input / editor glows while typing ---
    const typingTimers = new WeakMap();
    document.addEventListener('input', event => {
        const field = event.target;
        if (!field || !field.matches || !field.matches('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"])')) return;
        const target = field.closest('.editor-frame') || field;
        target.classList.add('fx-typing-field');
        window.clearTimeout(typingTimers.get(target));
        typingTimers.set(target, window.setTimeout(() => target.classList.remove('fx-typing-field'), 700));
    }, true);

    // --- Dialogs (dashboard guide / leaderboard / feature, practice history) ---
    document.querySelectorAll('dialog').forEach(dialog => {
        let wasOpen = dialog.open;
        new MutationObserver(() => {
            if (dialog.open && !wasOpen) play('open');
            wasOpen = dialog.open;
        }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    });

    // --- Chat messages slide in (+ soft sound for the AI's reply) ---
    const chatMessages = $('chatMessages');
    if (chatMessages) {
        new MutationObserver(mutations => {
            mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
                if (node.nodeType !== 1 || !node.classList.contains('chat-message')) return;
                restartClass(node, 'fx-message-in', 600);
                if (node.classList.contains('chat-message-assistant') && Date.now() - lastAction.chat < 90000) {
                    play('message');
                }
            }));
        }).observe(chatMessages, { childList: true });
    }

    // --- New question / exercise slides in (game + practice) ---
    const questionText = $('questionText');
    if (questionText) {
        let questionTimer = 0;
        new MutationObserver(() => {
            window.clearTimeout(questionTimer);
            questionTimer = window.setTimeout(() => {
                if (!questionText.textContent.trim()) return;
                [questionText, $('questionTitle'), $('exerciseTitle'), $('schemaTableWrap'), $('tableList')]
                    .forEach(element => restartClass(element, 'fx-question-in', 700));
                if (recent('submit') || recent('next') || recent('generate')) {
                    lastAction.next = 0;
                    lastAction.generate = 0;
                    play('whoosh');
                }
            }, 120);
        }).observe(questionText, { childList: true, characterData: true, subtree: true });
    }

    /* ======================= Login page ======================= */

    if ($('loginForm')) {
        const authCard = document.querySelector('.auth-container');

        // Error messages: shake the card.
        ['loginError', 'registerError', 'googleError'].forEach(id => {
            const box = $(id);
            if (!box) return;
            new MutationObserver(() => {
                if (box.hidden || !box.textContent.trim()) return;
                play('softError');
                restartClass(authCard, 'fx-shake', 600);
            }).observe(box, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        });

        // Account created: small celebration.
        const registerStatus = $('registerStatus');
        if (registerStatus) {
            new MutationObserver(() => {
                if (registerStatus.hidden || !registerStatus.textContent.trim()) return;
                play('correct');
                confetti(60, 0.5, 0.45);
            }).observe(registerStatus, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        }

        // Switching between Login and Register.
        const switchButton = $('authSwitchButton');
        if (switchButton) {
            switchButton.addEventListener('click', () => {
                play('whoosh');
                window.setTimeout(() => {
                    ['authTitle', 'authSubtitle', 'loginForm', 'registerForm'].forEach(id =>
                        restartClass($(id), 'fx-question-in', 700));
                }, 0);
            });
        }
    }

    /* ======================= Dashboard page ======================= */

    if ($('launchPanel')) {
        // Score changes pop.
        const dashboardScore = $('dashboardScore');
        if (dashboardScore) {
            new MutationObserver(() => restartClass(dashboardScore, 'fx-score-pop', 700))
                .observe(dashboardScore, { childList: true, characterData: true, subtree: true });
        }

        // Leaderboard rows cascade in.
        const leaderboardRows = $('leaderboardRows');
        if (leaderboardRows) {
            new MutationObserver(() => {
                if (reducedMotion) return;
                Array.from(leaderboardRows.children).forEach((row, index) => {
                    row.style.animationDelay = `${Math.min(index, 14) * 45}ms`;
                    row.classList.add('fx-row-in');
                });
            }).observe(leaderboardRows, { childList: true });
        }
    }

    /* ======================= Practice page ======================= */

    if ($('answerForm') && $('answerFeedback')) {
        const feedback = $('answerFeedback');
        const answerBox = $('sqlAnswer');

        new MutationObserver(() => {
            if (feedback.hidden || !recent('submit')) return;
            lastAction.submit = 0;
            restartClass(feedback, 'fx-result-in', 500);
            if (feedback.dataset.correct === 'true') {
                celebrateCorrect();
            } else {
                streak = 0;
                flash('error');
                play('softError');
                restartClass(feedback, 'fx-shake', 600);
                restartClass(answerBox, 'fx-shake', 600);
            }
        }).observe(feedback, { attributes: true, attributeFilter: ['hidden', 'data-correct'], childList: true, characterData: true, subtree: true });

        const hintText = $('hintText');
        if (hintText) {
            new MutationObserver(() => {
                if (!hintText.textContent.trim() || !recent('hint')) return;
                lastAction.hint = 0;
                play('hint');
                restartClass($('hintPanel'), 'fx-hint-glow', 1000);
            }).observe(hintText, { childList: true, characterData: true, subtree: true });
        }
    }

    /* ======================= Game page ======================= */

    const resultPanel = $('resultPanel');
    const gameScore = $('gameScore');
    const gameLives = $('gameLives');

    if (resultPanel && gameScore && gameLives) {
        const hintDisplay = $('hintDisplay');
        const gameOverScreen = $('gameOverScreen');
        const gameHistoryView = $('gameHistoryView');
        const editor = $('sqlEditor');

        // Last-life warning: heartbeat + red vignette
        let dangerVignette = null;
        const updateDanger = () => {
            const remaining = gameLives.querySelectorAll('.game-heart:not(.is-lost)').length;
            const inDanger = remaining === 1;
            gameLives.classList.toggle('fx-danger', inDanger);
            if (inDanger && !dangerVignette) {
                dangerVignette = document.createElement('div');
                dangerVignette.className = 'fx-danger-vignette';
                dangerVignette.setAttribute('aria-hidden', 'true');
                document.body.append(dangerVignette);
            } else if (!inDanger && dangerVignette) {
                dangerVignette.remove();
                dangerVignette = null;
            }
        };

        // 1) Answer result: correct / wrong
        new MutationObserver(() => {
            if (resultPanel.hidden || !recent('submit')) return;
            const state = resultPanel.dataset.state;
            const text = resultPanel.textContent || '';

            restartClass(resultPanel, 'fx-result-in', 500);

            if (state === 'success') {
                celebrateCorrect();
            } else if (state === 'error') {
                streak = 0;
                if (/life lost/i.test(text)) {
                    flash('error');
                    play('wrong');
                    restartClass(resultPanel, 'fx-shake', 600);
                    restartClass(editor, 'fx-shake', 600);
                } else {
                    play('softError'); // e.g. "Write a SQL query first"
                    restartClass(resultPanel, 'fx-shake', 600);
                }
            }
        }).observe(resultPanel, { childList: true, attributes: true, attributeFilter: ['data-state', 'hidden'] });

        // 2) Hearts: animate the heart that was just lost
        const heartWasLost = new WeakMap();
        gameLives.querySelectorAll('.game-heart').forEach(heart => {
            heartWasLost.set(heart, heart.classList.contains('is-lost'));
            new MutationObserver(() => {
                const lost = heart.classList.contains('is-lost');
                const before = heartWasLost.get(heart);
                heartWasLost.set(heart, lost);
                if (lost && !before && recent('submit')) restartClass(heart, 'fx-heart-break', 900);
                updateDanger();
            }).observe(heart, { attributes: true, attributeFilter: ['class'] });
        });
        updateDanger();

        // 3) Score: pop + floating "+N"
        let lastScore = parseInt(gameScore.textContent, 10) || 0;
        new MutationObserver(() => {
            const score = parseInt(gameScore.textContent, 10);
            if (Number.isNaN(score)) return;
            const delta = score - lastScore;
            lastScore = score;
            if (delta > 0 && recent('submit')) {
                restartClass(gameScore, 'fx-score-pop', 700);
                floatText(`+${delta}`, gameScore);
            }
        }).observe(gameScore, { childList: true, characterData: true, subtree: true });

        // 4) Hint unlocked
        if (hintDisplay) {
            new MutationObserver(() => {
                if (hintDisplay.hidden || !hintDisplay.textContent.trim() || !recent('hint')) return;
                lastAction.hint = 0; // one sound per click
                play('hint');
                restartClass(hintDisplay, 'fx-hint-glow', 1000);
            }).observe(hintDisplay, { childList: true, characterData: true, subtree: true });
        }

        // 5) Game over screen
        if (gameOverScreen) {
            new MutationObserver(() => {
                const isGameOver = !gameOverScreen.hidden && (!gameHistoryView || gameHistoryView.hidden);
                if (isGameOver && recent('submit')) {
                    lastAction.submit = 0;
                    streak = 0;
                    play('gameOver');
                }
            }).observe(gameOverScreen, { attributes: true, attributeFilter: ['hidden'] });
        }
    }

})();
