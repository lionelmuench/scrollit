// ===== SCROLLIT — daily challenge =====

// ---------- CONSTANTS ----------
const WHEEL_SENSITIVITY = 8;
const BOUNCE_DELAY = 60;
const BOUNCE_DURATION = 180;
const LETTER_CHANGE_FACTOR = 0.7;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ---------- STATE ----------
let wordSet = new Set();
let puzzles = [];

let currentPuzzle = null;
let currentDateKey = '';
let currentPuzzleIndex = 0;
let prevWord = '';
let columns = [0, 0, 0, 0];
let guessHistory = [];
let lastChangedSlot = -1;
let isFirstTurn = true;
let stepCount = 0;
let gameOver = false;

// ---------- DOM REFS ----------
const targetWordEl = document.getElementById('target-word');
const puzzleDateEl = document.getElementById('puzzle-date');
const stepsCountEl = document.getElementById('steps-count');
const chainTrack = document.getElementById('chain-track');
const winOverlay = document.getElementById('win-overlay');
const winStepsEl = document.getElementById('win-steps');
const winOptimalEl = document.getElementById('win-optimal');
const winChainEl = document.getElementById('win-chain');
const winOptimalChainEl = document.getElementById('win-optimal-chain');
const winStatusEl = document.getElementById('win-status');
const checkBtn = document.getElementById('checkmark-btn');
const resetBtn = document.getElementById('reset-btn');
const closeBtn = document.getElementById('btn-close');
const restartBtn = document.getElementById('btn-restart');
const restartInlineBtn = document.getElementById('restart-btn');
const toastContainer = document.getElementById('toast-container');

// ---------- INIT ----------
(async function init() {
    const [wordText, puzzleData] = await Promise.all([
        fetch('wordlist.txt').then((response) => response.text()),
        fetch('puzzles.json').then((response) => response.json())
    ]);

    wordText.trim().split('\n').forEach((word) => {
        const upper = word.trim().toUpperCase();
        if (upper.length === 4) wordSet.add(upper);
    });

    puzzles = puzzleData;
    startDailyPuzzle();
    wireButtons();
})();

// ---------- DAILY PUZZLE ----------
function startDailyPuzzle(showSavedOverlay = true) {
    currentDateKey = getEasternDateKey();
    currentPuzzleIndex = getDailyPuzzleIndex(puzzles.length, currentDateKey);
    currentPuzzle = puzzles[currentPuzzleIndex];

    prevWord = currentPuzzle.start;
    columns = prevWord.split('').map((character) => ALPHABET.indexOf(character));
    guessHistory = [prevWord];
    lastChangedSlot = -1;
    isFirstTurn = true;
    stepCount = 0;
    gameOver = false;

    targetWordEl.textContent = currentPuzzle.target;
    puzzleDateEl.textContent = formatDateKey(currentDateKey);
    stepsCountEl.textContent = '0';
    chainTrack.innerHTML = '';
    addChainWord(prevWord, true);
    winOverlay.classList.remove('active');

    initColumns();
    if (showSavedOverlay) {
        const recordedSolve = getDailySolve(currentDateKey);
        if (recordedSolve) {
            setTimeout(() => {
                showWin({
                    steps: recordedSolve.steps,
                    playerPath: Array.isArray(recordedSolve.path) && recordedSolve.path.length
                        ? recordedSolve.path
                        : [currentPuzzle.start, currentPuzzle.target],
                    status: 'Already completed for today.'
                });
            }, 120);
        }
    }
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

    const slotHeight = columnEl.clientHeight / 3;
    const threshold = slotHeight * LETTER_CHANGE_FACTOR;
    let offset = 0;
    let isDragging = false;
    let startY = 0;
    let wheelTimer = null;

    function makeLetter(character, className) {
        const element = document.createElement('div');
        element.className = `letter ${className}`;
        element.textContent = character;
        return element;
    }

    function renderLetters() {
        wrapper.innerHTML = '';
        wrapper.appendChild(makeLetter(ALPHABET[(index - 1 + 26) % 26], 'letter-above'));
        wrapper.appendChild(makeLetter(ALPHABET[index], 'active'));
        wrapper.appendChild(makeLetter(ALPHABET[(index + 1) % 26], 'letter-below'));
    }

    function snapBack() {
        wrapper.style.transition = `transform ${BOUNCE_DURATION}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        wrapper.style.transform = 'translateY(0)';
        const handler = (event) => {
            if (event.propertyName !== 'transform') return;
            wrapper.removeEventListener('transitionend', handler);
            offset = 0;
            renderLetters();
        };
        wrapper.addEventListener('transitionend', handler);
    }

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
            offset -= slotHeight;
            wrapper.style.transform = `translateY(${offset}px)`;
        }
        while (offset < -threshold) {
            index = (index + 1) % 26;
            renderLetters();
            offset += slotHeight;
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

    renderLetters();

    columnEl.addEventListener('mousedown', (event) => {
        if (gameOver) return;
        event.preventDefault();
        onDragStart(event.clientY);
    });

    document.addEventListener('mousemove', (event) => {
        onDragMove(event.clientY);
    });

    document.addEventListener('mouseup', onDragEnd);

    columnEl.addEventListener('touchstart', (event) => {
        if (gameOver) return;
        event.preventDefault();
        onDragStart(event.touches[0].clientY);
    }, { passive: false });

    columnEl.addEventListener('touchmove', (event) => {
        event.preventDefault();
        onDragMove(event.touches[0].clientY);
    }, { passive: false });

    columnEl.addEventListener('touchend', onDragEnd);

    columnEl.addEventListener('wheel', (event) => {
        if (gameOver) return;
        event.preventDefault();
        clearTimeout(wheelTimer);
        wrapper.style.transition = 'none';

        offset += -event.deltaY / WHEEL_SENSITIVITY;
        wrapper.style.transform = `translateY(${offset}px)`;

        while (offset > threshold) {
            index = (index - 1 + 26) % 26;
            renderLetters();
            offset -= slotHeight;
            wrapper.style.transform = `translateY(${offset}px)`;
        }
        while (offset < -threshold) {
            index = (index + 1) % 26;
            renderLetters();
            offset += slotHeight;
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
    return columns.map((index) => ALPHABET[index]).join('');
}

function validateGuess() {
    const guess = getCurrentGuess();
    const diffs = [];

    for (let index = 0; index < 4; index += 1) {
        if (guess[index] !== prevWord[index]) diffs.push(index);
    }

    if (diffs.length === 0) return { ok: false, reason: 'You have not changed anything.' };
    if (diffs.length > 1) return { ok: false, reason: 'Change exactly one letter.' };

    const changedIdx = diffs[0];

    if (!wordSet.has(guess)) return { ok: false, reason: 'Not a valid word.' };
    if (guessHistory.includes(guess)) return { ok: false, reason: 'Already used that word.' };
    if (!isFirstTurn && changedIdx === lastChangedSlot) {
        return { ok: false, reason: 'Cannot change the same slot twice in a row.' };
    }

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

    prevWord = guess;
    guessHistory.push(guess);
    lastChangedSlot = changedIdx;
    isFirstTurn = false;
    stepCount += 1;

    stepsCountEl.textContent = stepCount;
    highlightLastUsed(changedIdx);
    addChainWord(guess, false);

    if (guess === currentPuzzle.target) {
        gameOver = true;
        setTimeout(handleSolvedDaily, 400);
    }
}

function revertWheels() {
    columns = prevWord.split('').map((character) => ALPHABET.indexOf(character));
    document.querySelectorAll('.letter-column').forEach((col, index) => {
        const wrapper = col.querySelector('.letter-wrapper');
        if (!wrapper) return;
        const letters = wrapper.querySelectorAll('.letter');
        const letterIndex = columns[index];
        if (letters.length >= 3) {
            letters[0].textContent = ALPHABET[(letterIndex - 1 + 26) % 26];
            letters[1].textContent = ALPHABET[letterIndex];
            letters[2].textContent = ALPHABET[(letterIndex + 1) % 26];
        }
    });
}

function highlightLastUsed(index) {
    document.querySelectorAll('.letter-column').forEach((col, colIndex) => {
        col.classList.toggle('last-used', colIndex === index);
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

    const element = document.createElement('span');
    element.className = 'chain-word';
    if (isStart) element.classList.add('start-word');
    if (word === currentPuzzle.target) element.classList.add('target-word');
    element.textContent = word;
    chainTrack.appendChild(element);

    const section = chainTrack.parentElement;
    section.scrollLeft = section.scrollWidth;
}

function buildChainInto(container, words) {
    container.innerHTML = '';
    words.forEach((word, index) => {
        if (index > 0) {
            const arrow = document.createElement('span');
            arrow.className = 'chain-arrow';
            arrow.textContent = '→';
            container.appendChild(arrow);
        }
        const element = document.createElement('span');
        element.className = 'chain-word';
        if (index === 0) element.classList.add('start-word');
        if (word === currentPuzzle.target) element.classList.add('target-word');
        element.textContent = word;
        container.appendChild(element);
    });
}

// ---------- WIN SCREEN ----------
function showWin(config = {}) {
    const steps = config.steps ?? stepCount;
    const playerPath = config.playerPath ?? guessHistory;
    const status = config.status ?? '';

    winStepsEl.textContent = steps;
    winOptimalEl.textContent = currentPuzzle.optimal;
    buildChainInto(winChainEl, playerPath);
    buildChainInto(winOptimalChainEl, currentPuzzle.optimalPath || [currentPuzzle.start, currentPuzzle.target]);
    winStatusEl.textContent = status;
    winOverlay.classList.add('active');
}

function handleSolvedDaily() {
    const wasRecorded = recordDailySolve(currentDateKey, {
        steps: stepCount,
        puzzleIndex: currentPuzzleIndex,
        path: guessHistory
    });

    showWin({
        status: wasRecorded
            ? 'Recorded in your Daily Challenge stats.'
            : 'Already completed for today.'
    });
}

function closeWinOverlay() {
    winOverlay.classList.remove('active');
}

// ---------- TOAST ----------
function showToast(message) {
    const element = document.createElement('div');
    element.className = 'toast';
    element.textContent = message;
    toastContainer.appendChild(element);
    setTimeout(() => {
        if (element.parentNode) element.parentNode.removeChild(element);
    }, 2200);
}

// ---------- BUTTON WIRING ----------
function wireButtons() {
    checkBtn.addEventListener('click', submitGuess);
    resetBtn.addEventListener('click', revertWheels);
    closeBtn.addEventListener('click', closeWinOverlay);
    restartBtn.addEventListener('click', () => startDailyPuzzle(false));
    restartInlineBtn.addEventListener('click', () => startDailyPuzzle(false));

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submitGuess();
        if (event.key === 'Escape') {
            if (winOverlay.classList.contains('active')) {
                closeWinOverlay();
            } else {
                revertWheels();
            }
        }
    });
}
