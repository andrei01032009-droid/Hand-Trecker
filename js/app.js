/**
 * ✋ Hand Tracker — Real-time hand tracking with MediaPipe
 * Работает на телефоне и ПК через GitHub Pages
 */

(function () {
    'use strict';

    // ===== DOM ELEMENTS =====
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loader-text');
    const fpsDisplay = document.getElementById('fps');
    const handCountDisplay = document.getElementById('hand-count');
    const gestureDisplay = document.getElementById('gesture');
    const btnFlip = document.getElementById('btn-flip');
    const btnSkeleton = document.getElementById('btn-skeleton');
    const btnPoints = document.getElementById('btn-points');
    const btnFill = document.getElementById('btn-fill');

    // ===== STATE =====
    const state = {
        facingMode: 'user',           // 'user' = фронтальная, 'environment' = задняя
        showSkeleton: true,
        showPoints: true,
        showFill: false,
        currentCamera: null,
        hands: null,
        lastResults: null,
        isRunning: false,
    };

    // ===== FPS COUNTER =====
    const fpsCounter = {
        frames: 0,
        lastTime: performance.now(),
        fps: 0,
        update() {
            this.frames++;
            const now = performance.now();
            const delta = now - this.lastTime;
            if (delta >= 500) {
                this.fps = Math.round((this.frames * 1000) / delta);
                this.frames = 0;
                this.lastTime = now;
                fpsDisplay.textContent = this.fps;
            }
        }
    };

    // ===== HAND CONNECTIONS (для отрисовки скелета) =====
    const HAND_CONNECTIONS = [
        // Большой палец
        [0, 1], [1, 2], [2, 3], [3, 4],
        // Указательный палец
        [0, 5], [5, 6], [6, 7], [7, 8],
        // Средний палец
        [0, 9], [9, 10], [10, 11], [11, 12],
        // Безымянный палец
        [0, 13], [13, 14], [14, 15], [15, 16],
        // Мизинец
        [0, 17], [17, 18], [18, 19], [19, 20],
        // Ладонь
        [5, 9], [9, 13], [13, 17]
    ];

    // ===== FINGER GROUPS (для цветов) =====
    const FINGER_COLORS = {
        thumb: '#FF6B6B',      // Большой — красный
        index: '#FFE66D',      // Указательный — жёлтый
        middle: '#4ECDC4',     // Средний — бирюзовый
        ring: '#45B7D1',       // Безымянный — голубой
        pinky: '#96CEB4',      // Мизинец — зелёный
        palm: '#DDA0DD',       // Ладонь — фиолетовый
        wrist: '#FF9FF3'       // Запястье — розовый
    };

    // Какой палец какому landmark-у принадлежит
    function getFingerColor(index) {
        if (index <= 4) return FINGER_COLORS.thumb;
        if (index <= 8) return FINGER_COLORS.index;
        if (index <= 12) return FINGER_COLORS.middle;
        if (index <= 16) return FINGER_COLORS.ring;
        if (index <= 20) return FINGER_COLORS.pinky;
        return FINGER_COLORS.wrist;
    }

    function getConnectionColor(start, end) {
        // Определяем цвет соединения по конечной точке
        if (end <= 4) return FINGER_COLORS.thumb;
        if (end <= 8) return FINGER_COLORS.index;
        if (end <= 12) return FINGER_COLORS.middle;
        if (end <= 16) return FINGER_COLORS.ring;
        if (end <= 20) return FINGER_COLORS.pinky;
        return FINGER_COLORS.palm;
    }

    // ===== PALM FILL REGIONS =====
    const PALM_TRIANGLES = [
        [0, 1, 5],
        [0, 5, 9],
        [0, 9, 13],
        [0, 13, 17],
    ];

    const FINGER_QUADS = [
        // thumb
        [1, 2, 3, 4],
        // index
        [5, 6, 7, 8],
        // middle
        [9, 10, 11, 12],
        // ring
        [13, 14, 15, 16],
        // pinky
        [17, 18, 19, 20],
    ];

    // ===== GESTURE DETECTION =====
    function detectGesture(landmarks) {
        if (!landmarks || landmarks.length < 21) return '—';

        const tips = [4, 8, 12, 16, 20];
        const pips = [3, 6, 10, 14, 18];

        // Проверяем, вытянут ли каждый палец
        const fingers = [];

        // Большой палец — сравниваем x (а не y) с учётом зеркала
        const thumbUp = landmarks[tips[0]].x < landmarks[pips[0]].x;
        fingers.push(thumbUp);

        // Остальные пальцы — сравниваем y (меньше y = выше)
        for (let i = 1; i < 5; i++) {
            fingers.push(landmarks[tips[i]].y < landmarks[pips[i]].y);
        }

        const count = fingers.filter(Boolean).length;

        // Определяем жесты
        if (count === 0) return '✊ Кулак';
        if (count === 5) return '🖐 Ладонь';

        if (!fingers[0] && fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) {
            return '☝️ Указатель';
        }

        if (!fingers[0] && fingers[1] && fingers[2] && !fingers[3] && !fingers[4]) {
            return '✌️ Мир';
        }

        if (fingers[0] && !fingers[1] && !fingers[2] && !fingers[3] && fingers[4]) {
            return '🤙 Шака';
        }

        if (fingers[0] && fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) {
            return '🔫 Пистолет';
        }

        if (!fingers[0] && !fingers[1] && !fingers[2] && !fingers[3] && fingers[4]) {
            return '🤙 Мизинец';
        }

        if (fingers[0] && !fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) {
            return '👍 Лайк';
        }

        if (!fingers[0] && fingers[1] && fingers[2] && fingers[3] && !fingers[4]) {
            return '🤟 Три';
        }

        if (!fingers[0] && fingers[1] && fingers[2] && fingers[3] && fingers[4]) {
            return '🖖 Четыре';
        }

        return `${count} ☝️`;
    }

    // ===== SMOOTH LANDMARKS (для уменьшения дрожания) =====
    const smoothedLandmarks = new Map();
    const SMOOTH_FACTOR = 0.6; // 0 = нет сглаживания, 1 = максимальное

    function smoothLandmark(handIndex, pointIndex, newPoint) {
        const key = `${handIndex}_${pointIndex}`;
        const prev = smoothedLandmarks.get(key);

        if (!prev) {
            smoothedLandmarks.set(key, { x: newPoint.x, y: newPoint.y, z: newPoint.z });
            return newPoint;
        }

        const smoothed = {
            x: prev.x + (newPoint.x - prev.x) * (1 - SMOOTH_FACTOR),
            y: prev.y + (newPoint.y - prev.y) * (1 - SMOOTH_FACTOR),
            z: prev.z + (newPoint.z - prev.z) * (1 - SMOOTH_FACTOR),
        };

        smoothedLandmarks.set(key, smoothed);
        return smoothed;
    }

    // ===== DRAWING FUNCTIONS =====

    function drawFilledHand(landmarks, w, h) {
        // Рисуем заливку ладони
        ctx.globalAlpha = 0.15;

        PALM_TRIANGLES.forEach(tri => {
            ctx.beginPath();
            ctx.fillStyle = FINGER_COLORS.palm;
            ctx.moveTo(landmarks[tri[0]].x * w, landmarks[tri[0]].y * h);
            ctx.lineTo(landmarks[tri[1]].x * w, landmarks[tri[1]].y * h);
            ctx.lineTo(landmarks[tri[2]].x * w, landmarks[tri[2]].y * h);
            ctx.closePath();
            ctx.fill();
        });

        // Заливка между пальцами
        const interFingerRegions = [
            [5, 6, 10, 9],
            [9, 10, 14, 13],
            [13, 14, 18, 17],
        ];

        interFingerRegions.forEach(quad => {
            ctx.beginPath();
            ctx.fillStyle = FINGER_COLORS.palm;
            ctx.moveTo(landmarks[quad[0]].x * w, landmarks[quad[0]].y * h);
            quad.forEach(idx => {
                ctx.lineTo(landmarks[idx].x * w, landmarks[idx].y * h);
            });
            ctx.closePath();
            ctx.fill();
        });

        ctx.globalAlpha = 1.0;
    }

    function drawSkeleton(landmarks, w, h) {
        HAND_CONNECTIONS.forEach(([start, end]) => {
            const x1 = landmarks[start].x * w;
            const y1 = landmarks[start].y * h;
            const x2 = landmarks[end].x * w;
            const y2 = landmarks[end].y * h;

            // Рассчитываем толщину линии на основе z-координаты
            const avgZ = (landmarks[start].z + landmarks[end].z) / 2;
            const lineWidth = Math.max(1.5, 4 - avgZ * 30);

            const color = getConnectionColor(start, end);

            // Основная линия
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Свечение
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth + 3;
            ctx.globalAlpha = 0.2;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        });
    }

    function drawPoints(landmarks, w, h) {
        landmarks.forEach((point, index) => {
            const x = point.x * w;
            const y = point.y * h;

            // Размер точки зависит от z (ближе = больше)
            const baseRadius = [0, 5, 9, 13, 17].includes(index) ? 7 : 5;
            const tipPoints = [4, 8, 12, 16, 20];
            const radius = tipPoints.includes(index)
                ? Math.max(4, baseRadius - point.z * 25)
                : Math.max(3, baseRadius - 1 - point.z * 20);

            const color = getFingerColor(index);

            // Свечение
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.fillStyle = gradient;
            ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Точка
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Белая серединка для кончиков пальцев
            if (tipPoints.includes(index)) {
                ctx.beginPath();
                ctx.fillStyle = '#fff';
                ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Обводка для запястья
            if (index === 0) {
                ctx.beginPath();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }

    // Рисуем линию между большим и указательным (расстояние pinch)
    function drawPinchLine(landmarks, w, h) {
        const thumb = landmarks[4];
        const index = landmarks[8];

        const dx = (thumb.x - index.x) * w;
        const dy = (thumb.y - index.y) * h;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 80) {
            const alpha = Math.max(0, 1 - distance / 80);

            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(thumb.x * w, thumb.y * h);
            ctx.lineTo(index.x * w, index.y * h);
            ctx.stroke();
            ctx.setLineDash([]);

            // Точка в центре
            const cx = ((thumb.x + index.x) / 2) * w;
            const cy = ((thumb.y + index.y) / 2) * h;

            ctx.beginPath();
            ctx.fillStyle = `rgba(0, 245, 160, ${alpha})`;
            ctx.arc(cx, cy, 4 + (1 - distance / 80) * 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ===== MAIN DRAW FUNCTION =====
    function drawHands(results) {
        const w = canvas.width;
        const h = canvas.height;

        // Очищаем canvas
        ctx.clearRect(0, 0, w, h);

        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            handCountDisplay.textContent = '0';
            gestureDisplay.textContent = '—';
            return;
        }

        handCountDisplay.textContent = results.multiHandLandmarks.length;

        results.multiHandLandmarks.forEach((landmarks, handIndex) => {
            // Сглаживаем точки
            const smoothed = landmarks.map((point, pointIndex) =>
                smoothLandmark(handIndex, pointIndex, point)
            );

            // Зеркалим координаты (т.к. видео отзеркалено)
            const mirrored = smoothed.map(p => ({
                x: 1 - p.x,
                y: p.y,
                z: p.z
            }));

            // Рисуем в порядке: заливка -> скелет -> точки
            if (state.showFill) {
                drawFilledHand(mirrored, w, h);
            }

            if (state.showSkeleton) {
                drawSkeleton(mirrored, w, h);
            }

            if (state.showPoints) {
                drawPoints(mirrored, w, h);
            }

            // Линия pinch
            drawPinchLine(mirrored, w, h);

            // Определяем жест (по первой руке)
            if (handIndex === 0) {
                const gesture = detectGesture(smoothed);
                gestureDisplay.textContent = gesture;
            }
        });
    }

    // ===== RESIZE CANVAS =====
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    // ===== INITIALIZE MEDIAPIPE HANDS =====
    function initHands() {
        loaderText.textContent = 'Инициализация MediaPipe...';

        state.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        state.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,       // 0 = лёгкая, 1 = полная
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5,
        });

        state.hands.onResults(onResults);

        loaderText.textContent = 'Загрузка модели нейросети...';
    }

    // ===== CALLBACK ОТ MEDIAPIPE =====
    function onResults(results) {
        state.lastResults = results;
        fpsCounter.update();
        drawHands(results);
    }

    // ===== START CAMERA =====
    async function startCamera() {
        loaderText.textContent = 'Запуск камеры...';

        // Останавливаем предыдущую камеру
        if (state.currentCamera) {
            state.currentCamera.stop();
        }

        try {
            const camera = new Camera(video, {
                onFrame: async () => {
                    if (state.hands) {
                        await state.hands.send({ image: video });
                    }
                },
                width: 640,
                height: 480,
                facingMode: state.facingMode,
            });

            state.currentCamera = camera;
            await camera.start();

            // Скрываем загрузчик после первого фрейма
            setTimeout(() => {
                loader.classList.add('hidden');
                state.isRunning = true;
            }, 1000);

        } catch (error) {
            console.error('Ошибка камеры:', error);
            loaderText.textContent = '❌ Нет доступа к камере. Разрешите доступ и обновите страницу.';
        }
    }

    // ===== FLIP CAMERA =====
    async function flipCamera() {
        state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';

        // Анимация кнопки
        btnFlip.style.transform = 'rotate(180deg)';
        setTimeout(() => btnFlip.style.transform = '', 300);

        await startCamera();
    }

    // ===== TOGGLE BUTTONS =====
    function toggleButton(btn, stateKey) {
        state[stateKey] = !state[stateKey];
        btn.classList.toggle('active', state[stateKey]);
    }

    // ===== EVENT LISTENERS =====
    function setupControls() {
        btnFlip.addEventListener('click', flipCamera);

        btnSkeleton.addEventListener('click', () => {
            toggleButton(btnSkeleton, 'showSkeleton');
        });

        btnPoints.addEventListener('click', () => {
            toggleButton(btnPoints, 'showPoints');
        });

        btnFill.addEventListener('click', () => {
            toggleButton(btnFill, 'showFill');
        });

        // Ресайз
        window.addEventListener('resize', resizeCanvas);

        // Предотвращаем скролл на мобильных
        document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

        // Полноэкранный режим по двойному тапу
        document.addEventListener('dblclick', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.() ||
                document.documentElement.webkitRequestFullscreen?.();
            } else {
                document.exitFullscreen?.() ||
                document.webkitExitFullscreen?.();
            }
        });
    }

    // ===== WAKE LOCK (не давать экрану гаснуть) =====
    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                await navigator.wakeLock.request('screen');
            }
        } catch (e) {
            // Не критично
        }
    }

    // ===== INIT =====
    async function init() {
        resizeCanvas();
        setupControls();
        initHands();
        await startCamera();
        requestWakeLock();
    }

    // Запуск при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
