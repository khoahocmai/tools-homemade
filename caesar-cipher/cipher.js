// ===== MATRIX BACKGROUND =====
const canvas = document.getElementById("matrix");
const ctx = canvas.getContext("2d");

canvas.height = window.innerHeight;
canvas.width = window.innerWidth;

const letters = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const fontSize = 16;
const columns = canvas.width / fontSize;

const drops = [];
for (let x = 0; x < columns; x++) {
  drops[x] = 1;
}

function drawMatrix() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#00ff88";
  ctx.font = fontSize + "px monospace";

  for (let i = 0; i < drops.length; i++) {
    const text = letters[Math.floor(Math.random() * letters.length)];
    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975)
      drops[i] = 0;

    drops[i]++;
  }
}

setInterval(drawMatrix, 35);


// ===== TYPEWRITER EFFECT =====
function typeWriter(element, text) {
  element.value = "";
  let i = 0;

  function typing() {
    if (i < text.length) {
      element.value += text.charAt(i);
      i++;
      setTimeout(typing, 10);
    }
  }
  typing();
}


// ===== Override encrypt/decrypt để thêm effect =====
function encrypt() {
  const text = document.getElementById("inputText").value;
  const result = transform(text, "encrypt");
  const output = document.getElementById("outputText");

  typeWriter(output, result);

  document.querySelector(".terminal").classList.add("flash");
  setTimeout(() => {
    document.querySelector(".terminal").classList.remove("flash");
  }, 300);
}

function decrypt() {
  const text = document.getElementById("inputText").value;
  const result = transform(text, "decrypt");
  const output = document.getElementById("outputText");

  typeWriter(output, result);

  document.querySelector(".terminal").classList.add("flash");
  setTimeout(() => {
    document.querySelector(".terminal").classList.remove("flash");
  }, 300);
}

// ===== AUTO SET TODAY =====
window.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("dateInput").value = today;
});