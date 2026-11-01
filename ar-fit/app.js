'use strict';
/* ================= AR Fit — dynamic weight-loss routine app =================
   © AR. Design, logo and content belong to AR; copying without permission is prohibited.
   Data layer: IndexedDB (per-device database). Accounts are separated per user,
   passwords are stored only as salted SHA-256 hashes. */
const OWNER_EMAIL = 'zyxmdasaduzzaman@gmail.com';
const DB_NAME = 'arfit_db', DB_VER = 1;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BN = '০১২৩৪৫৬৭৮৯';
const toBn = v => String(v).replace(/[0-9]/g, d => BN[+d]);
const round1 = n => Math.round(n * 10) / 10;
const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
function ageFromDob(dob) { const t = new Date(), b = new Date(dob + 'T00:00:00'); let a = t.getFullYear() - b.getFullYear(); const m = t.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--; return a; }
function fmtTime(t) { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'অপরাহ্ণ' : 'সকাল'; if (h === 0) h = 12; else if (h > 12) h -= 12; return toBn(h) + ':' + toBn(String(m).padStart(2, '0')); }
function addMin(t, mins) { let [h, m] = t.split(':').map(Number); let tot = (h * 60 + m + mins + 1440) % 1440; return String(Math.floor(tot / 60)).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0'); }
function fmtDateBn(iso) { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']; return toBn(d.getDate()) + ' ' + months[d.getMonth()] + ' ' + toBn(d.getFullYear()); }

/* ---------- IndexedDB ---------- */
const dbReady = new Promise((res, rej) => {
  const req = indexedDB.open(DB_NAME, DB_VER);
  req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'email' }); if (!db.objectStoreNames.contains('userdata')) db.createObjectStore('userdata', { keyPath: 'email' }); };
  req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
});
function idb(store, mode, fn) { return dbReady.then(db => new Promise((res, rej) => { const tx = db.transaction(store, mode); const os = tx.objectStore(store); const r = fn(os); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); tx.onerror = () => rej(tx.error); })); }
const idbGet = (store, key) => idb(store, 'readonly', os => os.get(key));
const idbAll = store => idb(store, 'readonly', os => os.getAll());
const idbPut = (store, val) => idb(store, 'readwrite', os => os.put(val));

/* ---------- password hashing ---------- */
async function hashPass(pass, salt) {
  const text = salt + '::' + pass;
  if (window.crypto && crypto.subtle) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'fnv' + h.toString(16);
}
const newSalt = () => { const a = new Uint8Array(8); (window.crypto ? crypto.getRandomValues(a) : a.fill(7)); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };

/* ---------- session state ---------- */
let currentUser = null;   // account record
let userData = null;      // per-user data record
async function loadUserData(email) { userData = await idbGet('userdata', email); if (!userData) { userData = { email, profile: null, weights: [], checklist: {}, notifications: [], lastNotifFor: null, createdAt: todayStr() }; await idbPut('userdata', userData); } return userData; }
async function saveUserData() { if (userData) await idbPut('userdata', userData); }
function showView(name) { ['viewAuth', 'viewProfile', 'viewDash', 'viewAdmin'].forEach(v => $(v).hidden = (v !== name)); $('topActions').hidden = !currentUser; window.scrollTo({ top: 0 }); }

/* ---------- auth ---------- */
function setTab(reg) { $('tabLogin').classList.toggle('active', !reg); $('tabRegister').classList.toggle('active', reg); $('formLogin').hidden = reg; $('formRegister').hidden = !reg; }
$('tabLogin').addEventListener('click', () => setTab(false));
$('tabRegister').addEventListener('click', () => setTab(true));
$('brandHome').addEventListener('click', e => { e.preventDefault(); if (currentUser && userData && userData.profile) renderDashboard(); else if (currentUser) showView('viewProfile'); else showView('viewAuth'); });

$('formRegister').addEventListener('submit', async e => {
  e.preventDefault(); const err = $('regErr'); err.hidden = true;
  const name = $('regName').value.trim(), email = $('regEmail').value.trim().toLowerCase(), pass = $('regPass').value;
  if (await idbGet('accounts', email)) { err.textContent = 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে — লগইন করুন।'; err.hidden = false; return; }
  const salt = newSalt(); const role = (email === OWNER_EMAIL) ? 'admin' : 'user';
  const acc = { email, name, salt, hash: await hashPass(pass, salt), role, createdAt: todayStr() };
  await idbPut('accounts', acc); await loadUserData(email); await enterApp(acc);
});
$('formLogin').addEventListener('submit', async e => {
  e.preventDefault(); const err = $('loginErr'); err.hidden = true;
  const email = $('loginEmail').value.trim().toLowerCase(), pass = $('loginPass').value;
  const acc = await idbGet('accounts', email);
  if (!acc || acc.hash !== await hashPass(pass, acc.salt)) { err.textContent = 'ইমেইল বা পাসওয়ার্ড মিলছে না। আবার চেষ্টা করুন।'; err.hidden = false; return; }
  await loadUserData(email); await enterApp(acc);
});
async function enterApp(acc) { currentUser = acc; sessionStorage.setItem('arfit_user', acc.email); if (userData.profile) { await weeklyCheck(); renderDashboard(); } else { fillProfileForm(null); showView('viewProfile'); } updateBell(); }
$('btnLogout').addEventListener('click', () => { currentUser = null; userData = null; sessionStorage.removeItem('arfit_user'); showView('viewAuth'); });

/* ---------- profile form ---------- */
function checkedVals(boxId) { return [...document.querySelectorAll('#' + boxId + ' input:checked')].map(i => i.value); }
function setChecked(boxId, vals) { document.querySelectorAll('#' + boxId + ' input').forEach(i => i.checked = (vals || []).includes(i.value)); }
function fillProfileForm(p) {
  if (!p) return;
  $('pGender').value = p.gender; $('pDob').value = p.dob; $('pHeightFt').value = p.heightFt; $('pHeightIn').value = p.heightIn;
  $('pWeight').value = p.weight; $('pTarget').value = p.target; $('pMonths').value = p.months; $('pSitting').value = p.sitting;
  $('pWalk').value = p.walk; $('pPlace').value = p.place; $('pExMin').value = p.exMin; $('pWake').value = p.wake;
  $('pWorkStart').value = p.workStart || ''; $('pWorkEnd').value = p.workEnd || ''; $('pSleep').value = p.sleep; $('pSleepHrs').value = p.sleepHrs; $('pWaterNow').value = p.waterNow;
  $('pPrayer').checked = !!p.prayer; setChecked('pHabits', p.habits); setChecked('pHealth', p.health);
}
$('formProfile').addEventListener('submit', async e => {
  e.preventDefault();
  const isFirst = !userData.profile;
  const p = {
    gender: $('pGender').value, dob: $('pDob').value, heightFt: +$('pHeightFt').value, heightIn: +$('pHeightIn').value,
    weight: +$('pWeight').value, target: +$('pTarget').value, months: +$('pMonths').value, sitting: +$('pSitting').value,
    walk: $('pWalk').value, place: $('pPlace').value, exMin: +$('pExMin').value, wake: $('pWake').value,
    workStart: $('pWorkStart').value, workEnd: $('pWorkEnd').value, sleep: $('pSleep').value, sleepHrs: +$('pSleepHrs').value,
    waterNow: +$('pWaterNow').value, prayer: $('pPrayer').checked, habits: checkedVals('pHabits'), health: checkedVals('pHealth'),
    updatedAt: todayStr()
  };
  userData.profile = p;
  if (isFirst || !userData.weights.length) userData.weights = [{ date: todayStr(), kg: p.weight, note: 'শুরু' }];
  else { const i = userData.weights.findIndex(w => w.note === 'শুরু'); if (i >= 0) userData.weights[i].kg = p.weight; }
  userData.notifications.push({ id: Date.now(), date: todayStr(), text: 'আপনার ড্যাশবোর্ড তৈরি হয়েছে। প্রতি সপ্তাহে একবার ওজন দিয়ে অগ্রগতি দেখুন।', unread: true });
  await saveUserData(); await weeklyCheck(); renderDashboard();
});

/* ================= plan engine ================= */
function buildPlan(p, currentKg) {
  const age = ageFromDob(p.dob);
  const heightCm = (p.heightFt * 12 + p.heightIn) * 2.54, heightM = heightCm / 100;
  const bmi = currentKg / (heightM * heightM);
  const bmiGoal = p.target / (heightM * heightM);
  let bmr = 10 * currentKg + 6.25 * heightCm - 5 * age + (p.gender === 'male' ? 5 : -161);
  let factor = p.walk === 'high' ? 1.5 : p.walk === 'mid' ? 1.4 : 1.3;
  if (p.sitting >= 8) factor -= 0.05;
  const tdee = bmr * factor;
  const totalLoss = Math.max(0, round1(currentKg - p.target));
  const desiredWeeks = Math.max(1, Math.round(p.months * 4.345));
  const exBurn = Math.round(p.exMin * 4); // roughly 4 kcal per minute of light exercise
  let deficit = totalLoss > 0 ? (totalLoss / desiredWeeks) * 1100 : 0;
  const maxDeficit = 550;
  let unrealistic = false;
  if (deficit > maxDeficit) { deficit = maxDeficit; unrealistic = true; }
  const floor = p.gender === 'male' ? 1500 : 1200;
  let calories = Math.round(tdee - deficit); if (calories < floor) { calories = floor; deficit = Math.max(0, Math.round(tdee - calories)); }
  const weeklyRate = round1(((deficit + exBurn) * 7) / 7700);
  const realisticWeeks = totalLoss > 0 && weeklyRate > 0 ? Math.ceil(totalLoss / weeklyRate) : 0;
  const protein = Math.min(120, Math.max(55, Math.round(p.target * 1.6)));
  const waterL = round1(Math.min(3.2, Math.max(1.8, currentKg * 0.033)));
  const riceLunch = Math.round(calories * 0.11), riceDinner = Math.round(riceLunch * 0.75);
  const monthsPlan = [];
  const totalMonths = Math.max(1, Math.ceil(realisticWeeks / 4.345));
  for (let m = 1; m <= totalMonths; m++) { const kg = Math.max(p.target, round1(currentKg - weeklyRate * 4.345 * m)); monthsPlan.push({ m, kg: round1(kg), lost: round1(currentKg - kg) }); if (kg <= p.target) break; }
  return { age, heightCm: round1(heightCm), bmi: round1(bmi), bmiGoal: round1(bmiGoal), bmr: Math.round(bmr), tdee: Math.round(tdee), calories, protein, waterL, riceLunch, riceDinner, totalLoss, desiredWeeks, realisticWeeks, weeklyRate, unrealistic, exBurn, monthsPlan };
}

function buildSchedule(p) {
  const rows = []; const W = p.wake;
  rows.push([fmtTime(addMin(p.sleep, 0)) + ' (রাত)', '<b>ঘুম।</b> মোবাইল অন্তত ৩০ মিনিট আগে বন্ধ। লক্ষ্য ' + toBn(p.sleepHrs) + ' ঘণ্টা ঘুম — ঘুম কম হলে ক্ষুধা বাড়ে, ওজন কমে না।']);
  let r = [fmtTime(W), 'ঘুম থেকে ওঠা' + (p.prayer ? ' ও <b>ফজরের নামাজ</b>' : '') + '।'];
  rows.push(r);
  rows.push([fmtTime(addMin(W, 15)), '<b>১ গ্লাস (২৫০ মিলি) কুসুম গরম পানি</b> ধীরে ধীরে।' + (p.health.includes('gastric') ? ' খালি পেটে চা-কফি নয় — গ্যাস্ট্রিক বাড়বে।' : '')]);
  rows.push([fmtTime(addMin(W, 30)), 'হালকা হাঁটা ও স্ট্রেচিং ১০–১৫ মিনিট — শরীর জাগানোর জন্য, এটা মূল ব্যায়াম নয়।']);
  rows.push([fmtTime(addMin(W, 60)), '<b>সকালের নাস্তা</b> — নিচের বিকল্পগুলোর যেকোনো একটা। নাস্তা বাদ দেওয়া যাবে না।']);
  if (p.workStart && p.workEnd) {
    rows.push([fmtTime(p.workStart) + '–' + fmtTime(p.workEnd), '<b>ক্লাস/কাজ।</b> মাঝামাঝি সময়ে <b>ছোট খাবার</b> (ফল/বাদাম) আর বোতল থেকে অল্প অল্প পানি। একটানা খালি পেটে থাকা যাবে না। সাথে ৭৫০ মিলির পানির বোতল রাখুন।']);
    rows.push([fmtTime(addMin(p.workEnd, 15)), 'ফিরে ' + (p.prayer ? '<b>যোহরের নামাজ</b> ও ' : '') + 'একটু বিশ্রাম।']);
    rows.push([fmtTime(addMin(p.workEnd, 30)), '<b>দুপুরের খাবার</b> — নিচের পরিমাণমতো। খাওয়ার সঙ্গে বা ঠিক পরেই বেশি পানি নয়।']);
  } else {
    rows.push([fmtTime(addMin(W, 240)), '<b>সকালের ছোট খাবার</b> (ফল/বাদাম) — খালি পেটে বেশিক্ষণ নয়।']);
    rows.push([fmtTime(addMin(W, 390)), '<b>দুপুরের খাবার</b> — নিচের পরিমাণমতো।']);
  }
  rows.push(['বিকেল', 'বিশ্রাম ৩০–৪০ মিনিটের বেশি নয়। ' + (p.prayer ? '<b>আসরের নামাজ</b> সময়মতো।' : 'একটু হাঁটাহাঁটি করুন।')]);
  rows.push(['বিকেল/সন্ধ্যা', '<b>মূল ব্যায়াম ' + toBn(p.exMin) + ' মিনিট</b> — দুপুরের খাবারের অন্তত ২–৩ ঘণ্টা পর। তারপর প্রোটিনসমৃদ্ধ ছোট খাবার। ' + (p.prayer ? 'এরপর <b>মাগরিবের নামাজ</b>।' : '')]);
  rows.push(['সন্ধ্যা–রাত', '<b>পড়াশোনা/কাজ</b> — প্রতি ১ ঘণ্টা পর ৩–৫ মিনিট উঠে হাঁটা।']);
  rows.push([fmtTime(addMin(p.sleep, -150)), '<b>রাতের খাবার</b> — ঘুমের অন্তত ২ ঘণ্টা আগে। খেয়েই শুয়ে পড়া নয়। ' + (p.prayer ? 'এরপর <b>এশার নামাজ</b>।' : '')]);
  return rows;
}

function buildExercise(p) {
  const mins = p.exMin, warm = Math.max(3, Math.round(mins * 0.17)), cool = Math.max(3, Math.round(mins * 0.17)), main = mins - warm - cool;
  const light = p.health.includes('chestpain') || p.health.includes('jointpain') || p.health.includes('pressure');
  const joint = p.health.includes('jointpain');
  const strengthA = joint
    ? ['ওয়াল পুশ-আপ — ১০ বার', 'বসে পা সোজা করা — প্রতি পায়ে ১০ বার', 'গ্লুট ব্রিজ — ১২ বার', 'দাঁড়িয়ে গোড়ালি তোলা — ১২ বার (চেয়ার ধরে)']
    : ['চেয়ার স্কোয়াট — ১০ বার', 'ওয়াল পুশ-আপ — ১০ বার', 'গ্লুট ব্রিজ — ১২ বার', 'কাফ রেইজ — ১২ বার'];
  const strengthB = joint
    ? ['দাঁড়িয়ে ধীরে মার্চিং — প্রতি পায়ে ৮ বার', 'বার্ড-ডগ — প্রতি পাশে ৬ বার', 'ওয়াল সিট — ১৫–২০ সেকেন্ড', 'গ্লুট ব্রিজ — ১২ বার']
    : ['দাঁড়িয়ে হাঁটু তোলা (মার্চিং) — প্রতি পায়ে ১০ বার', 'বার্ড-ডগ — প্রতি পাশে ৮ বার', 'স্ট্যান্ডিং সাইড লেগ রেইজ — প্রতি পায়ে ১০ বার', 'গ্লুট ব্রিজ — ১২ বার'];
  const placeTxt = { home: 'বাসায়', hostel: 'হোস্টেলের রুম/করিডোরে', gym: 'জিমে (ট্রেইনারের নির্দেশনা মেনে)', outside: 'বাইরে/মাঠে' }[p.place];
  const days = [
    ['শনিবার', 'শক্তির ব্যায়াম — ক'], ['রবিবার', (light ? 'হালকা' : 'মাঝারি') + ' হাঁটা'], ['সোমবার', 'শক্তির ব্যায়াম — খ'],
    ['মঙ্গলবার', (light ? 'হালকা' : 'মাঝারি') + ' হাঁটা + স্ট্রেচিং'], ['বুধবার', 'শক্তির ব্যায়াম — ক'], ['বৃহস্পতিবার', (light ? 'হালকা' : 'মাঝারি') + ' হাঁটা'], ['শুক্রবার', 'সম্পূর্ণ বিশ্রাম', true]
  ];
  return { warm, cool, main, light, strengthA, strengthB, placeTxt, days };
}

function buildWarnings(p, plan) {
  const w = [];
  if (p.health.includes('chestpain')) w.push({ type: 'red', title: 'সবচেয়ে জরুরি — বুকে ব্যথা', text: 'ব্যায়ামে বুকে ব্যথা হয় বলে জানিয়েছেন। ভারী ব্যায়াম শুরুর আগে একবার ডাক্তার দেখিয়ে নেওয়া আবশ্যক। ততদিন শুধু হালকা ব্যায়াম চলবে। ব্যায়ামের সময় বুকে ব্যথা, চাপ, শ্বাসকষ্ট, মাথা ঘোরা বা বমি ভাব হলে সঙ্গে সঙ্গে থেমে বসে পড়ুন।' });
  if (p.health.includes('diabetes') || p.health.includes('pressure') || p.health.includes('thyroid') || p.health.includes('medicine')) w.push({ type: 'red', title: 'ডাক্তারের পরামর্শ আগে', text: 'আপনি স্বাস্থ্যগত অবস্থা/চলমান ওষুধের কথা জানিয়েছেন। এই রুটিন সাধারণ তথ্য মাত্র — ক্যালরি আরও কমানোর আগে ও ওষুধের বিষয়ে আপনার ডাক্তারের পরামর্শই চূড়ান্ত।' });
  if (plan.unrealistic) w.push({ type: 'gold', title: 'লক্ষ্যের সময়টা একটু বাড়ানো হয়েছে', text: 'আপনি ' + toBn(plan.desiredWeeks) + ' সপ্তাহে ' + toBn(plan.totalLoss) + ' কেজি কমাতে চেয়েছেন — নিরাপদ গতির (সপ্তাহে সর্বোচ্চ প্রায় ' + toBn(plan.weeklyRate) + ' কেজি) চেয়ে এটা দ্রুত। এই হারে গেলে প্রায় ' + toBn(plan.realisticWeeks) + ' সপ্তাহ লাগবে। এতে শরীর দুর্বল হবে না — এটাই ঠিক পথ।' });
  if (p.sleepHrs < 7) w.push({ type: 'gold', title: 'ঘুম কম হচ্ছে', text: 'এখন ঘুম ' + toBn(p.sleepHrs) + ' ঘণ্টা — অন্তত ৭ ঘণ্টা লক্ষ্য রাখুন। ঘুম কম হলে ক্ষুধার হরমোন বেড়ে ওজন কমা ধীর হয়ে যায়।' });
  return w;
}

/* ================= dashboard ================= */
const CHECKLIST = ['তিনবেলা নির্দিষ্ট পরিমাণে খেয়েছি, বেলা বাদ দিইনি', 'প্রতিবেলা প্রোটিন ছিল — ডিম / মাছ / মুরগি / ডাল / দই', 'ভাত পরিমাণের মধ্যে রেখেছি', 'মিষ্টি, ফাস্টফুড, কোল্ড ড্রিংকস খাইনি', 'পানি লক্ষ্যমতো, অল্প অল্প করে', 'ব্যায়াম করেছি (বিশ্রামের দিন ছাড়া)', 'বসে থাকার ফাঁকে উঠে হেঁটেছি', 'সময়মতো ঘুমিয়েছি, মোবাইল আগেই বন্ধ'];
function latestWeight() { const w = userData.weights; return w.length ? w[w.length - 1].kg : userData.profile.weight; }
function lastLogDate() { const w = userData.weights; return w.length ? w[w.length - 1].date : userData.createdAt; }
function weeklyDue() { return daysBetween(lastLogDate(), todayStr()) >= 7; }

async function weeklyCheck() {
  if (!userData || !userData.profile) return;
  if (weeklyDue() && userData.lastNotifFor !== lastLogDate()) {
    userData.lastNotifFor = lastLogDate();
    userData.notifications.push({ id: Date.now(), date: todayStr(), text: '১ সপ্তাহ হয়ে গেছে — আজ আপনার নতুন ওজন দিয়ে চেক-ইন করুন। ড্যাশবোর্ডে ওজন দিলেই অগ্রগতির চার্ট আপডেট হবে।', unread: true });
    await saveUserData();
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
    if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('AR Fit — সাপ্তাহিক চেক-ইন', { body: '১ সপ্তাহ হয়ে গেছে। আজ নতুন ওজন দিন।', icon: 'logo.svg' }); } catch (e) {} }
  }
  updateBell();
}
function updateBell() { if (!userData) return; const n = userData.notifications.filter(x => x.unread).length; const b = $('bellBadge'); b.hidden = n === 0; b.textContent = toBn(n); }
$('btnBell').addEventListener('click', async () => {
  const body = $('drawerBody');
  const items = [...userData.notifications].reverse();
  body.innerHTML = items.length ? items.map(n => '<div class="notif' + (n.unread ? ' unread' : '') + '">' + esc(n.text) + '<br><small>' + fmtDateBn(n.date) + '</small></div>').join('') : '<p>কোনো নোটিফিকেশন নেই।</p>';
  userData.notifications.forEach(n => n.unread = false); await saveUserData(); updateBell();
  $('drawer').hidden = false;
});
$('btnDrawerClose').addEventListener('click', () => $('drawer').hidden = true);
$('btnPdfTop').addEventListener('click', () => { if (userData && userData.profile) downloadPdf(); });

function renderDashboard() {
  const p = userData.profile, cur = latestWeight(), plan = buildPlan(p, cur), ex = buildExercise(p);
  const warns = buildWarnings(p, plan);
  const donePct = plan.totalLoss > 0 ? Math.max(0, Math.min(100, Math.round((p.weight - cur) / (p.weight - p.target) * 100))) : 100;
  const due = weeklyDue();
  const startBmi = buildPlan(p, p.weight).bmi;
  const habitAvoid = { rice: 'ভাতের পরিমাণ প্লেটের এক-চতুর্থাংশে নামিয়ে আনুন', sweet: 'মিষ্টি প্রতিদিন নয় — সপ্তাহে ১ দিন ছোট ১টা, পরিকল্পনা করে', fastfood: 'ফাস্টফুড (বার্গার, পিজ্জা, ফ্রাইড চিকেন) মাসে সর্বোচ্চ ১–২ বার', fried: 'ভাজাপোড়া (সিঙ্গারা, সমুচা, পুরি) বাদ — এগুলোই লুকিয়ে সবচেয়ে বেশি ক্যালরি দেয়', irregular: 'খাওয়া নিয়মিত করুন — কখনো খুব বেশি, কখনো খুব কম নয়; প্রতিদিন নির্দিষ্ট পরিমাণে, সময়মতো', colddrink: 'কোল্ড ড্রিংকস, প্যাকেট জুস, চিনি-দেওয়া চা সম্পূর্ণ বাদ' };
  const avoidList = (p.habits || []).map(h => habitAvoid[h]).filter(Boolean);
  const sched = buildSchedule(p);
  const today = todayStr(); const checks = (userData.checklist[today] || []);
  $('dashRoot').innerHTML = `
  <div class="card dash-head">
    <div class="avatar">${esc((currentUser.name || 'A').trim().charAt(0).toUpperCase())}</div>
    <div style="flex:1 1 260px">
      <h2 style="margin:0;font-size:22px;color:var(--teal-dark)">${esc(currentUser.name)} <span class="role-badge ${currentUser.role}">${currentUser.role === 'admin' ? 'অ্যাডমিন' : 'ব্যবহারকারী'}</span></h2>
      <p style="margin:2px 0 0;color:var(--muted)">${esc(currentUser.email)} • বয়স ${toBn(plan.age)} বছর • উচ্চতা ${toBn(p.heightFt)} ফুট ${toBn(p.heightIn)} ইঞ্চি</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn gold" id="btnPdf">⬇ রুটিন PDF ডাউনলোড</button>
      <button class="btn" id="btnEdit">তথ্য বদলান</button>
      ${currentUser.role === 'admin' ? '<button class="btn" id="btnAdmin">অ্যাডমিন প্যানেল</button>' : ''}
    </div>
  </div>

  ${due ? '<div class="alert alert-teal"><b class="t">সাপ্তাহিক চেক-ইনের সময় হয়েছে</b><p>শেষ ওজন দেওয়ার ' + toBn(daysBetween(lastLogDate(), today)) + ' দিন হয়ে গেছে। নিচের ফর্মে আজকের ওজন দিলেই আপনার অগ্রগতি লাইভ আপডেট হবে।</p></div>' : ''}
  ${warns.map(w => '<div class="alert alert-' + w.type + '"><b class="t">' + esc(w.title) + '</b><p>' + esc(w.text) + '</p></div>').join('')}

  <div class="stats">
    <div class="stat"><b>${toBn(cur)} কেজি</b><small>বর্তমান ওজন</small></div>
    <div class="stat rose"><b>${toBn(plan.bmi)}</b><small>বর্তমান BMI ${plan.bmi >= 25 ? '(বেশি)' : plan.bmi >= 18.5 ? '(স্বাভাবিক)' : '(কম)'}</small></div>
    <div class="stat gold"><b>${toBn(p.target)} কেজি</b><small>লক্ষ্য ওজন (BMI ${toBn(plan.bmiGoal)})</small></div>
    <div class="stat"><b>${toBn(Math.max(0, round1(cur - p.target)))} কেজি</b><small>আর কমাতে হবে</small></div>
    <div class="stat"><b>${toBn(plan.calories)} ক্যালরি</b><small>প্রতিদিনের খাবার</small></div>
    <div class="stat"><b>${toBn(plan.protein)} গ্রাম</b><small>প্রতিদিনের প্রোটিন</small></div>
  </div>

  <div class="card">
    <div class="sec-head"><div class="num">↗</div><div><h2>আপনার লাইভ অগ্রগতি</h2><p>শুরুতে BMI ছিল ${toBn(startBmi)} — ওজন যোগ করলেই চার্ট নিজে নিজে আপডেট হয়</p></div></div>
    <p style="margin:4px 0 0">মোট অগ্রগতি: <b>${toBn(donePct)}%</b> — শুরু ${toBn(p.weight)} কেজি → এখন ${toBn(cur)} কেজি → লক্ষ্য ${toBn(p.target)} কেজি</p>
    <div class="progress"><div style="width:${donePct}%"></div></div>
    <canvas class="chart" id="chart" width="860" height="230"></canvas>
    <form class="log-form" id="formLog" style="margin-top:12px">
      <label>নতুন ওজন (কেজি)<input type="number" id="logKg" step="0.1" min="25" max="250" required placeholder="${toBn(cur)}"></label>
      <label>তারিখ<input type="date" id="logDate" required value="${today}"></label>
      <button class="btn primary" type="submit">ওজন যোগ করুন</button>
    </form>
    <div id="logList" style="margin-top:10px">${[...userData.weights].reverse().slice(0, 6).map(w => '<span class="pill" style="margin:0 6px 6px 0">' + fmtDateBn(w.date) + ' — ' + toBn(w.kg) + ' কেজি' + (w.note ? ' (' + esc(w.note) + ')' : '') + '</span>').join('')}</div>
  </div>

  <div class="card">
    <div class="sec-head"><div class="num">১</div><div><h2>পুষ্টির হিসাব ও প্লেটের নিয়ম</h2><p>দুর্বল না হয়ে চর্বি কমানোর ভিত্তি</p></div></div>
    <table><tbody>
      <tr><td style="width:130px"><span class="pill">ক্যালরি</span></td><td>প্রতিদিন প্রায় <b>${toBn(plan.calories)} ক্যালরি</b> (আপনার BMR ${toBn(plan.bmr)}, দৈনিক খরচ প্রায় ${toBn(plan.tdee)})। ${p.gender === 'male' ? '১,৫০০' : '১,২০০'}-এর নিচে কখনোই নয়।</td></tr>
      <tr><td><span class="pill">প্রোটিন</span></td><td>প্রতিদিন <b>${toBn(plan.protein)} গ্রাম</b> — প্রতিটা বড় খাবারে ডিম, মাছ, মুরগি, ডাল, ছোলা বা দই রাখুন।</td></tr>
      <tr><td><span class="pill">তেল</span></td><td>সারাদিনে মোট <b>৩–৪ চা চামচ</b> তেলের রান্না। ভাজাপোড়া বাদ।</td></tr>
      <tr><td><span class="pill">গতি</span></td><td>সপ্তাহে প্রায় <b>${toBn(plan.weeklyRate)} কেজি</b> হারে কমা নিরাপদ — আনুমানিক <b>${toBn(plan.realisticWeeks)} সপ্তাহে</b> লক্ষ্যে পৌঁছানো যাবে।</td></tr>
    </tbody></table>
    <div class="plate"><div class="veg">সবজি ও সালাদ — অর্ধেক প্লেট</div><div class="pro">মাছ / মুরগি / ডাল — ১ ভাগ</div><div class="rice">ভাত — মাত্র ১ ভাগ</div></div>
    <p class="caption">প্রতিবেলা প্লেট এভাবে সাজান — ভাত কম, সবজি বেশি।</p>
  </div>

  <div class="card">
    <div class="sec-head"><div class="num">২</div><div><h2>দিনের সম্পূর্ণ সময়সূচি</h2><p>আপনার ওঠা, কাজ ও ঘুমের সময় অনুযায়ী সাজানো</p></div></div>
    <table><tbody>${sched.map(r => '<tr><td style="width:128px"><span class="pill">' + r[0] + '</span></td><td>' + r[1] + '</td></tr>').join('')}</tbody></table>
  </div>

  <div class="card">
    <div class="sec-head"><div class="num">৩</div><div><h2>খাবারের তালিকা — কী, কতটুকু</h2><p>আপনার ক্যালরি অনুযায়ী হিসাব করা</p></div></div>
    <h3>সকালের নাস্তা — প্রায় ${toBn(Math.round(plan.calories * 0.25))} ক্যালরি (যেকোনো একটা)</h3>
    <div class="meals">
      <div class="meal"><span class="badge2">ক</span><b class="head">ডিম-রুটি</b><br>সেদ্ধ ডিম ২টা + আটার রুটি ১টা + রান্না সবজি ১ কাপ</div>
      <div class="meal"><span class="badge2">খ</span><b class="head">ওটস</b><br>ওটস ৪ টেবিল চামচ + দুধ ১৫০ মিলি + ছোট কলা অর্ধেকটা + বাদাম ৫টা</div>
      <div class="meal"><span class="badge2">গ</span><b class="head">ছোলা</b><br>ছোলা সেদ্ধ ১ কাপ + শসা-টমেটো সালাদ + সেদ্ধ ডিম ১টা</div>
      <div class="meal"><span class="badge2">ঘ</span><b class="head">দই-রুটি</b><br>টক দই ১৫০ গ্রাম + রুটি ১টা + সেদ্ধ ডিম ১টা + ফল ১টা</div>
    </div>
    <h3>মাঝের ছোট খাবার — প্রায় ${toBn(Math.round(plan.calories * 0.08))} ক্যালরি</h3>
    <p>ফল ১টা (পেয়ারা / আপেল / কমলা / মাল্টা / পেঁপে ১ কাপ) অথবা বাদাম ১০টা। চা খেলে চিনি ছাড়া।</p>
    <h3>দুপুরের খাবার — প্রায় ${toBn(Math.round(plan.calories * 0.35))} ক্যালরি</h3>
    <table><tbody>
      <tr><td style="width:170px"><b>ভাত (রান্না করা)</b></td><td><b>প্রায় ${toBn(plan.riceLunch)} গ্রাম</b> — এর বেশি নয়</td></tr>
      <tr><td><b>মাছ অথবা মুরগি</b></td><td>মাছ ১ বড় টুকরো (১০০–১২০ গ্রাম) অথবা চামড়া ছাড়া মুরগি ১০০ গ্রাম</td></tr>
      <tr><td><b>ডাল</b></td><td>১ কাপ, পাতলা করে রান্না</td></tr>
      <tr><td><b>সবজি ও সালাদ</b></td><td>সবজি ১.৫ কাপ + সালাদ ১ কাপ (শসা, টমেটো, গাজর, লেবু)</td></tr>
    </tbody></table>
    <h3>ব্যায়ামের পরের ছোট খাবার — প্রায় ${toBn(Math.round(plan.calories * 0.1))} ক্যালরি</h3>
    <p>দুধ ১৫০ মিলি (চিনি ছাড়া) / টক দই ১০০ গ্রাম / সেদ্ধ ডিম ১টা + অর্ধেক ফল / ছোলা সেদ্ধ আধা কাপ।</p>
    <h3>রাতের খাবার — প্রায় ${toBn(Math.round(plan.calories * 0.22))} ক্যালরি</h3>
    <p>ভাত প্রায় <b>${toBn(plan.riceDinner)} গ্রাম</b> অথবা আটার রুটি ২টা + মাছ/মুরগি/ডিম/সয়াবিন ৮০–১০০ গ্রাম + সবজি ১.৫ কাপ + ডাল আধা–১ কাপ। রাতে তেল-মসলা ও ঝাল সবচেয়ে কম।</p>
    <div class="two">
      <div><h3>যেসব মাছ-সবজি বেছে নেবেন</h3><ul>
        <li>মাছ: রুই, কাতলা, মৃগেল, তেলাপিয়া, কই, শিং, পাবদা — ঝোল করে; ইলিশ ছোট ১ টুকরো</li>
        <li>সবজি: লাউ, ঝিঙে, পটোল, করলা, বরবটি, শিম, ফুলকপি, বাঁধাকপি, গাজর, পালং শাক, লাল শাক</li>
        <li>ফল: পেয়ারা, আপেল, কমলা, মাল্টা, পেঁপে, ছোট কলা ১টা</li></ul></div>
      <div><h3>আপনার অভ্যাস অনুযায়ী যা বাদ/কমাবেন</h3><ul>
        ${avoidList.length ? avoidList.map(a => '<li>' + esc(a) + '</li>').join('') : '<li>অতিরিক্ত তেল, চিনি ও ভাজাপোড়া কম রাখুন</li>'}
        <li>কোল্ড ড্রিংকস ও প্যাকেট জুসে লুকানো চিনি সবচেয়ে বেশি — যতটা সম্ভব বাদ</li></ul></div>
    </div>
  </div>

  <div class="card">
    <div class="sec-head"><div class="num">৪</div><div><h2>পানি — কখন, কতটুকু</h2><p>আপনার ওজন অনুযায়ী প্রতিদিন প্রায় ${toBn(plan.waterL)} লিটার</p></div></div>
    <table><tbody>
      <tr><td style="width:250px"><b>ঘুম থেকে উঠে</b></td><td>২৫০ মিলি</td></tr>
      <tr><td><b>নাস্তার ৩০ মিনিট পর</b></td><td>২০০ মিলি</td></tr>
      <tr><td><b>কাজের সময় বোতল থেকে ধীরে ধীরে</b></td><td>${toBn(Math.round(plan.waterL * 320))} মিলি</td></tr>
      <tr><td><b>দুপুরের খাবারের ৩০ মিনিট পর</b></td><td>২৫০ মিলি</td></tr>
      <tr><td><b>বিকেলে</b></td><td>২০০ মিলি</td></tr>
      <tr><td><b>ব্যায়ামের আগে / পরে</b></td><td>১৫০ মিলি / ২৫০ মিলি</td></tr>
      <tr><td><b>রাতের খাবারের ৩০ মিনিট পর</b></td><td>২০০ মিলি</td></tr>
    </tbody></table>
    <ul><li>খাবারের ৩০ মিনিট আগে থেকে ৩০ মিনিট পর পর্যন্ত বেশি পানি নয় — এক-দুই চুমুক চলবে${p.health.includes('gastric') ? ' (গ্যাস্ট্রিক থাকলে এটা বিশেষ জরুরি)' : ''}।</li><li>এখন আপনি ${toBn(p.waterNow)} লিটার খান — জোর করে নয়, তৃষ্ণা অনুযায়ী লক্ষ্যের কাছাকাছি রাখুন। প্রস্রাবের রং হালকা হলুদ থাকলেই ঠিক আছে।</li></ul>
  </div>

  <div class="card">
    <div class="sec-head"><div class="num">৫</div><div><h2>ব্যায়াম — ${esc(ex.placeTxt)}, প্রতিদিন ${toBn(p.exMin)} মিনিট</h2><p>ওয়ার্ম-আপ ${toBn(ex.warm)} মিনিট + মূল ব্যায়াম ${toBn(ex.main)} মিনিট + কুল-ডাউন ${toBn(ex.cool)} মিনিট${ex.light ? ' • আপনার স্বাস্থ্যের কারণে হালকা মাত্রায় সাজানো' : ''}</p></div></div>
    <div class="days">${ex.days.map(d => '<div class="day' + (d[2] ? ' rest' : '') + '"><b>' + d[0] + '</b>' + d[1] + '</div>').join('')}</div>
    <div class="two">
      <div><h3>শক্তির ব্যায়াম — ক (প্রতিটা ৩ সেট, মাঝে ৩০–৪৫ সেকেন্ড বিশ্রাম)</h3><ul>${ex.strengthA.map(s => '<li>' + s + '</li>').join('')}</ul></div>
      <div><h3>শক্তির ব্যায়াম — খ (প্রতিটা ২–৩ সেট)</h3><ul>${ex.strengthB.map(s => '<li>' + s + '</li>').join('')}</ul></div>
    </div>
    <ul>
      <li>কষ্টের মাত্রা ১০-এর মধ্যে ৬–৭ — ব্যায়ামের সময় কথা বলা যায়, এমন গতিতে। প্রতি সপ্তাহে প্রতিটা ব্যায়ামে ২ বার করে বাড়ান।</li>
      <li><b>থামার সংকেত:</b> বুকে ব্যথা বা চাপ, শ্বাসকষ্ট, মাথা ঘোরা, বমি ভাব — যেকোনো একটা হলেই সেদিন ব্যায়াম বন্ধ।</li>
      ${p.health.includes('jointpain') ? '<li>হাঁটু/কোমরে ব্যথা থাকায় লাফ ও দৌড় বাদ — সব ব্যায়াম ধীরে, ব্যথা বাড়লে থামুন।</li>' : ''}
    </ul>
  </div>

  ${p.health.includes('gastric') ? `<div class="card"><div class="sec-head"><div class="num">৬</div><div><h2>গ্যাস্ট্রিকের জন্য আলাদা নিয়ম</h2><p>ওজন কমাতে গিয়ে গ্যাস্ট্রিক যেন না বাড়ে</p></div></div>
    <ul><li>কোনো বেলার খাবার বাদ নয়; ৩–৪ ঘণ্টার বেশি খালি পেটে থাকা নয়।</li>
    <li>খালি পেটে চা-কফি, ঝাল ও টক নয়। রাতে ঝাল-মসলা সবচেয়ে কম।</li>
    <li>ধীরে, ভালো করে চিবিয়ে খান। খাওয়ার পর অন্তত ২ ঘণ্টা শুয়ে পড়া নয়।</li>
    <li>গ্যাস্ট্রিকের ব্যথা আর বুকের ব্যথা নিজে আলাদা করার চেষ্টা না করে নতুন বুকে ব্যথায় ডাক্তার দেখান।</li></ul></div>` : ''}

  <div class="card">
    <div class="sec-head"><div class="num">৭</div><div><h2>মাসভিত্তিক লক্ষ্য ও আজকের চেকলিস্ট</h2><p>বাস্তব গতি — দুর্বল না হয়ে</p></div></div>
    <table><thead><tr><th>সময়</th><th>লক্ষ্য ওজন</th><th>মোট কমবে</th></tr></thead><tbody>
      <tr><td>শুরু — ${fmtDateBn(userData.weights[0] ? userData.weights[0].date : today)}</td><td>${toBn(p.weight)} কেজি</td><td>—</td></tr>
      ${plan.monthsPlan.map(m => '<tr><td>' + toBn(m.m) + ' মাস শেষে</td><td>' + toBn(m.kg) + ' কেজি</td><td>' + toBn(m.lost) + ' কেজি</td></tr>').join('')}
    </tbody></table>
    <ul><li><b>ওজন মাপুন</b> প্রতি সপ্তাহে ১ বার, সকালে বাথরুমের পর, নাস্তার আগে — তারপর এখানে যোগ করুন। প্রতিদিন মাপলে স্বাভাবিক ওঠানামায় মন খারাপ হবে।</li>
    <li><b>ডাক্তার দেখাতে হবে যদি:</b> মাথা ঘোরা, অতিরিক্ত দুর্বলতা, খুব বেশি চুল পড়া${p.gender === 'female' ? ', মাসিক অনিয়ম' : ''} বা বারবার বুকে ব্যথা হয়।</li></ul>
    <h3>আজকের চেকলিস্ট — ${fmtDateBn(today)}</h3>
    <div class="checks2">${CHECKLIST.map((c, i) => '<label class="check-item' + (checks[i] ? ' done' : '') + '"><input type="checkbox" data-check="' + i + '"' + (checks[i] ? ' checked' : '') + '> ' + c + '</label>').join('')}</div>
  </div>`;

  document.querySelectorAll('[data-check]').forEach(cb => cb.addEventListener('change', async () => {
    const i = +cb.dataset.check; const t = todayStr();
    if (!userData.checklist[t]) userData.checklist[t] = [];
    userData.checklist[t][i] = cb.checked; cb.closest('.check-item').classList.toggle('done', cb.checked);
    await saveUserData();
  }));
  $('formLog').addEventListener('submit', async e => {
    e.preventDefault();
    const kg = +$('logKg').value, date = $('logDate').value || todayStr();
    userData.weights = userData.weights.filter(w => w.date !== date || w.note === 'শুরু');
    userData.weights.push({ date, kg, note: '' }); userData.weights.sort((a, b) => a.date < b.date ? -1 : 1);
    userData.notifications.push({ id: Date.now(), date: todayStr(), text: 'নতুন ওজন যোগ হয়েছে: ' + toBn(kg) + ' কেজি (' + fmtDateBn(date) + ')। অগ্রগতির চার্ট আপডেট হয়েছে।', unread: true });
    await saveUserData(); await weeklyCheck(); renderDashboard();
  });
  $('btnPdf').addEventListener('click', downloadPdf);
  $('btnEdit').addEventListener('click', () => { fillProfileForm(userData.profile); showView('viewProfile'); });
  const ba = $('btnAdmin'); if (ba) ba.addEventListener('click', renderAdmin);
  showView('viewDash');
  requestAnimationFrame(drawChart);
}

function drawChart() {
  const cv = $('chart'); if (!cv) return; const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, padL = 46, padR = 14, padT = 16, padB = 30;
  const pts = userData.weights; const target = userData.profile.target;
  const kgs = pts.map(w => w.kg).concat([target]);
  let min = Math.floor(Math.min(...kgs) - 1), max = Math.ceil(Math.max(...kgs) + 1); if (max - min < 4) { max += 2; min -= 2; }
  const X = i => padL + (pts.length <= 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (pts.length - 1));
  const Y = kg => padT + (max - kg) * (H - padT - padB) / (max - min);
  ctx.clearRect(0, 0, W, H); ctx.font = '12px "Hind Siliguri", sans-serif'; ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#e2ecea';
  for (let kg = min; kg <= max; kg += Math.max(1, Math.round((max - min) / 5))) { ctx.beginPath(); ctx.moveTo(padL, Y(kg)); ctx.lineTo(W - padR, Y(kg)); ctx.stroke(); ctx.fillText(toBn(kg), 12, Y(kg) + 4); }
  ctx.strokeStyle = '#c9a227'; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(padL, Y(target)); ctx.lineTo(W - padR, Y(target)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#8a6d14'; ctx.fillText('লক্ষ্য ' + toBn(target) + ' কেজি', W - padR - 92, Y(target) - 7);
  if (pts.length) { ctx.strokeStyle = '#0e7569'; ctx.lineWidth = 2.5; ctx.beginPath(); pts.forEach((w, i) => i ? ctx.lineTo(X(i), Y(w.kg)) : ctx.moveTo(X(i), Y(w.kg))); ctx.stroke(); ctx.lineWidth = 1;
    pts.forEach((w, i) => { ctx.fillStyle = '#0e7569'; ctx.beginPath(); ctx.arc(X(i), Y(w.kg), 4.5, 0, 7); ctx.fill(); ctx.fillStyle = '#1c2b3a'; ctx.fillText(toBn(w.kg), X(i) - 10, Y(w.kg) - 10); ctx.fillStyle = '#64748b'; ctx.fillText(w.date.slice(5), X(i) - 14, H - 10); }); }
}

/* ================= admin ================= */
async function renderAdmin() {
  const accs = await idbAll('accounts');
  const rows = [];
  for (const a of accs) { const d = await idbGet('userdata', a.email); rows.push('<tr><td>' + esc(a.name) + '</td><td>' + esc(a.email) + '</td><td>' + (a.role === 'admin' ? 'অ্যাডমিন' : 'ব্যবহারকারী') + '</td><td>' + fmtDateBn(a.createdAt) + '</td><td>' + (d && d.profile ? 'আছে (' + toBn(d.weights.length) + 'টি ওজন লগ)' : 'নেই') + '</td></tr>'); }
  $('adminRoot').innerHTML = '<p>মোট অ্যাকাউন্ট: <b>' + toBn(accs.length) + 'টি</b> (এই ডিভাইসের ডেটাবেসে)</p><table class="admin-table"><thead><tr><th>নাম</th><th>ইমেইল</th><th>রোল</th><th>যোগ দিয়েছেন</th><th>ড্যাশবোর্ড</th></tr></thead><tbody>' + rows.join('') + '</tbody></table><button class="btn" onclick="renderDashboard()">← ড্যাশবোর্ডে ফিরুন</button>';
  showView('viewAdmin');
}

/* ================= PDF download ================= */
function downloadPdf() {
  const p = userData.profile, cur = latestWeight(), plan = buildPlan(p, cur), ex = buildExercise(p), warns = buildWarnings(p, plan);
  const sched = buildSchedule(p);
  $('printArea').innerHTML = `
    <div class="p-hero"><img src="logo.svg" alt="AR Fit"><div><h1>ওজন কমানোর সম্পূর্ণ রুটিন</h1><p>${esc(currentUser.name)} • বয়স ${toBn(plan.age)} বছর • ${fmtDateBn(todayStr())}</p></div></div>
    <div class="p-stats">
      <div class="p-stat"><b>${toBn(cur)} কেজি</b>বর্তমান ওজন</div>
      <div class="p-stat"><b>${toBn(p.heightFt)}′ ${toBn(p.heightIn)}″</b>উচ্চতা</div>
      <div class="p-stat"><b>${toBn(plan.bmi)}</b>বর্তমান BMI</div>
      <div class="p-stat"><b>${toBn(p.target)} কেজি</b>লক্ষ্য ওজন</div>
      <div class="p-stat"><b>${toBn(plan.calories)}</b>দৈনিক ক্যালরি</div>
    </div>
    ${warns.map(w => '<div class="p-warn"><b>' + esc(w.title) + ':</b> ' + esc(w.text) + '</div>').join('')}
    <h2>দিনের সময়সূচি</h2>
    <table><tbody>${sched.map(r => '<tr><td style="width:120px"><b>' + r[0] + '</b></td><td>' + r[1] + '</td></tr>').join('')}</tbody></table>
    <h2>খাবার — নাম ও পরিমাণ</h2>
    <table><tbody>
      <tr><td style="width:150px"><b>সকালের নাস্তা</b></td><td>সেদ্ধ ডিম ২টা + রুটি ১টা + সবজি ১ কাপ / ওটস ৪ টেবিল চামচ + দুধ ১৫০ মিলি / ছোলা ১ কাপ + ডিম ১টা / দই ১৫০ গ্রাম + রুটি ১টা — যেকোনো একটা (প্রায় ${toBn(Math.round(plan.calories * 0.25))} ক্যালরি)</td></tr>
      <tr><td><b>মাঝের ছোট খাবার</b></td><td>ফল ১টা অথবা বাদাম ১০টা (প্রায় ${toBn(Math.round(plan.calories * 0.08))} ক্যালরি)</td></tr>
      <tr><td><b>দুপুরের খাবার</b></td><td>ভাত প্রায় ${toBn(plan.riceLunch)} গ্রাম + মাছ ১ টুকরো (১০০–১২০ গ্রাম) অথবা মুরগি ১০০ গ্রাম + ডাল ১ কাপ + সবজি ১.৫ কাপ + সালাদ ১ কাপ (প্রায় ${toBn(Math.round(plan.calories * 0.35))} ক্যালরি)</td></tr>
      <tr><td><b>ব্যায়ামের পর</b></td><td>দুধ ১৫০ মিলি / দই ১০০ গ্রাম / ডিম ১টা + অর্ধেক ফল / ছোলা আধা কাপ</td></tr>
      <tr><td><b>রাতের খাবার</b></td><td>ভাত প্রায় ${toBn(plan.riceDinner)} গ্রাম অথবা রুটি ২টা + মাছ/মুরগি/ডিম/সয়াবিন ৮০–১০০ গ্রাম + সবজি ১.৫ কাপ + ডাল আধা–১ কাপ (প্রায় ${toBn(Math.round(plan.calories * 0.22))} ক্যালরি)</td></tr>
      <tr><td><b>প্রোটিন ও তেল</b></td><td>প্রোটিন প্রতিদিন ${toBn(plan.protein)} গ্রাম; তেল সারাদিনে ৩–৪ চা চামচ। মাছ: রুই, কাতলা, তেলাপিয়া, কই, শিং। সবজি: লাউ, ঝিঙে, করলা, বরবটি, ফুলকপি, পালং শাক।</td></tr>
    </tbody></table>
    <h2>পানি — প্রতিদিন প্রায় ${toBn(plan.waterL)} লিটার</h2>
    <p>ঘুম থেকে উঠে ২৫০ মিলি; নাস্তার ৩০ মিনিট পর ২০০ মিলি; কাজের সময় বোতল থেকে ধীরে ধীরে; দুপুরের খাবারের ৩০ মিনিট পর ২৫০ মিলি; বিকেলে ২০০ মিলি; ব্যায়ামের আগে ১৫০ ও পরে ২৫০ মিলি; রাতের খাবারের ৩০ মিনিট পর ২০০ মিলি। খাবারের ৩০ মিনিট আগে-পরে বেশি পানি নয়।</p>
    <h2>ব্যায়াম — ${esc(ex.placeTxt)}, প্রতিদিন ${toBn(p.exMin)} মিনিট</h2>
    <p>ওয়ার্ম-আপ ${toBn(ex.warm)} মিনিট + মূল ব্যায়াম ${toBn(ex.main)} মিনিট + কুল-ডাউন ${toBn(ex.cool)} মিনিট।</p>
    <table><tbody>${ex.days.map(d => '<tr><td style="width:110px"><b>' + d[0] + '</b></td><td>' + d[1] + '</td></tr>').join('')}
      <tr><td><b>শক্তি — ক</b></td><td>${ex.strengthA.join(' • ')}</td></tr>
      <tr><td><b>শক্তি — খ</b></td><td>${ex.strengthB.join(' • ')}</td></tr></tbody></table>
    <h2>মাসভিত্তিক লক্ষ্য</h2>
    <table><thead><tr><th>সময়</th><th>লক্ষ্য ওজন</th><th>মোট কমবে</th></tr></thead><tbody>
      ${plan.monthsPlan.map(m => '<tr><td>' + toBn(m.m) + ' মাস শেষে</td><td>' + toBn(m.kg) + ' কেজি</td><td>' + toBn(m.lost) + ' কেজি</td></tr>').join('')}
    </tbody></table>
    <p>ওজন মাপুন প্রতি সপ্তাহে ১ বার — সকালে, বাথরুমের পর, নাস্তার আগে। বুকে ব্যথা, শ্বাসকষ্ট বা মাথা ঘোরা হলে ব্যায়াম বন্ধ করে ডাক্তার দেখান। এই রুটিন সাধারণ স্বাস্থ্য-তথ্য; ডাক্তারের পরামর্শের বিকল্প নয়।</p>
    <p style="text-align:center;color:#8a97a5">© AR Fit — by AR • এই ডকুমেন্ট AR Fit থেকে তৈরি; লোগো ও কনটেন্ট AR-এর সম্পত্তি।</p>`;
  setTimeout(() => window.print(), 60);
}

/* ================= init ================= */
(async function init() {
  const saved = sessionStorage.getItem('arfit_user');
  if (saved) { const acc = await idbGet('accounts', saved); if (acc) { currentUser = acc; await loadUserData(saved); if (userData.profile) { await weeklyCheck(); renderDashboard(); } else { showView('viewProfile'); } updateBell(); return; } }
  showView('viewAuth');
})();
