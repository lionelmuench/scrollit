// ===== SCROLLIT — game.js =====

// ---------- CONSTANTS ----------
const WHEEL_SENSITIVITY = 8;
const BOUNCE_DELAY = 60;
const BOUNCE_DURATION = 180;
const LETTER_CHANGE_FACTOR = 0.7;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ---------- STATE ----------
let wordSet = new Set();
let puzzles = [];
let puzzleIndex = 0;

let currentPuzzle = null;   // { start, target, optimal, optimalPath }
let prevWord = '';          // last accepted word
let columns = [0, 0, 0, 0];   // current letter indices
let guessHistory = [];      // all accepted words
let lastChangedSlot = -1;   // -1 = none (first turn)
let isFirstTurn = true;
let stepCount = 0;
let gameOver = false;

// ---------- DOM REFS ----------
const targetWordEl = document.getElementById('target-word');
const stepsCountEl = document.getElementById('steps-count');
const chainTrack = document.getElementById('chain-track');
const winOverlay = document.getElementById('win-overlay');
const winStepsEl = document.getElementById('win-steps');
const winOptimalEl = document.getElementById('win-optimal');
const winChainEl = document.getElementById('win-chain');
const winOptimalChainEl = document.getElementById('win-optimal-chain');
const checkBtn = document.getElementById('checkmark-btn');
const resetBtn = document.getElementById('reset-btn');
const playAgainBtn = document.getElementById('btn-play-again');
const restartBtn = document.getElementById('btn-restart');
const restartInlineBtn = document.getElementById('restart-btn');
const toastContainer = document.getElementById('toast-container');

// ---------- INIT ----------
(async function init() {
    const [wordText, puzzleData] = await Promise.all([
        fetch('wordlist.txt').then(r => r.text()),
        fetch('puzzles.json').then(r => r.json())
    ]);

    // Build word set (4-letter only, uppercase)
    wordText.trim().split('\n').forEach(w => {
        const upper = w.trim().toUpperCase();
        if (upper.length === 4) wordSet.add(upper);
    });

    puzzles = puzzleData;
    puzzleIndex = Math.floor(Math.random() * puzzles.length);

    startNewPuzzle();
    wireButtons();
})();

// ---------- PUZZLE MANAGEMENT ----------
function startNewPuzzle() {
    currentPuzzle = puzzles[puzzleIndex];
    prevWord = currentPuzzle.start;
    columns = prevWord.split('').map(ch => ALPHABET.indexOf(ch));
    guessHistory = [prevWord];
    lastChangedSlot = -1;
    isFirstTurn = true;
    stepCount = 0;
    gameOver = false;

    // Update UI
    targetWordEl.textContent = currentPuzzle.target;
    stepsCountEl.textContent = '0';
    chainTrack.innerHTML = '';
    addChainWord(prevWord, true);

    // Close win overlay if open
    winOverlay.classList.remove('active');

    // Build scroll columns
    initColumns();
}

function nextPuzzle() {
    puzzleIndex = (puzzleIndex + 1) % puzzles.length;
    startNewPuzzle();
}

function restartPuzzle() {
    startNewPuzzle();
}

// ---------- SCROLL COLUMNS ----------
function initColumns() {
    document.querySelectorAll('.letter-column').forEach((col, idx) => {
        setupColumn(col, idx);
        col.classList.remove('last-used');
    });
}

function setupColumn(columnEl, colIdx) {
    let index = columns[colIdx];
    const wrapper = document.createElement('div');
    wrapper.className = 'letter-wrapper';
    columnEl.innerHTML = '';
    columnEl.appendChild(wrapper);

    const slotH = columnEl.clientHeight / 3;
    const threshold = slotH * LETTER_CHANGE_FACTOR;
    let offset = 0;
    let isDragging = false;
    let startY = 0;
    let wheelTimer = null;

    function makeLetter(ch, cls) {
        const el = document.createElement('div');
        el.className = 'letter ' + cls;
        el.textContent = ch;
        return el;
    }

    function renderLetters() {
        wrapper.innerHTML = '';
        wrapper.appendChild(makeLetter(ALPHABET[(index - 1 + 26) % 26], 'letter-above'));
        wrapper.appendChild(makeLetter(ALPHABET[index], 'active'));
        wrapper.appendChild(makeLetter(ALPHABET[(index + 1) % 26], 'letter-below'));
    }

    renderLetters();

    // --- Shared drag logic ---
    function onDragStart(y) {
        if (gameOver) return;
        clearTimeout(wheelTimer);
        isDragging = true;
        startY = y;
        offset = 0;
        wrapper.style.transition = 'none';
    }

    function onDragMove(y) {
        if (!isDragging) return;
        const delta = y - startY;
        offset += delta;
        wrapper.style.transform = `translateY(${offset}px)`;

        while (offset > threshold) {
            index = (index - 1 + 26) % 26;
            renderLetters();
            offset -= slotH;
            wrapper.style.transform = `translateY(${offset}px)`;
        }
        while (offset < -threshold) {
            index = (index + 1) % 26;
            renderLetters();
            offset += slotH;
            wrapper.style.transform = `translateY(${offset}px)`;
        }
        startY = y;
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        columns[colIdx] = index;
        snapBack();
    }

    function snapBack() {
        wrapper.style.transition = `transform ${BOUNCE_DURATION}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        wrapper.style.transform = 'translateY(0)';
        const handler = (ev) => {
            if (ev.propertyName !== 'transform') return;
            wrapper.removeEventListener('transitionend', handler);
            offset = 0;
            renderLetters();
        };
        wrapper.addEventListener('transitionend', handler);
    }

    // --- Mouse ---
    columnEl.addEventListener('mousedown', e => {
        if (gameOver) return;
        e.preventDefault();
        onDragStart(e.clientY);
    });

    document.addEventListener('mousemove', e => {
        onDragMove(e.clientY);
    });

    document.addEventListener('mouseup', () => {
        onDragEnd();
    });

    // --- Touch ---
    columnEl.addEventListener('touchstart', e => {
        if (gameOver) return;
        e.preventDefault();
        onDragStart(e.touches[0].clientY);
    }, { passive: false });

    columnEl.addEventListener('touchmove', e => {
        e.preventDefault();
        onDragMove(e.touches[0].clientY);
    }, { passive: false });

    columnEl.addEventListener('touchend', () => {
        onDragEnd();
    });

    // --- Wheel ---
    columnEl.addEventListener('wheel', e => {
        if (gameOver) return;
        e.preventDefault();
        clearTimeout(wheelTimer);
        wrapper.style.transition = 'none';

        offset += -e.deltaY / WHEEL_SENSITIVITY;
        wrapper.style.transform = `translateY(${offset}px)`;

        while (offset > threshold) {
            index = (index - 1 + 26) % 26;
            renderLetters();
            offset -= slotH;
            wrapper.style.transform = `translateY(${offset}px)`;
        }
        while (offset < -threshold) {
            index = (index + 1) % 26;
            renderLetters();
            offset += slotH;
            wrapper.style.transform = `translateY(${offset}px)`;
        }

        columns[colIdx] = index;

        wheelTimer = setTimeout(() => {
            snapBack();
        }, BOUNCE_DELAY);
    }, { passive: false });
}

// ---------- GUESS LOGIC ----------
function getCurrentGuess() {
    return columns.map(i => ALPHABET[i]).join('');
}

function validateGuess() {
    const guess = getCurrentGuess();

    // Find changed positions
    const diffs = [];
    for (let i = 0; i < 4; i++) {
        if (guess[i] !== prevWord[i]) diffs.push(i);
    }

    if (diffs.length === 0) return { ok: false, reason: 'You haven\'t changed anything.' };
    if (diffs.length > 1) return { ok: false, reason: 'Change exactly one letter.' };

    const changedIdx = diffs[0];

    if (!wordSet.has(guess)) return { ok: false, reason: 'Not a valid word.' };
    if (guessHistory.includes(guess)) return { ok: false, reason: 'Already used that word.' };
    if (!isFirstTurn && changedIdx === lastChangedSlot) return { ok: false, reason: 'Can\'t change the same slot twice in a row.' };

    return { ok: true, changed: changedIdx };
}

function submitGuess() {
    if (gameOver) return;

    const result = validateGuess();
    if (!result.ok) {
        showToast(result.reason);
        revertWheels();
        return;
    }

    const guess = getCurrentGuess();
    const changedIdx = result.changed;

    // Accept the guess
    prevWord = guess;
    guessHistory.push(guess);
    lastChangedSlot = changedIdx;
    isFirstTurn = false;
    stepCount++;

    // Update UI
    stepsCountEl.textContent = stepCount;
    highlightLastUsed(changedIdx);
    addChainWord(guess, false);

    // Check win
    if (guess === currentPuzzle.target) {
        gameOver = true;
        setTimeout(() => showWin(), 400);
    }
}

function revertWheels() {
    columns = prevWord.split('').map(ch => ALPHABET.indexOf(ch));
    document.querySelectorAll('.letter-column').forEach((col, i) => {
        const wrapper = col.querySelector('.letter-wrapper');
        if (!wrapper) return;
        const letters = wrapper.querySelectorAll('.letter');
        const idx = columns[i];
        if (letters.length >= 3) {
            letters[0].textContent = ALPHABET[(idx - 1 + 26) % 26];
            letters[1].textContent = ALPHABET[idx];
            letters[2].textContent = ALPHABET[(idx + 1) % 26];
        }
    });
}

function highlightLastUsed(idx) {
    document.querySelectorAll('.letter-column').forEach((col, i) => {
        col.classList.toggle('last-used', i === idx);
    });
}

// ---------- WORD CHAIN UI ----------
function addChainWord(word, isStart) {
    if (chainTrack.children.length > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'chain-arrow';
        arrow.textContent = '→';
        chainTrack.appendChild(arrow);
    }

    const el = document.createElement('span');
    el.className = 'chain-word';
    if (isStart) el.classList.add('start-word');
    if (word === currentPuzzle.target) el.classList.add('target-word');
    el.textContent = word;
    chainTrack.appendChild(el);

    // Auto-scroll to the end
    const section = chainTrack.parentElement;
    section.scrollLeft = section.scrollWidth;
}

// ---------- HELPER: build chain into a container ----------
function buildChainInto(container, words) {
    container.innerHTML = '';
    words.forEach((word, i) => {
        if (i > 0) {
            const arrow = document.createElement('span');
            arrow.className = 'chain-arrow';
            arrow.textContent = '→';
            container.appendChild(arrow);
        }
        const el = document.createElement('span');
        el.className = 'chain-word';
        if (i === 0) el.classList.add('start-word');
        if (word === currentPuzzle.target) el.classList.add('target-word');
        el.textContent = word;
        container.appendChild(el);
    });
}

// ---------- WIN SCREEN ----------
function showWin() {
    winStepsEl.textContent = stepCount;
    winOptimalEl.textContent = currentPuzzle.optimal;

    // Build player's chain
    buildChainInto(winChainEl, guessHistory);

    // Build optimal path chain
    const optPath = currentPuzzle.optimalPath || [currentPuzzle.start, currentPuzzle.target];
    buildChainInto(winOptimalChainEl, optPath);

    winOverlay.classList.add('active');
}

// ---------- TOAST ----------
function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 2200);
}

// ---------- BUTTON WIRING ----------
function wireButtons() {
    checkBtn.addEventListener('click', submitGuess);
    resetBtn.addEventListener('click', revertWheels);
    playAgainBtn.addEventListener('click', nextPuzzle);
    restartBtn.addEventListener('click', restartPuzzle);
    restartInlineBtn.addEventListener('click', restartPuzzle);

    // Keyboard: Enter to submit, Escape to reset
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitGuess();
        if (e.key === 'Escape') {
            if (winOverlay.classList.contains('active')) {
                nextPuzzle();
            } else {
                revertWheels();
            }
        }
    });
}
