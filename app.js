const VERSION = "v3";
const RECORD_URL = "";
const PRACTICE_REMINDER_MS = 15 * 60 * 1000;
const GOAL = 30;
const REVIEW_TRIGGER = 5;
const PROFILE_KEY = "integer-math-student";

const LEVELS = [
  { name: "正－正", s1: 1, op: "-", s2: 1 },
  { name: "負＋正", s1: -1, op: "+", s2: 1 },
  { name: "負－正", s1: -1, op: "-", s2: 1 },
  { name: "正－負", s1: 1, op: "-", s2: -1 },
  { name: "負－負", s1: -1, op: "-", s2: -1 },
  { name: "正＋負", s1: 1, op: "+", s2: -1 },
  { name: "負＋負", s1: -1, op: "+", s2: -1 },
];
const TOTAL_LEVELS = LEVELS.length + 2;
const PRAISES = ["答對了，保持節奏！", "漂亮！判斷正確", "Good！繼續前進", "很穩，再下一題！"];
const MASCOT_IMAGES = {
  idle: "icons/mascot-dino-idle-v2.png",
  happy: "icons/mascot-dino-happy-v2.png",
  confused: "icons/mascot-dino-confused-v2.png",
  combo: "icons/mascot-dino-combo-v2.png",
};
const MASCOT_ALT = {
  idle: "自信待機的整數小恐龍",
  happy: "開心慶祝答對的小恐龍",
  confused: "疑惑冒汗的小恐龍",
  combo: "戴著星星頭冠慶祝連擊的小恐龍",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

let profile = null;
let settings = { minA: 1, maxA: 20, minB: 1, maxB: 20 };
let quiz = { input: "" };
let lvl = freshLevelState();
let stats = null;
let practiceReminderTimer = null;
let transitionTimer = null;

function freshLevelState() {
  return {
    plan: [], step: 0, idx: 0, streak: 0, phase: "normal",
    q: null, wrongPool: [], review: null, customMix: [],
  };
}

function show(id) {
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function levelName(index) {
  if (index < LEVELS.length) return LEVELS[index].name;
  if (index === LEVELS.length) return "混合（前 7 關）";
  return "自選混合";
}

function buildLevelSelect() {
  const box = $("#levels-select");
  box.innerHTML = "";
  for (let index = 0; index < TOTAL_LEVELS; index += 1) {
    const label = document.createElement("label");
    label.className = `lvl-toggle${index === TOTAL_LEVELS - 1 ? " full" : ""}`;
    label.innerHTML = `<input type="checkbox" value="${index}"><span>第 ${index + 1} 關　${levelName(index)}</span>`;
    box.appendChild(label);
  }
}

function saveProfile(name, className) {
  profile = { name: name.trim(), className: className.trim() };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function readProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (saved && typeof saved.name === "string" && saved.name.trim()) return saved;
  } catch (_) {
    localStorage.removeItem(PROFILE_KEY);
  }
  return null;
}

function enterSetup() {
  $("#welcome-text").textContent = `${profile.name}${profile.className ? `・${profile.className}` : ""}，準備好就選擇今天的任務。`;
  show("setup");
}

function login(event) {
  event.preventDefault();
  const name = $("#student-name").value.trim();
  const className = $("#student-class").value.trim();
  if (!name) {
    $("#login-error").textContent = "請輸入姓名或暱稱";
    return;
  }
  $("#login-error").textContent = "";
  saveProfile(name, className);
  enterSetup();
}

function logout() {
  localStorage.removeItem(PROFILE_KEY);
  profile = null;
  $("#student-name").value = "";
  $("#student-class").value = "";
  show("login");
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function magnitude(min, max) {
  const lo = Math.min(Math.abs(min), Math.abs(max));
  const hi = Math.max(Math.abs(min), Math.abs(max));
  return randInt(lo, hi);
}

function mixPool() {
  return lvl.customMix.length ? lvl.customMix : LEVELS.map((_, index) => index);
}

function pickCombo() {
  if (lvl.idx < LEVELS.length) return LEVELS[lvl.idx];
  if (lvl.idx === LEVELS.length) return LEVELS[randInt(0, LEVELS.length - 1)];
  const pool = mixPool();
  return LEVELS[pool[randInt(0, pool.length - 1)]];
}

function formatSecondNumber(value) {
  return value < 0 ? `(${value})` : `${value}`;
}

function makeQuestion() {
  const combo = pickCombo();
  const a = combo.s1 * magnitude(settings.minA, settings.maxA);
  const b = combo.s2 * magnitude(settings.minB, settings.maxB);
  const answer = combo.op === "+" ? a + b : a - b;
  return {
    a, b, answer, op: combo.op,
    text: `${a} ${combo.op} ${formatSecondNumber(b)} =`,
    levelNo: lvl.idx + 1,
  };
}

function readRange(id) {
  return Number.parseInt($(`#${id}`).value, 10);
}

function start() {
  const minA = readRange("minA");
  const maxA = readRange("maxA");
  const minB = readRange("minB");
  const maxB = readRange("maxB");
  const values = [minA, maxA, minB, maxB];

  if (values.some(Number.isNaN)) return setupError("數字範圍必須完整填寫");
  if (minA > maxA || minB > maxB) return setupError("最小值不能大於最大值");
  if (values.some((value) => Math.abs(value) > 9999)) return setupError("數字範圍請設定在 9999 以內");

  const checked = [...$$("#levels-select input:checked")]
    .map((input) => Number.parseInt(input.value, 10))
    .sort((a, b) => a - b);
  if (!checked.length) return setupError("請至少選擇一個關卡");

  const level9 = TOTAL_LEVELS - 1;
  let plan;
  let customMix;
  let planLabel;
  if (checked.includes(level9)) {
    customMix = checked.filter((index) => index < LEVELS.length);
    plan = [level9];
    const source = customMix.length ? customMix : LEVELS.map((_, index) => index);
    planLabel = `第9關混合(${source.map((index) => index + 1).join("/")})`;
  } else {
    plan = checked;
    customMix = [];
    planLabel = plan.map((index) => `第${index + 1}關`).join("、");
  }

  settings = { minA, maxA, minB, maxB };
  lvl = { ...freshLevelState(), plan, idx: plan[0], customMix };
  stats = {
    session: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    startTime: Date.now(),
    planLabel,
    answered: 0,
    wrong: 0,
    wrongList: [],
    reachedLevel: plan[0] + 1,
    finalized: false,
    reminderShown: false,
  };

  setupError("");
  startRecord();
  show("quiz");
  renderLevelQuestion();
  schedulePracticeReminder();
}

function setupError(message) {
  $("#setup-error").textContent = message;
}

function bannerName() {
  if (lvl.idx !== TOTAL_LEVELS - 1) return levelName(lvl.idx);
  return `自選混合：${mixPool().map((index) => LEVELS[index].name).join("・")}`;
}

function renderLevelQuestion() {
  clearTimeout(transitionTimer);
  lvl.phase = "normal";
  lvl.q = makeQuestion();
  quiz.input = "";
  $("#review-panel").hidden = true;
  $("#level-banner").innerHTML = `第 ${lvl.idx + 1} 關　${bannerName()}<span class="sub">任務 ${lvl.step + 1} / ${lvl.plan.length}</span>`;
  $("#question").textContent = lvl.q.text;
  resetQuestionUi();
  updateProgress();
}

function resetQuestionUi() {
  updateAnswerBox();
  $("#answer").className = "answer-box";
  $("#feedback").className = "feedback";
  $("#feedback").textContent = "";
  setMascot("idle");
}

function updateProgress() {
  if (lvl.phase === "review") {
    const total = lvl.review.queue.length;
    $("#progress-bar").style.width = `${(lvl.review.pos / total) * 100}%`;
    $("#progress-text").textContent = `複習 ${lvl.review.pos} / ${total}`;
  } else {
    $("#progress-bar").style.width = `${(lvl.streak / GOAL) * 100}%`;
    $("#progress-text").textContent = `連續 ${lvl.streak} / ${GOAL}　錯 ${lvl.wrongPool.length}/${REVIEW_TRIGGER}`;
  }
}

function updateAnswerBox() {
  if (!quiz.input) {
    $("#answer").innerHTML = '<span class="placeholder">輸入答案</span>';
  } else if (quiz.input === "-") {
    $("#answer").innerHTML = '-<span class="placeholder">?</span>';
  } else {
    $("#answer").textContent = quiz.input;
  }
}

function pressKey(key) {
  if (!$("#quiz").classList.contains("active") || !$("#practice-reminder").hidden) return;
  if (key === "back") {
    quiz.input = quiz.input.slice(0, -1);
  } else if (key === "sign") {
    quiz.input = quiz.input.startsWith("-") ? quiz.input.slice(1) : `-${quiz.input}`;
  } else if (quiz.input.replace("-", "").length < 7) {
    if (quiz.input === "0") quiz.input = key;
    else if (quiz.input === "-0") quiz.input = `-${key}`;
    else quiz.input += key;
  }
  updateAnswerBox();
}

function recordAnswer(question, answer, correct) {
  stats.answered += 1;
  if (!correct) {
    stats.wrong += 1;
    stats.wrongList.push({
      題目: question.text.replace(" =", ""),
      你的答案: answer,
      正確答案: question.answer,
      關卡: question.levelNo,
    });
  }
}

function submit() {
  if (!$("#quiz").classList.contains("active") || !$("#practice-reminder").hidden) return;
  if (!quiz.input || quiz.input === "-") return;
  if (lvl.phase === "review") {
    submitReview();
    return;
  }

  const answer = Number.parseInt(quiz.input, 10);
  const question = lvl.q;
  const correct = answer === question.answer;
  recordAnswer(question, answer, correct);

  if (correct) {
    markCorrect();
    if (lvl.phase === "retry") {
      $("#feedback").textContent = "修正成功，繼續前進！";
      transitionTimer = setTimeout(
        lvl.wrongPool.length >= REVIEW_TRIGGER ? startReview : renderLevelQuestion,
        620,
      );
      return;
    }

    lvl.streak += 1;
    updateProgress();
    if (lvl.streak >= GOAL) {
      $("#feedback").textContent = "Perfect！本關完成";
      setMascot("combo");
      transitionTimer = setTimeout(clearLevel, 900);
    } else if (lvl.streak % 5 === 0) {
      $("#feedback").textContent = `${lvl.streak} 連擊！`;
      setMascot("combo");
      transitionTimer = setTimeout(renderLevelQuestion, 650);
    } else {
      $("#feedback").textContent = PRAISES[randInt(0, PRAISES.length - 1)];
      transitionTimer = setTimeout(renderLevelQuestion, 520);
    }
  } else {
    markWrong(question);
  }
}

function markCorrect() {
  $("#answer").classList.add("ok");
  $("#feedback").className = "feedback ok";
  setMascot("happy");
}

function markWrong(question) {
  $("#answer").classList.add("bad");
  $("#feedback").className = "feedback bad";
  lvl.streak = 0;
  if (lvl.phase !== "retry") lvl.wrongPool.push(question);
  lvl.phase = "retry";
  updateProgress();
  setMascot("confused");
  $("#feedback").textContent = `正確答案是 ${question.answer}，請立即重新輸入`;
  transitionTimer = setTimeout(() => {
    quiz.input = "";
    updateAnswerBox();
    $("#answer").className = "answer-box";
  }, 850);
}

function startReview() {
  lvl.phase = "review";
  lvl.review = { queue: lvl.wrongPool.slice(0, REVIEW_TRIGGER), pos: 0 };
  lvl.wrongPool = lvl.wrongPool.slice(REVIEW_TRIGGER);
  $("#review-panel").hidden = false;
  loadReviewQuestion();
}

function loadReviewQuestion() {
  lvl.q = lvl.review.queue[lvl.review.pos];
  quiz.input = "";
  renderReviewList();
  $("#question").textContent = lvl.q.text;
  resetQuestionUi();
  updateProgress();
}

function renderReviewList() {
  const items = lvl.review.queue.map((question, index) => {
    const className = index < lvl.review.pos ? "rv-done" : index === lvl.review.pos ? "rv-current" : "";
    return `<span class="rv-item ${className}">${question.text.replace(" =", "")}${index < lvl.review.pos ? " ✓" : ""}</span>`;
  }).join("");
  $("#review-panel").innerHTML = `<div class="review-title">錯題重練：全部答對才能繼續</div><div class="review-items">${items}</div>`;
}

function submitReview() {
  const answer = Number.parseInt(quiz.input, 10);
  const question = lvl.q;
  const correct = answer === question.answer;
  recordAnswer(question, answer, correct);

  if (!correct) {
    $("#answer").classList.add("bad");
    $("#feedback").className = "feedback bad";
    $("#feedback").textContent = `正確答案是 ${question.answer}，請重新輸入`;
    setMascot("confused");
    transitionTimer = setTimeout(() => {
      quiz.input = "";
      updateAnswerBox();
      $("#answer").className = "answer-box";
    }, 850);
    return;
  }

  markCorrect();
  lvl.review.pos += 1;
  if (lvl.review.pos >= lvl.review.queue.length) {
    $("#feedback").textContent = "錯題重練完成！";
    setMascot("combo");
    transitionTimer = setTimeout(
      lvl.wrongPool.length >= REVIEW_TRIGGER ? startReview : renderLevelQuestion,
      760,
    );
  } else {
    $("#feedback").textContent = "正確，下一題";
    transitionTimer = setTimeout(loadReviewQuestion, 500);
  }
}

function setMascot(mood) {
  $("#mascot").className = `mascot${mood === "idle" ? "" : ` ${mood}`}`;
  $("#mascot-image").src = MASCOT_IMAGES[mood];
  $("#mascot-image").alt = MASCOT_ALT[mood];
}

function clearLevel() {
  lvl.step += 1;
  lvl.streak = 0;
  lvl.wrongPool = [];
  if (lvl.step >= lvl.plan.length) {
    finish(true);
    return;
  }
  lvl.idx = lvl.plan[lvl.step];
  stats.reachedLevel = lvl.idx + 1;
  renderLevelQuestion();
}

function finish(completed) {
  if (!stats || stats.finalized) return;
  stats.finalized = true;
  clearTimeout(transitionTimer);
  hidePracticeReminder();
  const elapsed = Math.max(1, Math.round((Date.now() - stats.startTime) / 1000));
  const correctCount = Math.max(0, stats.answered - stats.wrong);
  const rate = stats.answered ? Math.round((correctCount / stats.answered) * 100) : 0;

  $("#result-title").textContent = completed ? "任務全部完成！" : "今天的練習已保存";
  $("#score").textContent = `${rate}% 正確率`;
  $("#score-detail").innerHTML =
    `${profile.name}・完成 ${stats.answered} 題・答錯 ${stats.wrong} 題<br>` +
    `練習時間 ${formatDuration(elapsed)}・到達第 ${stats.reachedLevel} 關`;
  renderWrongList();
  show("result");
  finishRecord(completed, elapsed);
}

function renderWrongList() {
  if (!stats.wrongList.length) {
    $("#wrong-list").innerHTML = "";
    return;
  }
  const items = stats.wrongList.map((item) =>
    `<div class="wrong-item">第 ${item.關卡} 關｜${item.題目} = <b>${item.正確答案}</b>（輸入 ${item.你的答案}）</div>`
  ).join("");
  $("#wrong-list").innerHTML = `<h3>本次錯題</h3>${items}`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} 分 ${rest} 秒` : `${rest} 秒`;
}

function quit() {
  if (!stats || stats.finalized) return;
  if (window.confirm("要結束並保存這次練習嗎？")) finish(false);
}

function again() {
  start();
}

function home() {
  show("setup");
}

function schedulePracticeReminder() {
  clearTimeout(practiceReminderTimer);
  practiceReminderTimer = setTimeout(showPracticeReminder, PRACTICE_REMINDER_MS);
}

function showPracticeReminder() {
  if (!stats || stats.finalized || stats.reminderShown || !$("#quiz").classList.contains("active")) return;
  stats.reminderShown = true;
  $("#practice-reminder").hidden = false;
}

function hidePracticeReminder() {
  clearTimeout(practiceReminderTimer);
  $("#practice-reminder").hidden = true;
}

function finishPracticeForToday() {
  hidePracticeReminder();
  finish(false);
}

function recordPayload(action, extra = {}) {
  return {
    action,
    session: stats.session,
    學生姓名: profile.name,
    班級: profile.className || "",
    選擇關卡: stats.planLabel,
    ...extra,
  };
}

function postRecord(payload, beacon = false) {
  if (!RECORD_URL) return false;
  const body = JSON.stringify(payload);
  try {
    if (beacon && navigator.sendBeacon) {
      return navigator.sendBeacon(RECORD_URL, new Blob([body], { type: "text/plain;charset=UTF-8" }));
    }
    fetch(RECORD_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body })
      .catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}

function startRecord() {
  const sent = postRecord(recordPayload("start", { 上線時間: new Date(stats.startTime).toISOString() }));
  $("#record-status").textContent = sent ? "" : "尚未連接成績試算表";
}

function finishRecord(completed, elapsed) {
  const sent = postRecord(recordPayload("finish", {
    結束時間: new Date().toISOString(),
    完成: completed ? "全破" : "未通關",
    到達關卡: stats.reachedLevel,
    總題數: stats.answered,
    答錯數: stats.wrong,
    用時秒: elapsed,
    錯題: stats.wrongList,
  }));
  $("#record-status").textContent = sent ? "學習紀錄已送出" : "本次結果已顯示；成績試算表尚未連接";
}

function finishOnPageHide() {
  if (!stats || stats.finalized) return;
  stats.finalized = true;
  const elapsed = Math.max(1, Math.round((Date.now() - stats.startTime) / 1000));
  postRecord(recordPayload("finish", {
    結束時間: new Date().toISOString(),
    完成: "未通關",
    到達關卡: stats.reachedLevel,
    總題數: stats.answered,
    答錯數: stats.wrong,
    用時秒: elapsed,
    錯題: stats.wrongList,
  }), true);
}

function bindEvents() {
  $("#login-form").addEventListener("submit", login);
  $("#logout-btn").addEventListener("click", logout);
  $("#lvl-all").addEventListener("click", () => $$("#levels-select input").forEach((input) => { input.checked = true; }));
  $("#lvl-none").addEventListener("click", () => $$("#levels-select input").forEach((input) => { input.checked = false; }));
  $("#start-btn").addEventListener("click", start);
  $("#quit-btn").addEventListener("click", quit);
  $("#submit-btn").addEventListener("click", submit);
  $("#again-btn").addEventListener("click", again);
  $("#home-btn").addEventListener("click", home);
  $("#reminder-rest").addEventListener("click", finishPracticeForToday);
  $("#reminder-continue").addEventListener("click", hidePracticeReminder);
  $$(".key").forEach((key) => key.addEventListener("click", () => pressKey(key.dataset.key)));

  window.addEventListener("keydown", (event) => {
    if (!$("#quiz").classList.contains("active") || !$("#practice-reminder").hidden) return;
    if (/^\d$/.test(event.key)) pressKey(event.key);
    else if (event.key === "-") pressKey("sign");
    else if (event.key === "Backspace") pressKey("back");
    else if (event.key === "Enter") submit();
  });
  window.addEventListener("pagehide", finishOnPageHide);
  document.addEventListener("gesturestart", (event) => event.preventDefault());
  document.addEventListener("dblclick", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });
}

function initialize() {
  Object.values(MASCOT_IMAGES).forEach((source) => {
    const image = new Image();
    image.src = source;
  });
  buildLevelSelect();
  bindEvents();
  $("#app-version").textContent = VERSION;
  profile = readProfile();
  if (profile) enterSetup();
  else show("login");

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch(() => {});
  }
}

initialize();
