/* ═══════════════════════════════════════════════════════════════════════════
   Stableford Tracker — Main Application
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Firebase Config ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDfbuEgkbUfAVMkjTOtdwGS07HfcgI5lR8",
  authDomain: "golftracker-2026.firebaseapp.com",
  databaseURL: "https://golftracker-2026-default-rtdb.firebaseio.com",
  projectId: "golftracker-2026",
  storageBucket: "golftracker-2026.firebasestorage.app",
  messagingSenderId: "908737680772",
  appId: "1:908737680772:web:9aab461254cc6d07c039d1",
  measurementId: "G-L6EQKTJ603"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ── Seed Courses ────────────────────────────────────────────────────────────
const SEED_COURSES = {
  skyrup: {
    name: "Skyrup GK", location: "Sweden", par: 71, holeCount: 18,
    imagePattern: "Skyrup_{n}.png",
    pars: [4, 4, 3, 5, 4, 3, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 4, 5],
    si: [14, 4, 18, 10, 6, 8, 2, 12, 16, 9, 17, 1, 5, 13, 7, 15, 3, 11],
    gps: [
      [56.133204, 13.667056], [56.134144, 13.662307], [56.134822, 13.664074],
      [56.136776, 13.668925], [56.135118, 13.664852], [56.133700, 13.665925],
      [56.132830, 13.671148], [56.134629, 13.665951], [56.133956, 13.671889],
      [56.134685, 13.674373], [56.135793, 13.677261], [56.132077, 13.674420],
      [56.134984, 13.676551], [56.133392, 13.678437], [56.130368, 13.680122],
      [56.128617, 13.677510], [56.131846, 13.677534], [56.130922, 13.671426]
    ],
    tees: {
      yellow: { label: "Yellow 59", length: 5696, rating: 70.9, slope: 129, lengths: [310, 345, 125, 465, 335, 135, 330, 380, 300, 465, 175, 375, 365, 140, 320, 315, 360, 460] },
      white:  { label: "White 53",  length: 5100, rating: 71.6, slope: 129, lengths: [300, 320, 100, 440, 295, 125, 275, 330, 290, 415, 150, 330, 320, 120, 320, 280, 315, 400] },
      blue:   { label: "Blue 47",   length: 4548, rating: 67.9, slope: 123, lengths: [260, 265, 100, 395, 270, 100, 275, 280, 250, 365, 125, 280, 280, 110, 285, 280, 265, 365] }
    }
  }
};

async function seedCoursesForUser(uid) {
  const snap = await db.ref("courses/" + uid).once("value");
  const existing = snap.val() || {};

  for (const [key, data] of Object.entries(SEED_COURSES)) {
    const existingId = Object.keys(existing).find(id => existing[id].seedKey === key);

    if (existingId) {
      const current = existing[existingId];
      const updates = {};
      if (data.imagePattern && !current.imagePattern) updates.imagePattern = data.imagePattern;
      if (data.tees && !current.tees) updates.tees = data.tees;
      if (Object.keys(updates).length > 0) {
        await db.ref("courses/" + uid + "/" + existingId).update(updates);
      }
      continue;
    }

    const holes = [];
    for (let i = 0; i < data.holeCount; i++) {
      holes.push({
        number: i + 1,
        par: data.pars[i],
        strokeIndex: data.si[i],
        pinLat: data.gps[i][0],
        pinLng: data.gps[i][1],
        distances: {
          yellow: data.tees.yellow.lengths[i],
          white: data.tees.white.lengths[i],
          blue: data.tees.blue.lengths[i]
        }
      });
    }

    await db.ref("courses/" + uid).push({
      name: data.name,
      location: data.location,
      holeCount: data.holeCount,
      totalPar: data.par,
      tees: data.tees,
      imagePattern: data.imagePattern || null,
      seedKey: key,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      holes
    });
  }
}

// ── State ───────────────────────────────────────────────────────────────────
const state = {
  user: null,
  profile: null,
  courses: [],
  currentCourse: null,
  currentRound: null,
  currentHole: 1,
  shots: [],
  route: "loading"
};

const CLUBS = [
  "Driver", "3W", "5W", "7W",
  "2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i",
  "PW", "GW", "SW", "LW",
  "Putter"
];

// ── Stableford Calculation ──────────────────────────────────────────────────
function calcStablefordPoints(gross, par, handicapStrokes) {
  const net = gross - handicapStrokes;
  const diff = net - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function getHandicapStrokes(holeIndex, handicap) {
  if (!handicap || handicap <= 0) return 0;
  const extra = Math.floor(handicap / 18);
  const remainder = handicap % 18;
  return extra + (holeIndex <= remainder ? 1 : 0);
}

function getScoreLabel(gross, par) {
  const diff = gross - par;
  if (diff <= -2) return { label: "Eagle+", cls: "birdie" };
  if (diff === -1) return { label: "Birdie", cls: "birdie" };
  if (diff === 0) return { label: "Par", cls: "par-score" };
  if (diff === 1) return { label: "Bogey", cls: "bogey" };
  if (diff === 2) return { label: "Double", cls: "double-bogey" };
  return { label: `+${diff}`, cls: "double-bogey" };
}

// ── GPS Utility ─────────────────────────────────────────────────────────────
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Router ──────────────────────────────────────────────────────────────────
function navigate(route, data) {
  if (data) Object.assign(state, data);
  state.route = route;
  render();
}

// ── Render ──────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById("app");
  switch (state.route) {
    case "loading":
      app.innerHTML = renderLoading();
      break;
    case "signin":
      app.innerHTML = renderSignIn();
      bindSignIn();
      break;
    case "dashboard":
      app.innerHTML = renderDashboard();
      bindDashboard();
      break;
    case "profile":
      app.innerHTML = renderProfile();
      bindProfile();
      break;
    case "courses":
      app.innerHTML = renderCourses();
      bindCourses();
      break;
    case "select-tee":
      app.innerHTML = renderSelectTee();
      bindSelectTee();
      break;
    case "create-course":
      app.innerHTML = renderCreateCourse();
      bindCreateCourse();
      break;
    case "course-setup":
      app.innerHTML = renderCourseSetup();
      bindCourseSetup();
      break;
    case "active-hole":
      app.innerHTML = renderActiveHole();
      bindActiveHole();
      break;
    case "scorecard":
      app.innerHTML = renderScorecard();
      bindScorecard();
      break;
    case "summary":
      app.innerHTML = renderSummary();
      bindSummary();
      break;
    default:
      app.innerHTML = renderLoading();
  }
}

// ── Render: Loading ─────────────────────────────────────────────────────────
function renderLoading() {
  return `
    <div class="loading-screen">
      <div class="circle-icon circle-icon-xl circle-icon-accent">
        <span class="material-icons-round" style="font-size:36px">sports_golf</span>
      </div>
      <div class="spinner-lg"></div>
      <p class="text-muted">Loading Stableford Tracker…</p>
    </div>`;
}

// ── Render: Sign In ─────────────────────────────────────────────────────────
function renderSignIn() {
  return `
    <div class="signin-screen">
      <div class="signin-logo">
        <div class="circle-icon circle-icon-xxl circle-icon-accent">
          <span class="material-icons-round" style="font-size:48px">sports_golf</span>
        </div>
      </div>
      <h1 class="signin-title">Stableford<br>Tracker</h1>
      <p class="signin-subtitle">Track shots · Score rounds · Improve your game</p>
      <button id="google-signin" class="btn btn-white btn-lg google-btn">
        <span class="google-g">G</span>
        Sign in with Google
      </button>
      <div id="signin-error"></div>
    </div>`;
}

function bindSignIn() {
  document.getElementById("google-signin").addEventListener("click", async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (err) {
      document.getElementById("signin-error").innerHTML =
        `<div class="error-box">${err.message}</div>`;
    }
  });
}

// ── Render: Dashboard ───────────────────────────────────────────────────────
function renderDashboard() {
  const name = state.profile?.displayName || state.user?.displayName || "Golfer";
  const hcp = state.profile?.handicap ?? "—";
  const photo = state.user?.photoURL;

  return `
    <nav class="topbar">
      <div class="topbar-title">Stableford Tracker</div>
      <div style="display:flex;gap:8px">
        <button class="topbar-btn" id="nav-profile" title="Profile">
          ${photo
      ? `<img src="${escapeAttr(photo)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" />`
      : `<span class="material-icons-round">person</span>`}
        </button>
      </div>
    </nav>

    <div class="page-content scrollable">
      <div class="dashboard-hero">
        <h1>Hello, ${escapeHtml(name.split(" ")[0])}</h1>
        <p class="text-secondary" style="margin-top:4px">Ready to play?</p>
      </div>

      <div class="dashboard-grid">
        <div class="card-glass dashboard-stat-card">
          <div class="text-muted text-sm">Handicap</div>
          <div class="hcp-display">${hcp}</div>
        </div>
        <div class="card-glass dashboard-stat-card" id="rounds-stat">
          <div class="text-muted text-sm">Rounds Played</div>
          <div class="hcp-display" id="rounds-count">—</div>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap">
        <button class="btn btn-primary btn-lg" id="start-round" style="flex:1;min-width:200px">
          <span class="material-icons-round">add</span>
          New Round
        </button>
        <button class="btn btn-outline btn-lg" id="nav-courses" style="flex:1;min-width:200px">
          <span class="material-icons-round">golf_course</span>
          My Courses
        </button>
      </div>

      <div style="margin-top:32px">
        <h2 style="margin-bottom:16px">Recent Rounds</h2>
        <div id="recent-rounds">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round text-muted" style="font-size:32px">history</span>
            </div>
            <p class="text-muted">No rounds yet. Start your first round!</p>
          </div>
        </div>
      </div>
    </div>`;
}

function bindDashboard() {
  document.getElementById("nav-profile").addEventListener("click", () => navigate("profile"));
  document.getElementById("start-round").addEventListener("click", () => navigate("courses"));
  document.getElementById("nav-courses").addEventListener("click", () => navigate("courses"));
  loadRecentRounds();
}

async function loadRecentRounds() {
  try {
    const snap = await db.ref("rounds/" + state.user.uid)
      .orderByChild("startedAt")
      .limitToLast(10)
      .once("value");

    const rounds = [];
    snap.forEach(child => {
      rounds.push({ id: child.key, ...child.val() });
    });
    rounds.reverse();

    const countEl = document.getElementById("rounds-count");
    if (countEl) countEl.textContent = rounds.length;

    const container = document.getElementById("recent-rounds");
    if (!container || rounds.length === 0) return;

    let html = "";
    for (const r of rounds) {
      const date = r.startedAt ? new Date(r.startedAt).toLocaleDateString() : "";
      const courseName = r.courseName || "Unknown Course";
      const totalPts = r.totalPoints ?? "—";
      const totalGross = r.totalGross ?? "—";
      const status = r.status === "completed" ? "Completed" : "In Progress";
      const statusCls = r.status === "completed" ? "badge-success" : "badge-warning";

      html += `
        <div class="card round-card" style="margin-bottom:12px;cursor:pointer" data-round-id="${r.id}">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div style="font-weight:600;font-size:16px">${escapeHtml(courseName)}</div>
              <div class="text-muted text-sm" style="margin-top:4px">${date}</div>
            </div>
            <span class="badge ${statusCls}">${status}</span>
          </div>
          <div style="display:flex;gap:24px;margin-top:12px">
            <div>
              <div class="text-muted text-xs">Points</div>
              <div style="font-size:22px;font-weight:800;color:var(--accent-bright)">${totalPts}</div>
            </div>
            <div>
              <div class="text-muted text-xs">Gross</div>
              <div style="font-size:22px;font-weight:800">${totalGross}</div>
            </div>
          </div>
        </div>`;
    }
    container.innerHTML = html;

    container.querySelectorAll("[data-round-id]").forEach(el => {
      el.addEventListener("click", () => resumeRound(el.dataset.roundId));
    });
  } catch (e) {
    console.error("Failed to load rounds:", e);
  }
}

async function resumeRound(roundId) {
  try {
    const uid = state.user.uid;
    const roundSnap = await db.ref("rounds/" + uid + "/" + roundId).once("value");
    if (!roundSnap.exists()) return;
    const round = { id: roundId, ...roundSnap.val() };

    if (round.status === "completed") {
      const courseSnap = await db.ref("courses/" + uid + "/" + round.courseId).once("value");
      if (courseSnap.exists()) {
        const courseData = courseSnap.val();
        state.currentCourse = { id: round.courseId, ...courseData, holes: courseData.holes || [] };
      }
      state.currentRound = round;
      navigate("summary");
      return;
    }

    const courseSnap = await db.ref("courses/" + uid + "/" + round.courseId).once("value");
    if (!courseSnap.exists()) return;
    const courseData = courseSnap.val();
    const course = { id: round.courseId, ...courseData, holes: courseData.holes || [] };

    const shotsSnap = await db.ref("shots/" + roundId).once("value");
    const shots = [];
    if (shotsSnap.exists()) {
      shotsSnap.forEach(child => {
        shots.push({ id: child.key, ...child.val() });
      });
    }
    shots.sort((a, b) => (a.holeNumber - b.holeNumber) || (a.strokeNumber - b.strokeNumber));

    state.currentCourse = course;
    state.currentRound = round;
    state.selectedTee = round.tee || null;
    state.shots = shots;
    state.currentHole = round.currentHole || 1;
    navigate("active-hole");
  } catch (e) {
    console.error("Failed to resume round:", e);
  }
}

// ── Render: Profile ─────────────────────────────────────────────────────────
function renderProfile() {
  const p = state.profile || {};
  const photo = state.user?.photoURL;
  const name = p.displayName || state.user?.displayName || "";
  const email = state.user?.email || "";
  const hcp = p.handicap ?? "";

  return `
    <nav class="topbar">
      <button class="topbar-btn" id="profile-back">
        <span class="material-icons-round">arrow_back</span>
      </button>
      <div class="topbar-title">Profile</div>
      <div style="width:40px"></div>
    </nav>

    <div class="page-content scrollable" style="max-width:600px;margin:0 auto">
      <div style="text-align:center;padding:24px 0">
        ${photo
      ? `<img src="${escapeAttr(photo)}" class="profile-avatar" />`
      : `<div class="profile-avatar-placeholder"><span class="material-icons-round" style="font-size:40px;color:#fff">person</span></div>`}
        <h2 style="margin-top:16px">${escapeHtml(name)}</h2>
        <p class="text-muted">${escapeHtml(email)}</p>
      </div>

      <div class="card" style="padding:24px">
        <div style="margin-bottom:20px">
          <label>Display Name</label>
          <input class="input" id="profile-name" value="${escapeAttr(name)}" placeholder="Your name" />
        </div>
        <div style="margin-bottom:20px">
          <label>Handicap</label>
          <input class="input" id="profile-hcp" type="number" step="0.1" min="0" max="54"
                 value="${escapeAttr(String(hcp))}" placeholder="e.g. 18.4" />
        </div>
        <button class="btn btn-primary btn-full" id="save-profile">Save Profile</button>
      </div>

      <button class="btn btn-danger-outline btn-full" id="sign-out" style="margin-top:24px">
        <span class="material-icons-round">logout</span>
        Sign Out
      </button>
    </div>`;
}

function bindProfile() {
  document.getElementById("profile-back").addEventListener("click", () => navigate("dashboard"));
  document.getElementById("sign-out").addEventListener("click", () => auth.signOut());

  document.getElementById("save-profile").addEventListener("click", async () => {
    const name = document.getElementById("profile-name").value.trim();
    const hcp = parseFloat(document.getElementById("profile-hcp").value) || 0;
    try {
      await db.ref("users/" + state.user.uid).update({
        displayName: name,
        handicap: hcp,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      state.profile = { ...state.profile, displayName: name, handicap: hcp };
      navigate("dashboard");
    } catch (e) {
      console.error("Failed to save profile:", e);
    }
  });
}

// ── Render: Courses ─────────────────────────────────────────────────────────
function renderCourses() {
  let courseListHtml = "";
  if (state.courses.length === 0) {
    courseListHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <span class="material-icons-round text-muted" style="font-size:32px">golf_course</span>
        </div>
        <p class="text-muted">No courses yet. Create your first course to get started.</p>
      </div>`;
  } else {
    state.courses.forEach(c => {
      const holeCount = c.holeCount || "?";
      const totalPar = c.totalPar || "—";
      courseListHtml += `
        <div class="course-item" data-course-id="${c.id}">
          <div class="circle-icon circle-icon-md circle-icon-ghost">
            <span class="material-icons-round" style="font-size:20px">golf_course</span>
          </div>
          <div style="flex:1">
            <div style="font-weight:600">${escapeHtml(c.name)}</div>
            <div class="text-muted text-sm">${holeCount} holes · Par ${totalPar}</div>
          </div>
          <div class="course-item-play">
            <span class="material-icons-round" style="color:var(--accent);font-size:20px">play_arrow</span>
          </div>
        </div>`;
    });
  }

  return `
    <nav class="topbar">
      <button class="topbar-btn" id="courses-back">
        <span class="material-icons-round">arrow_back</span>
      </button>
      <div class="topbar-title">Select Course</div>
      <button class="topbar-btn" id="add-course">
        <span class="material-icons-round">add</span>
      </button>
    </nav>

    <div class="page-content scrollable" style="max-width:800px;margin:0 auto">
      ${courseListHtml}
    </div>`;
}

function bindCourses() {
  document.getElementById("courses-back").addEventListener("click", () => navigate("dashboard"));
  document.getElementById("add-course").addEventListener("click", () => navigate("create-course"));

  document.querySelectorAll("[data-course-id]").forEach(el => {
    el.addEventListener("click", () => selectCourse(el.dataset.courseId));
  });

  if (state.courses.length === 0) {
    loadCourses();
  }
}

async function loadCourses() {
  try {
    const snap = await db.ref("courses/" + state.user.uid).once("value");
    const courses = [];
    if (snap.exists()) {
      snap.forEach(child => {
        const data = child.val();
        courses.push({ id: child.key, ...data, holes: data.holes || [] });
      });
    }
    state.courses = courses;
    if (state.route === "courses") render();
  } catch (e) {
    console.error("Failed to load courses:", e);
  }
}

async function selectCourse(courseId) {
  try {
    const snap = await db.ref("courses/" + state.user.uid + "/" + courseId).once("value");
    if (!snap.exists()) return;
    const data = snap.val();
    const course = { id: courseId, ...data, holes: data.holes || [] };

    state.currentCourse = course;

    if (course.tees && Object.keys(course.tees).length > 0) {
      navigate("select-tee");
    } else {
      state.selectedTee = null;
      await startNewRound(course);
    }
  } catch (e) {
    console.error("Failed to select course:", e);
  }
}

async function startNewRound(course) {
  try {
    const roundData = {
      courseId: course.id,
      courseName: course.name,
      holeCount: course.holeCount || course.holes?.length || 18,
      tee: state.selectedTee || null,
      status: "active",
      currentHole: 1,
      totalPoints: 0,
      totalGross: 0,
      handicap: state.profile?.handicap || 0,
      startedAt: firebase.database.ServerValue.TIMESTAMP
    };
    const ref = await db.ref("rounds/" + state.user.uid).push(roundData);
    state.currentRound = { id: ref.key, ...roundData };
    state.currentHole = 1;
    state.shots = [];
    navigate("active-hole");
  } catch (e) {
    console.error("Failed to start round:", e);
  }
}

// ── Render: Select Tee ─────────────────────────────────────────────────────
function renderSelectTee() {
  const course = state.currentCourse;
  const tees = course.tees || {};
  const teeColors = { yellow: "#FFD600", white: "#FFFFFF", blue: "#42A5F5", red: "#EF5350" };

  let teesHtml = "";
  for (const [key, tee] of Object.entries(tees)) {
    const color = teeColors[key] || "var(--accent)";
    teesHtml += `
      <div class="card tee-option" data-tee="${key}" style="margin-bottom:12px;cursor:pointer;transition:border-color 0.2s">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:16px;height:16px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 8px ${color}40"></div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:16px">${escapeHtml(tee.label || key)}</div>
            <div class="text-muted text-sm">${tee.length}m · Rating ${tee.rating} · Slope ${tee.slope}</div>
          </div>
          <span class="material-icons-round text-muted">chevron_right</span>
        </div>
      </div>`;
  }

  return `
    <nav class="topbar">
      <button class="topbar-btn" id="tee-back">
        <span class="material-icons-round">arrow_back</span>
      </button>
      <div class="topbar-title">${escapeHtml(course.name)}</div>
      <div style="width:40px"></div>
    </nav>

    <div class="page-content scrollable" style="max-width:600px;margin:0 auto">
      <h2 style="margin-bottom:4px">Select Tee</h2>
      <p class="text-muted" style="margin-bottom:20px">Choose which tee box you're playing from</p>
      ${teesHtml}
    </div>`;
}

function bindSelectTee() {
  document.getElementById("tee-back").addEventListener("click", () => navigate("courses"));

  document.querySelectorAll(".tee-option").forEach(el => {
    el.addEventListener("click", async () => {
      state.selectedTee = el.dataset.tee;
      await startNewRound(state.currentCourse);
    });
  });
}

// ── Render: Create Course ───────────────────────────────────────────────────
function renderCreateCourse() {
  return `
    <nav class="topbar">
      <button class="topbar-btn" id="create-course-back">
        <span class="material-icons-round">arrow_back</span>
      </button>
      <div class="topbar-title">New Course</div>
      <div style="width:40px"></div>
    </nav>

    <div class="page-content scrollable" style="max-width:600px;margin:0 auto">
      <div class="card" style="padding:24px">
        <div style="margin-bottom:20px">
          <label>Course Name</label>
          <input class="input" id="course-name" placeholder="e.g. Pebble Beach" />
        </div>
        <div style="margin-bottom:20px">
          <label>Number of Holes</label>
          <div style="display:flex;gap:12px">
            <button class="btn btn-outline hole-count-btn active" data-count="9">9 Holes</button>
            <button class="btn btn-outline hole-count-btn" data-count="18">18 Holes</button>
          </div>
        </div>
        <button class="btn btn-primary btn-full" id="create-course-next">
          Set Up Holes
          <span class="material-icons-round">arrow_forward</span>
        </button>
      </div>
    </div>`;
}

function bindCreateCourse() {
  document.getElementById("create-course-back").addEventListener("click", () => navigate("courses"));

  let holeCount = 9;
  document.querySelectorAll(".hole-count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".hole-count-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      holeCount = parseInt(btn.dataset.count);
    });
  });

  document.getElementById("create-course-next").addEventListener("click", () => {
    const name = document.getElementById("course-name").value.trim();
    if (!name) {
      document.getElementById("course-name").style.borderColor = "var(--error)";
      return;
    }
    state.currentCourse = { name, holeCount, holes: [] };
    for (let i = 1; i <= holeCount; i++) {
      state.currentCourse.holes.push({ number: i, par: 4, distance: 0, strokeIndex: i });
    }
    navigate("course-setup");
  });
}

// ── Render: Course Setup (hole details) ─────────────────────────────────────
function renderCourseSetup() {
  const c = state.currentCourse;
  let holesHtml = "";
  c.holes.forEach((h, i) => {
    holesHtml += `
      <div class="hole-setup-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3>Hole ${h.number}</h3>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="text-muted text-sm">SI</span>
            <input class="input" type="number" min="1" max="18" value="${h.strokeIndex}"
                   style="width:60px;padding:8px;text-align:center;font-size:14px"
                   data-hole="${i}" data-field="strokeIndex" />
          </div>
        </div>

        <div style="margin-bottom:12px">
          <label>Par</label>
          <div class="par-chips">
            ${[3, 4, 5].map(p => `
              <button class="par-chip ${h.par === p ? "active" : ""}" data-hole="${i}" data-par="${p}">${p}</button>
            `).join("")}
          </div>
        </div>

        <div>
          <label>Distance (meters)</label>
          <input class="input" type="number" min="0" max="700" value="${h.distance || ""}"
                 placeholder="e.g. 380" data-hole="${i}" data-field="distance"
                 style="font-size:14px;padding:10px 14px" />
        </div>
      </div>`;
  });

  return `
    <nav class="topbar">
      <button class="topbar-btn" id="setup-back">
        <span class="material-icons-round">arrow_back</span>
      </button>
      <div class="topbar-title">${escapeHtml(c.name)} — Setup</div>
      <div style="width:40px"></div>
    </nav>

    <div class="page-content scrollable" style="max-width:700px;margin:0 auto">
      <div class="course-setup-grid">
        ${holesHtml}
      </div>
      <button class="btn btn-primary btn-full btn-lg" id="save-course" style="margin-top:16px;margin-bottom:32px">
        <span class="material-icons-round">check</span>
        Save Course
      </button>
    </div>`;
}

function bindCourseSetup() {
  document.getElementById("setup-back").addEventListener("click", () => navigate("create-course"));

  document.querySelectorAll(".par-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const holeIdx = parseInt(chip.dataset.hole);
      const par = parseInt(chip.dataset.par);
      state.currentCourse.holes[holeIdx].par = par;
      chip.parentElement.querySelectorAll(".par-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  document.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", () => {
      const idx = parseInt(input.dataset.hole);
      const field = input.dataset.field;
      state.currentCourse.holes[idx][field] = parseInt(input.value) || 0;
    });
  });

  document.getElementById("save-course").addEventListener("click", saveCourse);
}

async function saveCourse() {
  const c = state.currentCourse;
  const totalPar = c.holes.reduce((sum, h) => sum + h.par, 0);

  try {
    const ref = await db.ref("courses/" + state.user.uid).push({
      name: c.name,
      holeCount: c.holeCount,
      totalPar,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      holes: c.holes
    });

    state.currentCourse = { id: ref.key, ...c, totalPar };
    navigate("courses");
  } catch (e) {
    console.error("Failed to save course:", e);
  }
}

// ── Render: Active Hole ─────────────────────────────────────────────────────
function renderActiveHole() {
  const course = state.currentCourse;
  const holeNum = state.currentHole;
  const holeData = course.holes?.find(h => h.number === holeNum) || { par: 4, distance: 0 };
  const tee = state.selectedTee || state.currentRound?.tee;
  const teeDistance = (tee && holeData.distances?.[tee]) || holeData.distance || 0;
  const holeShots = state.shots.filter(s => s.holeNumber === holeNum);
  const handicap = state.profile?.handicap || state.currentRound?.handicap || 0;
  const hcpStrokes = getHandicapStrokes(holeData.strokeIndex || holeNum, handicap);
  const totalHoles = course.holeCount || course.holes?.length || 18;

  let shotsHtml = "";
  if (holeShots.length === 0) {
    shotsHtml = `<p class="text-muted text-center" style="padding:20px">No strokes recorded yet</p>`;
  } else {
    holeShots.forEach((s, i) => {
      shotsHtml += `
        <div class="stroke-item">
          <div class="stroke-num">${i + 1}</div>
          <div class="stroke-info">
            <div class="stroke-club">${escapeHtml(s.club)}</div>
            ${s.distance ? `<div class="stroke-dist">${s.distance}m</div>` : ""}
          </div>
          <button class="stroke-delete" data-shot-idx="${i}" title="Delete stroke">
            <span class="material-icons-round" style="font-size:18px">close</span>
          </button>
        </div>`;
    });
  }

  const totalPts = calcTotalPoints();

  return `
    <nav class="topbar">
      <button class="topbar-btn" id="hole-menu">
        <span class="material-icons-round">menu</span>
      </button>
      <div class="hole-title-block">
        <div class="hole-title">HOLE ${holeNum}</div>
        <div class="hole-subtitle">Par ${holeData.par} · ${teeDistance || "—"}m · SI ${holeData.strokeIndex || holeNum}</div>
      </div>
      <button class="topbar-btn" id="hole-scorecard">
        <span class="material-icons-round">grid_on</span>
      </button>
    </nav>

    <div class="page-content scrollable">
      <div class="active-hole-layout">
        <div class="hole-info-panel">
          <div class="distance-card" style="margin:0">
            <span class="material-icons-round text-accent">place</span>
            <div class="distance-value" id="live-distance">—</div>
            <div class="text-muted text-xs">to pin</div>
          </div>

          <div class="card" style="margin-top:12px;text-align:center;padding:20px">
            <div class="text-muted text-sm">Strokes</div>
            <div style="font-size:36px;font-weight:800;color:var(--accent-bright)">${holeShots.length}</div>
            ${hcpStrokes > 0 ? `<div class="badge badge-accent" style="margin-top:8px">+${hcpStrokes} HCP stroke${hcpStrokes > 1 ? "s" : ""}</div>` : ""}
          </div>
        </div>

        <div class="hole-shots-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3>Strokes</h3>
            <button class="btn btn-primary" id="add-stroke">
              <span class="material-icons-round" style="font-size:18px">add</span>
              Add Stroke
            </button>
          </div>
          ${shotsHtml}
        </div>
      </div>
    </div>

    <div class="bottom-nav">
      <button class="btn btn-ghost" id="prev-hole" ${holeNum <= 1 ? "disabled" : ""}>
        <span class="material-icons-round">chevron_left</span>
        Hole ${holeNum - 1}
      </button>
      <div style="text-align:center">
        <div class="text-muted text-xs">Total Points</div>
        <div style="font-size:20px;font-weight:800;color:var(--accent-bright)">${totalPts}</div>
      </div>
      ${holeNum >= totalHoles
      ? `<button class="btn btn-primary" id="finish-round">Finish</button>`
      : `<button class="btn btn-ghost" id="next-hole">
            Hole ${holeNum + 1}
            <span class="material-icons-round">chevron_right</span>
          </button>`}
    </div>

    <div id="modal-container"></div>`;
}

function getHoleImageUrl(course, holeNum) {
  const pattern = course.imagePattern;
  if (!pattern) return null;
  return pattern.replace("{n}", holeNum);
}

function showHoleImagePopup() {
  const course = state.currentCourse;
  const imgUrl = getHoleImageUrl(course, state.currentHole);
  if (!imgUrl) return;

  const holeData = course.holes?.find(h => h.number === state.currentHole) || {};
  const tee = state.selectedTee || state.currentRound?.tee;
  const dist = (tee && holeData.distances?.[tee]) || holeData.distance || 0;

  const container = document.getElementById("modal-container");
  container.innerHTML = `
    <div class="modal-overlay" id="hole-img-overlay" style="display:flex;align-items:center;justify-content:center;z-index:200">
      <div class="hole-img-popup">
        <div class="hole-img-popup-header">
          <h2>Hole ${state.currentHole}</h2>
          <div class="text-secondary text-sm">Par ${holeData.par || 4}${dist ? " · " + dist + "m" : ""}${holeData.strokeIndex ? " · SI " + holeData.strokeIndex : ""}</div>
        </div>
        <img src="${escapeAttr(imgUrl)}" alt="Hole ${state.currentHole}" class="hole-img-popup-img" />
        <button class="btn btn-primary btn-full" id="hole-img-dismiss" style="margin-top:16px">
          <span class="material-icons-round">sports_golf</span>
          Let's Go
        </button>
      </div>
    </div>`;

  document.getElementById("hole-img-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeHoleImagePopup();
  });
  document.getElementById("hole-img-dismiss").addEventListener("click", closeHoleImagePopup);
}

function closeHoleImagePopup() {
  const container = document.getElementById("modal-container");
  if (container) container.innerHTML = "";
}

function showRoundMenu() {
  const container = document.getElementById("modal-container");
  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay"></div>
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 style="margin-bottom:20px">Round Menu</h3>
      <button class="btn btn-primary btn-full" id="menu-finish-round" style="margin-bottom:12px">
        <span class="material-icons-round">flag</span>
        Finish Round
      </button>
      <button class="btn btn-danger-outline btn-full" id="menu-quit-round">
        <span class="material-icons-round">exit_to_app</span>
        Quit Without Saving
      </button>
    </div>`;

  document.getElementById("modal-overlay").addEventListener("click", closeModal);
  document.getElementById("menu-finish-round").addEventListener("click", () => {
    closeModal();
    finishRound();
  });
  document.getElementById("menu-quit-round").addEventListener("click", () => {
    closeModal();
    navigate("dashboard");
  });
}

function bindActiveHole() {
  document.getElementById("hole-menu")?.addEventListener("click", showRoundMenu);
  document.getElementById("hole-scorecard")?.addEventListener("click", () => navigate("scorecard"));
  document.getElementById("add-stroke")?.addEventListener("click", showAddStrokeModal);
  document.getElementById("prev-hole")?.addEventListener("click", () => {
    if (state.currentHole > 1) {
      state.currentHole--;
      updateRoundHole();
      render();
    }
  });
  document.getElementById("next-hole")?.addEventListener("click", () => {
    state.currentHole++;
    updateRoundHole();
    render();
  });
  document.getElementById("finish-round")?.addEventListener("click", finishRound);

  document.querySelectorAll(".stroke-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.shotIdx);
      deleteShot(idx);
    });
  });

  showHoleImagePopup();
  updateLiveDistance();
}

function updateRoundHole() {
  if (state.currentRound?.id) {
    db.ref("rounds/" + state.user.uid + "/" + state.currentRound.id).update({
      currentHole: state.currentHole
    }).catch(console.error);
  }
}

async function updateLiveDistance() {
  const holeData = state.currentCourse.holes?.find(h => h.number === state.currentHole);
  if (!holeData?.pinLat || !holeData?.pinLng) return;

  try {
    const pos = await getCurrentPosition();
    const dist = calcDistance(pos.lat, pos.lng, holeData.pinLat, holeData.pinLng);
    const el = document.getElementById("live-distance");
    if (el) el.textContent = `${Math.round(dist)}m`;
  } catch (e) {
    // GPS not available
  }
}

function showAddStrokeModal() {
  const container = document.getElementById("modal-container");
  const clubsHtml = CLUBS.map(c => `
    <button class="btn btn-outline club-btn" data-club="${c}" style="padding:10px 14px;font-size:14px">${c}</button>
  `).join("");

  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay"></div>
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 style="margin-bottom:16px">Add Stroke</h3>

      <label>Club</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px" id="club-grid">
        ${clubsHtml}
      </div>

      <div style="margin-bottom:20px">
        <label>Distance (meters, optional)</label>
        <input class="input" id="stroke-distance" type="number" min="0" max="400" placeholder="e.g. 150" />
      </div>

      <input type="hidden" id="selected-club" value="" />

      <button class="btn btn-primary btn-full" id="confirm-stroke" disabled>
        <span class="material-icons-round">check</span>
        Add Stroke
      </button>
    </div>`;

  document.getElementById("modal-overlay").addEventListener("click", closeModal);

  document.querySelectorAll(".club-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".club-btn").forEach(b => {
        b.classList.remove("active");
        b.style.background = "";
        b.style.borderColor = "";
      });
      btn.classList.add("active");
      btn.style.background = "rgba(102,187,106,0.2)";
      btn.style.borderColor = "var(--accent)";
      document.getElementById("selected-club").value = btn.dataset.club;
      document.getElementById("confirm-stroke").disabled = false;
    });
  });

  document.getElementById("confirm-stroke").addEventListener("click", async () => {
    const club = document.getElementById("selected-club").value;
    if (!club) return;
    const dist = parseInt(document.getElementById("stroke-distance").value) || 0;
    await addShot(club, dist);
    closeModal();
    render();
  });
}

function closeModal() {
  const container = document.getElementById("modal-container");
  if (container) container.innerHTML = "";
}

async function addShot(club, distance) {
  const holeShots = state.shots.filter(s => s.holeNumber === state.currentHole);
  const shotData = {
    holeNumber: state.currentHole,
    strokeNumber: holeShots.length + 1,
    club,
    distance: distance || 0,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  try {
    const ref = await db.ref("shots/" + state.currentRound.id).push(shotData);
    state.shots.push({ id: ref.key, ...shotData });
    updateRoundTotals();
  } catch (e) {
    console.error("Failed to add shot:", e);
  }
}

async function deleteShot(holeIdx) {
  const holeShots = state.shots.filter(s => s.holeNumber === state.currentHole);
  const shot = holeShots[holeIdx];
  if (!shot?.id) return;

  try {
    await db.ref("shots/" + state.currentRound.id + "/" + shot.id).remove();
    state.shots = state.shots.filter(s => s.id !== shot.id);
    updateRoundTotals();
    render();
  } catch (e) {
    console.error("Failed to delete shot:", e);
  }
}

function calcTotalPoints() {
  const course = state.currentCourse;
  const handicap = state.profile?.handicap || state.currentRound?.handicap || 0;
  let total = 0;
  const totalHoles = course.holeCount || course.holes?.length || 18;

  for (let h = 1; h <= totalHoles; h++) {
    const holeShots = state.shots.filter(s => s.holeNumber === h);
    if (holeShots.length === 0) continue;
    const holeData = course.holes?.find(x => x.number === h) || { par: 4, strokeIndex: h };
    const hcpStrokes = getHandicapStrokes(holeData.strokeIndex || h, handicap);
    total += calcStablefordPoints(holeShots.length, holeData.par, hcpStrokes);
  }
  return total;
}

function calcTotalGross() {
  const course = state.currentCourse;
  const totalHoles = course.holeCount || course.holes?.length || 18;
  let total = 0;
  for (let h = 1; h <= totalHoles; h++) {
    const holeShots = state.shots.filter(s => s.holeNumber === h);
    total += holeShots.length;
  }
  return total;
}

async function updateRoundTotals() {
  if (!state.currentRound?.id) return;
  try {
    await db.ref("rounds/" + state.user.uid + "/" + state.currentRound.id).update({
      totalPoints: calcTotalPoints(),
      totalGross: calcTotalGross()
    });
  } catch (e) {
    console.error("Failed to update round totals:", e);
  }
}

async function finishRound() {
  if (!state.currentRound?.id) return;
  try {
    const totalPts = calcTotalPoints();
    const totalGross = calcTotalGross();
    await db.ref("rounds/" + state.user.uid + "/" + state.currentRound.id).update({
      status: "completed",
      totalPoints: totalPts,
      totalGross: totalGross,
      completedAt: firebase.database.ServerValue.TIMESTAMP
    });
    state.currentRound.status = "completed";
    state.currentRound.totalPoints = totalPts;
    state.currentRound.totalGross = totalGross;
    navigate("summary");
  } catch (e) {
    console.error("Failed to finish round:", e);
  }
}

// ── Render: Scorecard ───────────────────────────────────────────────────────
function renderScorecard() {
  const course = state.currentCourse;
  const handicap = state.profile?.handicap || state.currentRound?.handicap || 0;
  const totalHoles = course.holeCount || course.holes?.length || 18;

  let totalPar = 0;
  let totalGross = 0;
  let totalPts = 0;

  let rowsHtml = `
    <div class="scorecard-row header">
      <div class="scorecard-cell">H</div>
      <div class="scorecard-cell">Par</div>
      <div class="scorecard-cell">SI</div>
      <div class="scorecard-cell" style="text-align:left">Score</div>
      <div class="scorecard-cell">Pts</div>
    </div>`;

  for (let h = 1; h <= totalHoles; h++) {
    const holeData = course.holes?.find(x => x.number === h) || { par: 4, strokeIndex: h };
    const holeShots = state.shots.filter(s => s.holeNumber === h);
    const gross = holeShots.length;
    const hcpStrokes = getHandicapStrokes(holeData.strokeIndex || h, handicap);
    const pts = gross > 0 ? calcStablefordPoints(gross, holeData.par, hcpStrokes) : 0;

    totalPar += holeData.par;
    totalGross += gross;
    totalPts += pts;

    const isCurrent = h === state.currentHole;
    const rowCls = isCurrent ? "current" : (h % 2 === 0 ? "even" : "odd");
    const scoreInfo = gross > 0 ? getScoreLabel(gross, holeData.par) : null;

    rowsHtml += `
      <div class="scorecard-row ${rowCls}" data-goto-hole="${h}" style="cursor:pointer">
        <div class="scorecard-cell font-bold">${h}</div>
        <div class="scorecard-cell">${holeData.par}</div>
        <div class="scorecard-cell">${holeData.strokeIndex || h}</div>
        <div class="scorecard-cell" style="text-align:left">
          ${gross > 0 ? `<span class="${scoreInfo?.cls || ""}">${gross}</span>` : "—"}
        </div>
        <div class="scorecard-cell">
          ${gross > 0 ? `<span class="points-badge" style="background:rgba(102,187,106,${pts > 0 ? 0.15 : 0.05});color:${pts > 0 ? 'var(--accent-bright)' : 'var(--text-muted)'}">${pts}</span>` : "—"}
        </div>
      </div>`;
  }

  rowsHtml += `
    <div class="scorecard-row totals">
      <div class="scorecard-cell"></div>
      <div class="scorecard-cell">${totalPar}</div>
      <div class="scorecard-cell"></div>
      <div class="scorecard-cell" style="text-align:left;font-weight:800">${totalGross}</div>
      <div class="scorecard-cell">
        <span class="points-badge" style="background:rgba(102,187,106,0.2);color:var(--accent-bright);font-size:16px">${totalPts}</span>
      </div>
    </div>`;

  return `
    <nav class="topbar">
      <button class="topbar-btn" id="scorecard-back">
        <span class="material-icons-round">arrow_back</span>
      </button>
      <div class="topbar-title">Scorecard</div>
      <div style="width:40px"></div>
    </nav>

    <div class="page-content scrollable" style="max-width:700px;margin:0 auto">
      <div class="scorecard-summary">
        <div class="scorecard-stat">
          <div class="scorecard-stat-value highlight">${totalPts}</div>
          <div class="scorecard-stat-label">Points</div>
        </div>
        <div class="scorecard-divider"></div>
        <div class="scorecard-stat">
          <div class="scorecard-stat-value">${totalGross}</div>
          <div class="scorecard-stat-label">Gross</div>
        </div>
        <div class="scorecard-divider"></div>
        <div class="scorecard-stat">
          <div class="scorecard-stat-value">${totalGross > 0 ? (totalGross - totalPar >= 0 ? "+" : "") + (totalGross - totalPar) : "—"}</div>
          <div class="scorecard-stat-label">vs Par</div>
        </div>
      </div>

      <div class="scorecard-table">
        ${rowsHtml}
      </div>
    </div>`;
}

function bindScorecard() {
  document.getElementById("scorecard-back").addEventListener("click", () => navigate("active-hole"));

  document.querySelectorAll("[data-goto-hole]").forEach(row => {
    row.addEventListener("click", () => {
      state.currentHole = parseInt(row.dataset.gotoHole);
      navigate("active-hole");
    });
  });
}

// ── Render: Summary ─────────────────────────────────────────────────────────
function renderSummary() {
  const round = state.currentRound;
  const course = state.currentCourse;
  const handicap = round?.handicap || state.profile?.handicap || 0;
  const totalHoles = course?.holeCount || course?.holes?.length || 18;
  const totalPts = round?.totalPoints ?? calcTotalPoints();
  const totalGross = round?.totalGross ?? calcTotalGross();
  const totalPar = course?.totalPar || course?.holes?.reduce((s, h) => s + h.par, 0) || 72;

  let holeGridHtml = "";
  if (course?.holes) {
    for (let h = 1; h <= totalHoles; h++) {
      const holeData = course.holes.find(x => x.number === h) || { par: 4, strokeIndex: h };
      const holeShots = state.shots.filter(s => s.holeNumber === h);
      const gross = holeShots.length;
      const hcpStrokes = getHandicapStrokes(holeData.strokeIndex || h, handicap);
      const pts = gross > 0 ? calcStablefordPoints(gross, holeData.par, hcpStrokes) : 0;
      const scoreInfo = gross > 0 ? getScoreLabel(gross, holeData.par) : null;

      holeGridHtml += `
        <div class="hole-mini" style="background:${scoreInfo && scoreInfo.cls !== "par-score"
          ? `rgba(${scoreInfo.cls === "birdie" ? "102,187,106" : scoreInfo.cls === "bogey" ? "255,183,77" : "239,83,80"},0.15)`
          : "var(--surface-card)"}">
          <div class="hole-mini-num">H${h}</div>
          <div class="hole-mini-gross">${gross || "—"}</div>
          <div class="hole-mini-pts">${gross > 0 ? pts + "pt" : ""}</div>
        </div>`;
    }
  }

  return `
    <div class="screen summary-screen">
      <nav class="topbar">
        <button class="topbar-btn" id="summary-back">
          <span class="material-icons-round">arrow_back</span>
        </button>
        <div class="topbar-title">Round Summary</div>
        <div style="width:40px"></div>
      </nav>

      <div class="page-content scrollable" style="max-width:800px;margin:0 auto">
        <div style="text-align:center;padding:24px 0">
          <div class="circle-icon circle-icon-xl circle-icon-accent" style="margin:0 auto">
            <span class="material-icons-round" style="font-size:36px">emoji_events</span>
          </div>
          <h2 style="margin-top:16px">${escapeHtml(course?.name || round?.courseName || "Round Complete")}</h2>
        </div>

        <div class="summary-stats-grid">
          <div class="summary-stat-card large">
            <div class="text-muted text-sm">Stableford Points</div>
            <div class="summary-stat-value huge" style="color:var(--accent-bright)">${totalPts}</div>
          </div>
          <div class="summary-stat-card">
            <div class="text-muted text-sm">Gross Score</div>
            <div class="summary-stat-value big">${totalGross}</div>
          </div>
          <div class="summary-stat-card">
            <div class="text-muted text-sm">vs Par</div>
            <div class="summary-stat-value big">${totalGross > 0 ? (totalGross - totalPar >= 0 ? "+" : "") + (totalGross - totalPar) : "—"}</div>
          </div>
        </div>

        ${holeGridHtml ? `
          <h3 style="margin-top:24px;margin-bottom:12px">Hole by Hole</h3>
          <div class="hole-mini-grid">${holeGridHtml}</div>
        ` : ""}

        <button class="btn btn-primary btn-full btn-lg" id="back-to-dashboard" style="margin-top:32px;margin-bottom:32px">
          <span class="material-icons-round">home</span>
          Back to Dashboard
        </button>
      </div>
    </div>`;
}

function bindSummary() {
  document.getElementById("summary-back")?.addEventListener("click", () => navigate("dashboard"));
  document.getElementById("back-to-dashboard")?.addEventListener("click", () => navigate("dashboard"));
}

// ── Utilities ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Initial Render ─────────────────────────────────────────────────────────
render();

const _authTimeout = setTimeout(() => {
  if (state.route === "loading") navigate("signin");
}, 5000);

// ── Auth State Listener ─────────────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  clearTimeout(_authTimeout);
  if (user) {
    state.user = user;
    try {
      const profileSnap = await db.ref("users/" + user.uid).once("value");
      state.profile = profileSnap.exists()
        ? profileSnap.val()
        : { displayName: user.displayName, handicap: 0 };

      if (!profileSnap.exists()) {
        await db.ref("users/" + user.uid).set({
          displayName: user.displayName || "",
          email: user.email || "",
          handicap: 0,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
      }

      await seedCoursesForUser(user.uid);

      const coursesSnap = await db.ref("courses/" + user.uid).once("value");
      const courses = [];
      if (coursesSnap.exists()) {
        coursesSnap.forEach(child => {
          const data = child.val();
          courses.push({ id: child.key, ...data, holes: data.holes || [] });
        });
      }
      state.courses = courses;

      navigate("dashboard");
    } catch (e) {
      console.error("Auth setup error:", e);
      navigate("dashboard");
    }
  } else {
    state.user = null;
    state.profile = null;
    navigate("signin");
  }
});
