// ============================================
// DOM ELEMENTS
// ============================================
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const inputList = document.getElementById('inputList');
const itemCount = document.getElementById('itemCount');
const spinText = document.getElementById('spinText');
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleBtn');
const resultModal = document.getElementById('resultModal');
const winnerName = document.getElementById('winnerName');

// ============================================
// STATE
// ============================================
let items = [];
let startAngle = 0;
let arc = 0;
let spinTimeout = null;
let spinAngleStart = 0;
let spinTime = 0;
let spinTimeTotal = 0;
let isSpinning = false;

// History tracking
let history = [];
let roundCounter = 0;
let pendingWinner = null;
let pendingRecorded = false;

// ============================================
// EVENT LISTENERS - INITIALIZATION
// ============================================
inputList.addEventListener('input', generateWheel);

window.addEventListener('load', () => {
  // Load default values
  inputList.value = 'Người 1\nNgười 2\nNgười 3\nNgười 4\nNgười 5';
  generateWheel();

  // Set up canvas
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
});

toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('show');
});

// Close sidebar when clicking on wheel area on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768) {
    if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
      if (e.target === canvas) {
        sidebar.classList.remove('show');
      }
    }
  }
});

// ============================================
// CANVAS RESIZING
// ============================================
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);

  canvas.width = size;
  canvas.height = size;

  drawWheel();
}

// ============================================
// WHEEL GENERATION
// ============================================
function generateWheel() {
  const input = inputList.value.trim();
  items = input.split(/\n+/).map(i => i.trim()).filter(i => i !== '');

  if (items.length === 0) {
    arc = 0;
    drawWheel();
    updateUI();
    return;
  }

  arc = (Math.PI * 2) / items.length;
  drawWheel();
  updateUI();
}

// ============================================
// WHEEL DRAWING
// ============================================
function drawWheel() {
  const size = canvas.width;
  const centerX = size / 2;
  const centerY = size / 2;
  const outsideRadius = size * 0.45;
  const textRadius = size * 0.35;
  const insideRadius = size * 0.08;

  ctx.clearRect(0, 0, size, size);

  if (items.length === 0) {
    // Draw empty wheel
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(centerX, centerY, outsideRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#999';
    ctx.font = `${size * 0.04}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    return;
  }

  // Modern color palette
  const colors = [
    '#667eea', // Primary purple
    '#764ba2', // Dark purple
    '#f093fb', // Pink
    '#4facfe', // Blue
    '#00f2fe', // Cyan
    '#43e97b', // Green
    '#fa709a', // Rose
    '#feca57', // Yellow
  ];

  // Draw segments
  for (let i = 0; i < items.length; i++) {
    const angle = startAngle + i * arc;

    // Draw segment
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(centerX, centerY, outsideRadius, angle, angle + arc, false);
    ctx.arc(centerX, centerY, insideRadius, angle + arc, angle, true);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw text
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${size * 0.04}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textX = centerX + Math.cos(angle + arc / 2) * textRadius;
    const textY = centerY + Math.sin(angle + arc / 2) * textRadius;

    ctx.translate(textX, textY);
    ctx.rotate(angle + arc / 2);

    const text = items[i];
    const displayText = text.length > 18 ? text.substring(0, 15) + '...' : text;
    ctx.fillText(displayText, 0, 0);

    ctx.restore();
  }
}

// ============================================
// WHEEL SPINNING
// ============================================
canvas.addEventListener('click', spin);

function spin() {
  if (items.length === 0 || isSpinning) return;

  isSpinning = true;
  hideModal();
  spinText.style.opacity = '0';

  spinAngleStart = randomFloat(10, 30);
  spinTime = 0;
  spinTimeTotal = randomFloat(4000, 8000);

  rotateWheel();
}

function rotateWheel() {
  spinTime += 30;

  if (spinTime >= spinTimeTotal) {
    stopRotateWheel();
    return;
  }

  const spinAngle = spinAngleStart - easeOut(spinTime, 0, spinAngleStart, spinTimeTotal);
  startAngle += (spinAngle * Math.PI) / 180;

  drawWheel();
  spinTimeout = setTimeout(rotateWheel, 30);
}

function stopRotateWheel() {
  clearTimeout(spinTimeout);

  const degrees = (startAngle * 180) / Math.PI + 90;
  const arcd = (arc * 180) / Math.PI;
  const index = Math.floor((360 - (degrees % 360)) / arcd) % items.length;

  drawWheel();

  // Save pending winner
  pendingWinner = items[index];
  pendingRecorded = false;

  // Show result modal
  setTimeout(() => {
    winnerName.textContent = `🎉 ${pendingWinner}`;
    showModal();
  }, 500);
}

// ============================================
// EASING FUNCTION
// ============================================
function easeOut(t, b, c, d) {
  const ts = (t /= d) * t;
  const tc = ts * t;
  return b + c * (tc + -3 * ts + 3 * t);
}

// ============================================
// UI UPDATES
// ============================================
function updateUI() {
  const emptyState = items.length === 0;
  const spinning = isSpinning;

  if (emptyState) {
    itemCount.textContent = 'Chưa có mục nào';
    spinText.textContent = '📝 Nhập danh sách trước!';
    spinText.style.opacity = '1';
    canvas.style.cursor = 'not-allowed';
  } else if (spinning) {
    spinText.style.opacity = '0';
    canvas.style.cursor = 'not-allowed';
  } else {
    itemCount.textContent = `Có ${items.length} mục`;
    spinText.textContent = '🎯 Nhấn để quay!';
    spinText.style.opacity = '1';
    canvas.style.cursor = 'pointer';
  }
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function showModal() {
  resultModal.classList.add('show');
}

function hideModal() {
  resultModal.classList.remove('show');
}

function closeOverlay() {
  commitHistoryIfNeeded();
  shuffleItems();
  hideModal();
  isSpinning = false;
  updateUI();
}

function deleteWinner() {
  commitHistoryIfNeeded();

  if (!pendingWinner) {
    return;
  }

  // Remove winner from list
  const idx = items.findIndex(
    i => i.replace(/\s/g, '') === pendingWinner.replace(/\s/g, '')
  );

  if (idx >= 0) {
    items.splice(idx, 1);
    shuffleItems();
  }

  // Mark in history as removed
  if (history.length > 0 && history[0].name === pendingWinner) {
    history[0].removed = true;
    renderHistory();
  }

  // Clean up
  winnerName.textContent = '';
  hideModal();
  isSpinning = false;
  updateUI();
  pendingWinner = null;
  pendingRecorded = false;
}

function clearList() {
  items = [];
  inputList.value = '';
  drawWheel();
  winnerName.textContent = '';
  hideModal();
  updateUI();

  // Reset history
  history = [];
  roundCounter = 0;
  pendingWinner = null;
  pendingRecorded = false;
  renderHistory();
}

// ============================================
// HISTORY MANAGEMENT
// ============================================
function commitHistoryIfNeeded() {
  if (pendingWinner && !pendingRecorded) {
    roundCounter += 1;
    history.unshift({
      name: pendingWinner,
      round: roundCounter,
      removed: false,
    });
    renderHistory();
    pendingRecorded = true;
  }
}

function renderHistory() {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';

  if (history.length === 0) {
    historyList.innerHTML = '<li style="text-align: center; color: #999;">Chưa có lịch sử</li>';
    return;
  }

  history.forEach(h => {
    const li = document.createElement('li');

    if (h.removed) {
      li.classList.add('removed');
    }

    const badgeHTML = h.removed
      ? `<span class="badge-removed">Loại bỏ</span>`
      : '';

    li.innerHTML = `
      <span>
        ${h.name}
        ${badgeHTML}
      </span>
      <span class="round-label">Lượt ${h.round}</span>
    `;

    historyList.appendChild(li);
  });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function randomFloat(min, max) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + (array[0] / 0xffffffff) * (max - min);
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  if (e.target === document.querySelector('.modal-overlay')) {
    closeOverlay();
  }
});

// Handle keyboard - ESC to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && resultModal.classList.contains('show')) {
    closeOverlay();
  }
});

function shuffleItems() {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  // Sync lại textarea
  inputList.value = items.join('\n');

  // Vẽ lại wheel
  generateWheel();
}
