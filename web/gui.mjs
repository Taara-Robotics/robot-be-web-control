const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const controlRadius = 150;

// axes [lx, ly, rx, ry]

const ui = {
  modeSelect: document.querySelector("#mode-select"),
  axisSettings: document.querySelectorAll(".axis-settings"),
  smoothingInput: document.querySelector("#smoothing-settings input"),
  smoothingButtons: document.querySelectorAll("#smoothing-settings button"),
}

const settings = {
  modes: {
    // axes [lx, ly, rx, ry]
    tank: {velocityAxisScales: [[0, 1, 0, 0], [0, 0, 0, -1]], axisScales: [1, 1, 1, 1]},
    forwardRight: {velocityAxisScales: [[-1, 0, 0, 1], [-1, 0, 0, -1]], axisScales: [1, 1, 1, 1]},
    forwardLeft: {velocityAxisScales: [[0, 1, -1, 0], [0, -1, -1, 0]], axisScales: [1, 1, 1, 1]},
    onlyRight: {velocityAxisScales: [[0, 0, -1, 1], [0, 0, -1, -1]], axisScales: [1, 1, 1, 1]},
    onlyLeft: {velocityAxisScales: [[-1, 1, 0, 0], [-1, -1, 0, 0]], axisScales: [1, 1, 1, 1]},
  },
  activeMode: 'tank'
}

export const state = {
  maxVelocity: 1,
  input: {vs: [null, null], smoothing: 0.25},
  axes: [0, 0, 0, 0],
  touches: {},
};

function initUI() {
  for (const [aIndex, axisSetting] of ui.axisSettings.entries()) {
    const input = axisSetting.querySelector("input");
    const buttons = axisSetting.querySelectorAll("button");

    buttons[0].addEventListener("click", () => {
      input.stepDown();
      changeActiveModeAxisScale(aIndex, parseFloat(input.value));
    });

    buttons[1].addEventListener("click", () => {
      input.stepUp();
      changeActiveModeAxisScale(aIndex, parseFloat(input.value));
    });

    input.addEventListener("input", (event) => {
      changeActiveModeAxisScale(aIndex, parseFloat(input.value));
    });
  }

  ui.smoothingInput.addEventListener("input", (event) => {
    state.input.smoothing = parseFloat(event.target.value);
  });

  ui.smoothingButtons[0].addEventListener("click", () =>{
    ui.smoothingInput.stepDown();
    state.input.smoothing = parseFloat(ui.smoothingInput.value);
  });

  ui.smoothingButtons[1].addEventListener("click", () =>{
    ui.smoothingInput.stepUp();
    state.input.smoothing = parseFloat(ui.smoothingInput.value);
  });
}

function updateSettingsUI() {
  ui.modeSelect.value = settings.activeMode;

  for (const [aIndex, axisSetting] of ui.axisSettings.entries()) {
    const input = axisSetting.querySelector("input");

    input.value = settings.modes[settings.activeMode].axisScales[aIndex];

    const activeModeSettings = settings.modes[settings.activeMode];

    let isAllZeros = true;

    for (const velocityAxisScales of activeModeSettings.velocityAxisScales) {
      if (velocityAxisScales[aIndex] !== 0) {
        isAllZeros = false;
        break;
      }
    }

    if (isAllZeros) {
      axisSetting.classList.add('disabled');
    } else {
      axisSetting.classList.remove('disabled');
    }
  }

  ui.smoothingInput.value = state.input.smoothing;
}

function changeMode(mode) {
  if (!settings.modes[mode]) {
    return;
  }

  settings.activeMode = mode;

  updateSettingsUI();

  saveSettings();
}

function changeActiveModeAxisScale(axisIndex, value) {
  const prevValue = settings.modes[settings.activeMode].axisScales[axisIndex];

  if (prevValue === value) {
    return;
  }

  settings.modes[settings.activeMode].axisScales[axisIndex] = value;

  saveSettings();
}

function saveSettings() {
  const savableSettings = {
    activeMode: settings.activeMode,
    modes: Object.fromEntries(Object.entries(settings.modes).map(([name, settings]) => [name, {axisScales: settings.axisScales}])),
  }

  localStorage.setItem('settings', JSON.stringify(settings));
}

function loadSettings() {
  const savedSettingsJSON = localStorage.getItem('settings');

  if (!savedSettingsJSON) {
    return;
  }

  const savedSettings = JSON.parse(savedSettingsJSON);

  settings.activeMode = savedSettings.activeMode;

  for (const [name, modeSettings] of Object.entries(savedSettings.modes)) {
    if (settings.modes[name]) {
      settings.modes[name].axisScales = modeSettings.axisScales.slice();
    }
  }
}

function getLeftTouch() {
  for (const identifier in state.touches) {
    if (state.touches[identifier].x0 < canvas.width / 2) {
      return state.touches[identifier];
    }
  }
}

function getRightTouch() {
  for (const identifier in state.touches) {
    if (state.touches[identifier].x0 >= canvas.width / 2) {
      return state.touches[identifier];
    }
  }
}

function drawControl(x, y, radius) {
  //ctx.strokeStyle = "rgba(0, 0, 0, 1)";
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();
}

function drawLine(x0, y0, x1, y1) {
  ctx.beginPath();
  // ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
  // ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawLineAngleDistance(x0, y0, angle, distance) {
  const x1 = x0 + Math.cos(angle) * distance;
  const y1 = y0 + Math.sin(angle) * distance;

  drawLine(x0, y0, x1, y1);
}

function drawCircle(x, y, radius) {
  ctx.strokeStyle = "rgba(0, 0, 0, 1)";
  ctx.fillStyle = "rgba(0, 0, 0, 0)";

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function drawTouch(touch) {
  const minDistance = 25;

  drawControl(touch.x0, touch.y0, controlRadius);

  const distance = getMagnitude(touch.y1 - touch.y0, touch.x1 - touch.x0)

  drawLine(touch.x0, 0, touch.x0, canvas.height); // horizontal
  drawLine(canvas.width / 2, touch.y0, touch.x0 < canvas.width / 2 ? 0 : canvas.width, touch.y0); // vertical
  drawCircle(touch.x0, touch.y0, distance);

  const angle = Math.atan2(touch.y1 - touch.y0, touch.x1 - touch.x0);
  const angleLineLength = canvas.width + canvas.height; // reaches over the sides

  drawLineAngleDistance(touch.x0, touch.y0, angle, angleLineLength);

  /*if (distance > minDistance) {
    ctx.strokeStyle = "rgba(0, 0, 0, 1)";
    ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(distance / controlRadius, 1)})`;

    ctx.beginPath();
    ctx.arc(touch.x0, touch.y0, controlRadius, angle - 0.5, angle + 0.5);
    ctx.fill();
  }*/
}

function getMagnitude(x, y) {
  return Math.sqrt(x * x + y * y);
}

function drawInput() {
  ctx.strokeStyle = "rgba(255, 255, 255, 1)";

  // Direction
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, canvas.height / 2);
  const x = (state.input.x / state.maxVelocity) * controlRadius;
  const y = (state.input.y / state.maxVelocity) * controlRadius;
  ctx.lineTo(canvas.width / 2 + x, canvas.height / 2 + y);
  ctx.stroke();
  // Rotation
  const startAngle = Math.atan2(state.input.y, state.input.x);
  ctx.beginPath();
  ctx.arc(
    canvas.width / 2,
    canvas.height / 2,
    getMagnitude(x, y) || controlRadius,
    startAngle,
    startAngle + state.input.w,
    state.input.w < 0
  );
  ctx.fill();
  ctx.stroke();
  console.log(state.input);
}

function render() {
  // Resize canvas if needed
  const rect = canvas.parentNode.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const centerX = canvas.width / 2 + 0.5;
  drawLine(centerX, 0, centerX, canvas.height);

  // Draw touches
  for (const identifier in state.touches) {
    drawTouch(state.touches[identifier]);
  }

  // Draw input
  //drawInput();
}

canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();

  for (const touch of event.touches) {
    const x = touch.clientX - canvas.offsetLeft;
    const y = touch.clientY - canvas.offsetTop;

    if (x < canvas.width / 2 && getLeftTouch()) {
      continue;
    }

    if (x >= canvas.width / 2 && getRightTouch()) {
      continue;
    }

    state.touches[touch.identifier] = {
      x0: x,
      y0: y,
      x1: x,
      y1: y,
    };
  }

  render();
});

function updateInput() {
  const leftTouch = getLeftTouch();
  const rightTouch = getRightTouch();

  if (leftTouch) {
    let vx = (leftTouch.x1 - leftTouch.x0) / controlRadius;
    let vy = (leftTouch.y1 - leftTouch.y0) / controlRadius;
    /*const v = getMagnitude(vx, vy);

    if (v > 1) {
      vx = vx / v;
      vy = vy / v;
    }*/

    state.axes[0] = vx;
    state.axes[1] = vy;
    //state.input.vs[0] = vy * state.maxVelocity;
  } else {
    state.axes[0] = 0;
    state.axes[1] = 0;
    //state.input.vs[0] = null;
  }

  if (rightTouch) {
    let vx = (rightTouch.x1 - rightTouch.x0) / controlRadius;
    let vy = (rightTouch.y1 - rightTouch.y0) / controlRadius;
    /*const v = getMagnitude(vx, vy);

    if (v > 1) {
      vx = vx / v;
      vy = vy / v;
    }*/

    state.axes[2] = vx;
    state.axes[3] = vy;
    //state.input.vs[1] = -vy * state.maxVelocity;
  } else {
    state.axes[2] = 0;
    state.axes[3] = 0;
    //state.input.vs[1] = null;
  }

  if (!leftTouch && !rightTouch) {
    state.input.vs[0] = null;
    state.input.vs[1] = null;
    return;
  }

  const activeModeSettings = settings.modes[settings.activeMode] ?? settings.modes.tank;

  for (const [vIndex, velocityAxisScales] of activeModeSettings.velocityAxisScales.entries()) {
    let sum = 0;

    for (const [sIndex, axisScale] of velocityAxisScales.entries()) {
      sum += state.axes[sIndex] * axisScale * activeModeSettings.axisScales[sIndex];
    }

    state.input.vs[vIndex] = sum;
  }
}

canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();

  for (const touch of event.changedTouches) {
    if (!touch.identifier in state.touches) {
      continue;
    }

    const x = touch.clientX - canvas.offsetLeft;
    const y = touch.clientY - canvas.offsetTop;

    state.touches[touch.identifier] = {
      ...state.touches[touch.identifier],
      x1: x,
      y1: y,
    };
  }

  updateInput();
  render();
});

canvas.addEventListener("touchend", (event) => {
  event.preventDefault();

  for (const touch of event.changedTouches) {
    if (!touch.identifier in state.touches) {
      continue;
    }

    delete state.touches[touch.identifier];
  }

  updateInput();
  render();
});

ui.modeSelect.addEventListener('change', (event) => {
  changeMode(event.target.value);
});

let wsManager;

export function runGui(_wsManager) {
  wsManager = _wsManager;

  loadSettings();
  initUI();
  updateSettingsUI();

  window.onresize = () => render();
}

render();
