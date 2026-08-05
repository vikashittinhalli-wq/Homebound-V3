'use strict';

const STORAGE_KEY = 'homebound_journey_v1';
const SCHEMA_VERSION = 5;
const LEGACY_KEY = 'freedomCountdownData';
const PAYMENT_LEDGER_KEY = 'homebound_payment_ledger_v1';

const LEGACY_ORIGINAL = {
  consumerDebt: 35985.64,
  car: 35221.00,
  savingsGoal: 5000
};

const LEGACY_RATES = {
  cc1: 9.99,
  cc2: 13.99,
  zipPlus: 13.7,
  zipMoney: 0,
  car: 13.0
};

const LEGACY_DEFAULTS = {
  fund: 0,
  cc1: 9209.08,
  cc2: 18803,
  zipPlus: 3846,
  zipMoney: 2509,
  car: 27617.56,
  updatedAt: null,
  history: []
};

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseCurrency(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function syncLegacyBalance(milestone) {
  const keyMap = {
    'zip-money': 'zipMoney',
    'zip-plus': 'zipPlus',
    'cc1': 'cc1',
    'cc2': 'cc2',
    'car': 'car'
  };
  try {
    const legacy = readLegacyData();
    if (milestone.kind === 'savings' && milestone.id === 'fund') {
      legacy.fund = Math.max(0, safeNumber(milestone.starting) - safeNumber(milestone.balance));
    } else if (keyMap[milestone.id]) {
      legacy[keyMap[milestone.id]] = safeNumber(milestone.balance);
    }
    legacy.updatedAt = milestone.updatedAt || new Date().toISOString();
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
  } catch (error) {
    console.warn('Could not sync legacy balance', error);
  }
}


function readPaymentLedger() {
  try {
    const value = JSON.parse(localStorage.getItem(PAYMENT_LEDGER_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writePaymentLedger(ledger) {
  const payload = JSON.stringify(ledger);
  localStorage.setItem(PAYMENT_LEDGER_KEY, payload);
  return localStorage.getItem(PAYMENT_LEDGER_KEY) === payload;
}

function mergeLedgerIntoState(candidate) {
  const ledger = readPaymentLedger();
  if (!candidate || !Array.isArray(candidate.milestones)) return candidate;
  candidate.milestones.forEach(m => {
    const entries = Array.isArray(ledger[m.id]) ? ledger[m.id] : [];
    const existingIds = new Set((Array.isArray(m.payments) ? m.payments : []).map(x => x.id).filter(Boolean));
    if (!Array.isArray(m.payments)) m.payments = [];
    entries.forEach(entry => {
      if (!entry.id || !existingIds.has(entry.id)) m.payments.push(entry);
    });
    if (entries.length) {
      const latest = entries[entries.length - 1];
      if (Number.isFinite(Number(latest.balanceAfter))) m.balance = Number(latest.balanceAfter);
      if (latest.date) m.updatedAt = latest.date + 'T12:00:00.000Z';
    }
  });
  return candidate;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readLegacyData() {
  try {
    return { ...LEGACY_DEFAULTS, ...JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}') };
  } catch {
    return { ...LEGACY_DEFAULTS };
  }
}

function buildMilestonesFromLegacy(legacy) {
  const consumerCurrent = safeNumber(legacy.cc1) + safeNumber(legacy.cc2) + safeNumber(legacy.zipPlus) + safeNumber(legacy.zipMoney);
  const previouslyCleared = Math.max(0, LEGACY_ORIGINAL.consumerDebt - consumerCurrent);
  const fund = Math.max(0, safeNumber(legacy.fund));

  return [
    {
      id: 'zip-money',
      icon: '📍',
      publicName: 'Scenic Lookout',
      accountName: 'Zip Money',
      kind: 'debt',
      starting: safeNumber(legacy.zipMoney) + previouslyCleared,
      balance: safeNumber(legacy.zipMoney),
      interest: LEGACY_RATES.zipMoney,
      minPayment: 40,
      extraPayment: 0,
      frequency: 'week',
      due: '2027-01-14',
      why: 'Clearing this first stop creates momentum for every milestone that follows.',
      updatedAt: legacy.updatedAt || null,
      payments: []
    },
    {
      id: 'zip-plus',
      icon: '🌳',
      publicName: 'Forest Bend',
      accountName: 'Zip Plus',
      kind: 'debt',
      starting: safeNumber(legacy.zipPlus),
      balance: safeNumber(legacy.zipPlus),
      interest: LEGACY_RATES.zipPlus,
      minPayment: 300,
      extraPayment: 0,
      frequency: 'month',
      due: '2027-05-31',
      why: 'Moving through Forest Bend brings you closer to becoming completely Zip-free.',
      updatedAt: legacy.updatedAt || null,
      payments: []
    },
    {
      id: 'cc1',
      icon: '🌉',
      publicName: 'River Crossing',
      accountName: 'Credit Card 1',
      kind: 'debt',
      starting: safeNumber(legacy.cc1),
      balance: safeNumber(legacy.cc1),
      interest: LEGACY_RATES.cc1,
      minPayment: 459.95,
      extraPayment: 0,
      frequency: 'month',
      due: '2028-03-31',
      why: 'Crossing this bridge reduces interest and frees more of your monthly income.',
      updatedAt: legacy.updatedAt || null,
      payments: []
    },
    {
      id: 'cc2',
      icon: '⛰️',
      publicName: 'Mountain Pass',
      accountName: 'Credit Card 2',
      kind: 'debt',
      starting: safeNumber(legacy.cc2),
      balance: safeNumber(legacy.cc2),
      interest: LEGACY_RATES.cc2,
      minPayment: 686,
      extraPayment: 0,
      frequency: 'month',
      due: '2028-12-31',
      why: 'This is the biggest climb, and completing it removes the largest consumer balance.',
      updatedAt: legacy.updatedAt || null,
      payments: []
    },
    {
      id: 'car',
      icon: '🚗',
      publicName: 'Sunrise Point',
      accountName: 'Mahindra XUV700 loan',
      kind: 'debt',
      starting: LEGACY_ORIGINAL.car,
      balance: safeNumber(legacy.car),
      interest: LEGACY_RATES.car,
      minPayment: 151.17,
      extraPayment: 0,
      frequency: 'week',
      due: '',
      why: 'Each payment means more freedom and one step closer to owning your Mahindra outright.',
      updatedAt: legacy.updatedAt || null,
      payments: []
    },
    {
      id: 'fund',
      icon: '🏡',
      publicName: 'Home Path',
      accountName: 'Freedom Fund',
      kind: 'savings',
      starting: LEGACY_ORIGINAL.savingsGoal,
      balance: Math.max(0, LEGACY_ORIGINAL.savingsGoal - fund),
      saved: fund,
      interest: 0,
      minPayment: 0,
      extraPayment: 0,
      frequency: 'month',
      due: '2026-12-30',
      why: 'This fund protects your plans and gives every future decision more breathing room.',
      updatedAt: legacy.updatedAt || null,
      payments: []
    }
  ];
}

const defaults = {
  schemaVersion: SCHEMA_VERSION,
  recoveryDismissed: false,
  lastBackup: null,
  garden: {
    reflection: '',
    reflectionDate: null,
    relationshipMoments: 0,
    personalGrowthNotes: 0
  },
  today: {
    entries: []
  },
  milestones: buildMilestonesFromLegacy(LEGACY_DEFAULTS)
};

function looksLikePlaceholderState(candidate) {
  if (!candidate || !Array.isArray(candidate.milestones)) return false;
  const ids = candidate.milestones.map(m => m.id).sort().join('|');
  return ids === ['car-loan', 'emergency', 'home-deposit', 'trip'].sort().join('|');
}

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored || looksLikePlaceholderState(stored)) {
      const migrated = {
        ...clone(defaults),
        milestones: buildMilestonesFromLegacy(readLegacyData())
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return mergeLedgerIntoState(migrated);
    }
    const upgraded = {
      ...clone(defaults),
      ...stored,
      schemaVersion: SCHEMA_VERSION,
      garden: { ...clone(defaults.garden), ...(stored.garden || {}) },
      today: { ...clone(defaults.today), ...(stored.today || {}), entries: Array.isArray(stored.today?.entries) ? stored.today.entries : [] },
      milestones: Array.isArray(stored.milestones) ? stored.milestones : clone(defaults.milestones)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded));
    return mergeLedgerIntoState(upgraded);
  } catch {
    return clone(defaults);
  }
}

let state = load();
let activeTab = 'home';
let selectedMilestone = null;
let activeSheetTab = 'overview';

function save() {
  state.schemaVersion = SCHEMA_VERSION;
  const payload = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, payload);
  return localStorage.getItem(STORAGE_KEY) === payload;
}

const money = n => new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0
}).format(safeNumber(n));

const money2 = n => new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(safeNumber(n));

function pct(m) {
  return Math.max(0, Math.min(100, ((safeNumber(m.starting) - safeNumber(m.balance)) / safeNumber(m.starting)) * 100 || 0));
}

function debtMilestones() {
  return state.milestones.filter(m => m.kind !== 'savings');
}

function totals() {
  const debts = debtMilestones();
  const starting = debts.reduce((sum, m) => sum + safeNumber(m.starting), 0);
  const left = debts.reduce((sum, m) => sum + safeNumber(m.balance), 0);
  return {
    starting,
    left,
    cleared: Math.max(0, starting - left),
    percent: starting ? ((starting - left) / starting) * 100 : 0
  };
}

function greeting() {
  const now = new Date();
  const hour = now.getHours();
  const greetingText = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const skyIcon = hour < 11 ? '🌅' : hour < 17 ? '☀️' : hour < 20 ? '🌇' : '🌙';
  document.getElementById('greetingTitle').textContent = `${greetingText} ${skyIcon}`;
  document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(now);

}

function render() {
  const t = totals();
  const clearedNode = document.getElementById('clearedTogether');
  if (clearedNode) clearedNode.textContent = money(t.cleared);
  document.getElementById('journeyPercent').textContent = `${t.percent.toFixed(1)}%`;
  document.getElementById('journeyBar').style.setProperty('--progress', `${t.percent}%`);
  document.getElementById('recoveryBanner').hidden = state.recoveryDismissed;

  const next = debtMilestones().find(m => m.balance > 0) || debtMilestones()[0];
  document.getElementById('homeNextStopName').textContent = next ? next.publicName : 'Freedom';
  document.getElementById('homeNextStopDue').textContent = next ? `${money(next.balance)} left` : 'Completed';
  document.getElementById('overallJourneyPercent').textContent = `${t.percent.toFixed(1)}%`;
  document.getElementById('ringPercent').textContent = `${t.percent.toFixed(0)}%`;
  document.getElementById('summaryRing').style.setProperty('--ring', `${t.percent}%`);
  const car = document.getElementById('journeyCar');
  if (car) car.style.setProperty('--journey-progress', `${Math.max(2, Math.min(96, t.percent))}%`);
  document.getElementById('totalStarting').textContent = money2(t.starting);
  document.getElementById('totalCleared').textContent = money2(t.cleared);
  document.getElementById('totalLeft').textContent = money2(t.left);
  renderMap();
  renderGarden();
  renderToday();
}

function gardenMetrics() {
  const t = totals();
  const fund = state.milestones.find(m => m.id === 'fund');
  const fundSaved = fund ? Math.max(0, safeNumber(fund.starting) - safeNumber(fund.balance)) : 0;
  const debtScore = Math.min(100, t.percent);
  const safetyScore = fund && safeNumber(fund.starting) ? Math.min(100, (fundSaved / safeNumber(fund.starting)) * 100) : 0;
  const overall = Math.max(0, Math.min(100, debtScore * 0.75 + safetyScore * 0.25));
  const stages = [
    { min: 0, title: 'New Sprout', icon: '🌱', message: 'A strong future starts with one small seed.' },
    { min: 15, title: 'Taking Root', icon: '🌿', message: 'Your steady choices are creating strong roots.' },
    { min: 35, title: 'Growing Strong', icon: '🌳', message: 'Your garden is becoming stronger with every step.' },
    { min: 60, title: 'Blooming', icon: '🌳🌸', message: 'Your progress is beginning to bloom beautifully.' },
    { min: 85, title: 'In Full Bloom', icon: '🌳🌸🦋', message: 'The future you planted together is flourishing.' }
  ];
  const stage = stages.filter(item => overall >= item.min).pop() || stages[0];
  return { ...t, fundSaved, safetyScore, overall, stage };
}

function recentGardenWins() {
  const entries = [];
  state.milestones.forEach(m => {
    (Array.isArray(m.payments) ? m.payments : []).forEach(payment => entries.push({
      date: payment.date,
      icon: m.kind === 'savings' ? '🌱' : '🌸',
      text: `${money2(payment.amount)} ${m.kind === 'savings' ? 'added to' : 'cleared from'} ${m.publicName}`
    }));
  });
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!entries.length) {
    return [
      { icon: '🌱', text: 'Your first saved update will appear here.' },
      { icon: '💛', text: 'Small steps still help your garden grow.' }
    ];
  }
  return entries.slice(0, 4);
}

function renderGarden() {
  const page = document.getElementById('gardenPage');
  if (!page) return;
  const g = gardenMetrics();
  document.getElementById('gardenStageTitle').textContent = g.stage.title;
  document.getElementById('gardenStageMessage').textContent = g.stage.message;
  document.getElementById('gardenTree').textContent = g.stage.icon;
  document.getElementById('gardenPercent').textContent = `${g.overall.toFixed(0)}%`;
  document.getElementById('gardenBar').style.setProperty('--progress', `${g.overall}%`);
  document.getElementById('financialHealthStatus').textContent = `${g.percent.toFixed(1)}% of debt cleared`;
  document.getElementById('futureHomeStatus').textContent = g.fundSaved > 0 ? `${money(g.fundSaved)} protected` : 'Planting the foundation';
  const wins = document.getElementById('gardenWins');
  wins.innerHTML = recentGardenWins().map(item => `<article><span>${item.icon}</span><p>${item.text}</p></article>`).join('');
  const reflection = document.getElementById('gardenReflection');
  if (reflection && document.activeElement !== reflection) reflection.value = state.garden?.reflection || '';
  const label = document.getElementById('reflectionSavedLabel');
  if (label) label.textContent = state.garden?.reflectionDate ? `Saved ${formatDate(state.garden.reflectionDate)}` : 'Saved only on this phone';
}

function gardenDetail(key) {
  const g = gardenMetrics();
  const details = {
    'future-home': ['🏡', 'Future Home', 'Every contribution brings your future front door a little closer.', `<div class="finance-grid"><div class="finance-stat"><small>Protected so far</small><strong>${money2(g.fundSaved)}</strong></div><div class="finance-stat"><small>Current safety goal</small><strong>${money2(LEGACY_ORIGINAL.savingsGoal)}</strong></div></div><div class="detail-block"><strong>Next step</strong><span>Keep strengthening Security first. The home-deposit chapter follows Freedom.</span></div>`],
    relationship: ['❤️', 'Relationship', 'The strongest future is one you keep building together.', `<div class="detail-block"><strong>Stronger every day</strong><span>Use Memories and Adventures to preserve the moments that matter. Relationship tracking stays gentle and private.</span></div>`],
    'financial-health': ['💰', 'Financial Health', 'Your financial roots strengthen whenever a balance falls or savings rise.', `<div class="finance-grid"><div class="finance-stat"><small>Debt cleared</small><strong>${money2(g.cleared)}</strong></div><div class="finance-stat"><small>Debt remaining</small><strong>${money2(g.left)}</strong></div><div class="finance-stat"><small>Journey complete</small><strong>${g.percent.toFixed(1)}%</strong></div><div class="finance-stat"><small>Security saved</small><strong>${money2(g.fundSaved)}</strong></div></div>`],
    'personal-growth': ['🌱', 'Personal Growth', 'Progress is more than money. It is also the habits and confidence you build together.', `<div class="detail-block"><strong>A small reflection</strong><span>Record one thing you learned, changed or appreciated in the Daily Reflection card.</span></div>`],
    'recent-wins': ['🌸', 'Recent Wins', 'The newest actions helping your garden grow.', `<div class="payment-list">${recentGardenWins().map(item => `<div class="payment-row"><span>${item.icon} ${item.text}</span></div>`).join('')}</div>`]
  };
  return details[key];
}


function localDateKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(value) {
  return String(value || '').slice(0, 7);
}

function todayEntries() {
  state.today = state.today || clone(defaults.today);
  if (!Array.isArray(state.today.entries)) state.today.entries = [];
  return state.today.entries;
}

function allMoneyActivity() {
  const activity = todayEntries().map(entry => ({ ...entry, source: 'today' }));
  state.milestones.forEach(m => {
    (Array.isArray(m.payments) ? m.payments : []).forEach(payment => {
      activity.push({
        id: payment.id,
        date: payment.date,
        createdAt: payment.createdAt,
        type: m.kind === 'savings' ? 'savings' : 'journey',
        amount: safeNumber(payment.amount),
        title: m.kind === 'savings' ? `Saved to ${m.publicName}` : `Payment to ${m.publicName}`,
        category: m.accountName,
        milestoneId: m.id,
        source: 'journey'
      });
    });
  });
  return activity.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function activitySummary(periodKey, exactDay = false) {
  const entries = allMoneyActivity().filter(item => exactDay ? item.date === periodKey : monthKey(item.date) === periodKey);
  const sum = type => entries.filter(item => item.type === type).reduce((total, item) => total + safeNumber(item.amount), 0);
  const income = sum('income');
  const expenses = sum('expense');
  const journey = sum('journey');
  const savings = sum('savings');
  return { entries, income, expenses, journey, savings, left: income - expenses - journey - savings };
}

function activityIcon(item) {
  if (item.type === 'income') return '💰';
  if (item.type === 'expense') {
    const icons = { Groceries: '🛒', Fuel: '⛽', Dining: '🍽️', Bills: '🧾', Shopping: '🛍️', Transport: '🚕', Health: '❤️', Other: '💳' };
    return icons[item.category] || '💳';
  }
  if (item.type === 'savings') return '🌱';
  return '🚗';
}

function activityTitle(item) {
  return item.title || item.sourceName || item.category || (item.type === 'income' ? 'Income' : item.type === 'expense' ? 'Expense' : item.type === 'savings' ? 'Savings' : 'Journey payment');
}

function renderActivityRows(entries, limit = 6) {
  if (!entries.length) return '<div class="activity-empty">No activity yet. Use Quick add to record your first entry.</div>';
  return entries.slice(0, limit).map(item => {
    const incoming = item.type === 'income';
    const sign = incoming ? '+' : '−';
    return `<article class="activity-row"><span>${activityIcon(item)}</span><div><strong>${activityTitle(item)}</strong><small>${formatDate(item.date)}${item.note ? ` • ${item.note}` : ''}</small></div><b class="${incoming ? 'in' : 'out'}">${sign}${money2(item.amount)}</b></article>`;
  }).join('');
}

function renderToday() {
  const page = document.getElementById('todayPage');
  if (!page) return;
  const day = localDateKey();
  const month = monthKey(day);
  const daySummary = activitySummary(day, true);
  const monthSummary = activitySummary(month, false);
  const now = new Date();
  const dayText = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const monthText = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(now);
  document.getElementById('todayPageDate').textContent = dayText;
  document.getElementById('todayOverviewDate').textContent = dayText;
  document.getElementById('todayMonthName').textContent = monthText;
  document.getElementById('todayIncome').textContent = money2(daySummary.income);
  document.getElementById('todaySpent').textContent = money2(daySummary.expenses + daySummary.journey);
  document.getElementById('todaySaved').textContent = money2(daySummary.savings);
  document.getElementById('todayPosition').textContent = `${money2(daySummary.left)} ${daySummary.left >= 0 ? 'remaining' : 'over'}`;
  document.getElementById('todayPositionMessage').textContent = daySummary.entries.length ? (daySummary.left >= 0 ? 'Your recorded activity is within today’s income.' : 'Today’s outgoings are above recorded income.') : 'Add income or spending to begin.';
  const pill = document.getElementById('todayStatusPill');
  pill.textContent = daySummary.left >= 0 ? 'On track' : 'Review';
  pill.classList.toggle('negative', daySummary.left < 0);
  document.getElementById('todayActivity').innerHTML = renderActivityRows(allMoneyActivity(), 6);
  document.getElementById('monthIncome').textContent = money2(monthSummary.income);
  document.getElementById('monthExpenses').textContent = money2(monthSummary.expenses);
  document.getElementById('monthJourney').textContent = money2(monthSummary.journey);
  document.getElementById('monthSavings').textContent = money2(monthSummary.savings);
  document.getElementById('monthMoneyLeft').textContent = money2(monthSummary.left);
  const homePosition = document.getElementById('homeTodayPosition');
  if (homePosition) homePosition.textContent = `${money(monthSummary.left)} left`;
  const homeBar = document.getElementById('homeTodayBar');
  if (homeBar) {
    const used = monthSummary.income > 0 ? Math.min(100, Math.max(0, ((monthSummary.expenses + monthSummary.journey + monthSummary.savings) / monthSummary.income) * 100)) : 0;
    homeBar.style.setProperty('--progress', `${used}%`);
  }
}

function todayEntryForm(type) {
  const isIncome = type === 'income';
  const categories = isIncome ? ['Salary', 'Side income', 'Refund', 'Gift', 'Other'] : ['Groceries', 'Fuel', 'Dining', 'Bills', 'Shopping', 'Transport', 'Health', 'Other'];
  openSheet([
    isIncome ? '💰' : '💳',
    isIncome ? 'Add income' : 'Add expense',
    isIncome ? 'Record money coming in.' : 'Record day-to-day spending.',
    `<div class="form-grid" id="todayEntryForm"><label>Amount<input id="todayEntryAmount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></label><label>${isIncome ? 'Source' : 'Category'}<select id="todayEntryCategory">${categories.map(item => `<option>${item}</option>`).join('')}</select></label><label>Date<input id="todayEntryDate" type="date" value="${localDateKey()}"></label><label>Note (optional)<input id="todayEntryNote" type="text" maxlength="80" placeholder="${isIncome ? 'Payday' : 'What was it for?'}"></label><div id="todayEntryStatus" class="save-status" role="status"></div><button class="primary-button" type="button" data-save-today-entry="${type}">Save ${isIncome ? 'income' : 'expense'}</button></div>`
  ]);
}

function saveTodayEntry(type) {
  const amount = parseCurrency(document.getElementById('todayEntryAmount')?.value, NaN);
  const category = String(document.getElementById('todayEntryCategory')?.value || 'Other');
  const date = String(document.getElementById('todayEntryDate')?.value || '');
  const note = String(document.getElementById('todayEntryNote')?.value || '').trim();
  const status = document.getElementById('todayEntryStatus');
  if (!Number.isFinite(amount) || amount <= 0) { if (status) { status.textContent = 'Enter an amount greater than $0.'; status.classList.add('error'); } return; }
  if (!date) { if (status) { status.textContent = 'Choose a date.'; status.classList.add('error'); } return; }
  todayEntries().push({ id: 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), type, amount, category, title: category, date, note, createdAt: new Date().toISOString() });
  if (!save()) { if (status) { status.textContent = 'Could not save this entry.'; status.classList.add('error'); } return; }
  render();
  closeSheet();
  switchTab('today');
  toast(`${type === 'income' ? '💰' : '💳'} ${type === 'income' ? 'Income' : 'Expense'} saved`);
}

function todayJourneyForm(mode = 'journey') {
  const choices = mode === 'savings' ? state.milestones.filter(m => m.kind === 'savings') : debtMilestones().filter(m => m.balance > 0);
  const fallback = mode === 'savings' ? state.milestones.filter(m => m.kind === 'savings') : debtMilestones();
  const milestones = choices.length ? choices : fallback;
  openSheet([
    mode === 'savings' ? '🌱' : '🚗',
    mode === 'savings' ? 'Transfer to savings' : 'Journey payment',
    mode === 'savings' ? 'Grow your Security fund.' : 'Reduce one of your tracked balances.',
    `<div class="form-grid"><label>${mode === 'savings' ? 'Savings goal' : 'Milestone'}<select id="todayMilestoneId">${milestones.map(m => `<option value="${m.id}">${m.publicName} — ${m.accountName}</option>`).join('')}</select></label><label>Amount<input id="todayMilestoneAmount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></label><label>Date<input id="todayMilestoneDate" type="date" value="${localDateKey()}"></label><div class="today-form-note">This updates Journey, Garden, Home and Today together.</div><div id="todayMilestoneStatus" class="save-status" role="status"></div><button class="primary-button" type="button" data-save-today-milestone="${mode}">Save update</button></div>`
  ]);
}

function persistMilestonePayment(m, amount, date, type) {
  if (!m || !Number.isFinite(amount) || amount <= 0 || !date) throw new Error('Invalid payment');
  if (!Array.isArray(m.payments)) m.payments = [];
  let interest = 0;
  let newBalance = safeNumber(m.balance);
  if (m.kind === 'savings') {
    newBalance = Math.max(0, newBalance - amount);
    m.saved = Math.max(0, safeNumber(m.starting) - newBalance);
  } else {
    const previousDate = m.updatedAt ? new Date(m.updatedAt) : new Date(date + 'T00:00:00');
    const currentDate = new Date(date + 'T00:00:00');
    const days = Math.max(0, Math.round((currentDate - previousDate) / 86400000));
    interest = newBalance * (safeNumber(m.interest) / 100) * (days / 365);
    newBalance = Math.max(0, newBalance + interest - amount);
  }
  const entry = { id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), amount, date, type, interest, balanceAfter: newBalance, createdAt: new Date().toISOString() };
  m.balance = newBalance;
  m.updatedAt = date + 'T12:00:00.000Z';
  m.payments.push(entry);
  const ledger = readPaymentLedger();
  if (!Array.isArray(ledger[m.id])) ledger[m.id] = [];
  ledger[m.id].push(entry);
  if (!save()) throw new Error('State save failed');
  if (!writePaymentLedger(ledger)) throw new Error('Ledger save failed');
  syncLegacyBalance(m);
  return entry;
}

function saveTodayMilestone(mode) {
  const m = state.milestones.find(item => item.id === document.getElementById('todayMilestoneId')?.value);
  const amount = parseCurrency(document.getElementById('todayMilestoneAmount')?.value, NaN);
  const date = String(document.getElementById('todayMilestoneDate')?.value || '');
  const status = document.getElementById('todayMilestoneStatus');
  try {
    persistMilestonePayment(m, amount, date, mode === 'savings' ? 'Savings transfer' : 'Journey payment');
    state = load();
    render();
    closeSheet();
    switchTab('today');
    toast(`${mode === 'savings' ? '🌱 Savings' : '🚗 Payment'} saved`);
  } catch (error) {
    console.error(error);
    if (status) { status.textContent = !Number.isFinite(amount) || amount <= 0 ? 'Enter an amount greater than $0.' : 'Could not save this update.'; status.classList.add('error'); }
  }
}

function openTodayMonthActivity() {
  const month = monthKey(localDateKey());
  const entries = allMoneyActivity().filter(item => monthKey(item.date) === month);
  openSheet(['📅', 'This month', 'All recorded money activity for the current month.', `<div class="today-activity">${renderActivityRows(entries, 100)}</div>`]);
}

const JOURNEY_CHAPTERS = [
  { key: 'beginning', number: 1, icon: '🏁', name: 'The Beginning', message: 'Every journey starts with a decision.', ids: ['zip-money'], tone: 'beginning' },
  { key: 'building', number: 2, icon: '🌱', name: 'Building', message: 'We’re laying the foundation for our future.', ids: ['zip-plus'], tone: 'building' },
  { key: 'growing', number: 3, icon: '🌿', name: 'Growing', message: 'Little by little, we’re getting stronger.', ids: ['cc1'], tone: 'growing' },
  { key: 'strengthening', number: 4, icon: '🌳', name: 'Strengthening', message: 'Our roots run deep. Our future is secure.', ids: ['cc2', 'car'], tone: 'strengthening' },
  { key: 'freedom', number: 5, icon: '🎉', name: 'Freedom', message: 'The day every debt reaches zero.', ids: [], tone: 'freedom', gate: 'debts' },
  { key: 'security', number: 6, icon: '🛡️', name: 'Security', message: 'Building our safety net for life’s surprises.', ids: ['fund'], tone: 'security', gate: 'freedom' },
  { key: 'our-home', number: 7, icon: '🏡', name: 'Our Home', message: 'A place we’ll call our own.', ids: [], tone: 'home', gate: 'security' },
  { key: 'welcome-home', number: 8, icon: '❤️', name: 'Welcome Home', message: 'The destination of our journey together.', ids: [], tone: 'welcome', gate: 'home' }
];

function chapterMetrics(chapter) {
  const items = chapter.ids.map(id => state.milestones.find(m => m.id === id)).filter(Boolean);
  const starting = items.reduce((sum, m) => sum + safeNumber(m.starting), 0);
  const balance = items.reduce((sum, m) => sum + safeNumber(m.balance), 0);
  const cleared = Math.max(0, starting - balance);
  const progress = starting ? Math.max(0, Math.min(100, cleared / starting * 100)) : 0;
  const allDebtsClear = debtMilestones().every(m => safeNumber(m.balance) <= 0);
  const fund = state.milestones.find(m => m.id === 'fund');
  const fundComplete = fund ? safeNumber(fund.balance) <= 0 : false;
  let unlocked = true;
  if (chapter.gate === 'debts') unlocked = allDebtsClear;
  if (chapter.gate === 'freedom') unlocked = allDebtsClear;
  if (chapter.gate === 'security') unlocked = allDebtsClear && fundComplete;
  if (chapter.gate === 'home') unlocked = false;
  return { items, starting, balance, cleared, progress, unlocked, complete: items.length ? balance <= 0 : unlocked && chapter.key === 'freedom' };
}

function renderMap() {
  const map = document.getElementById('milestoneMap');
  const chapters = JOURNEY_CHAPTERS.map(chapter => {
    const m = chapterMetrics(chapter);
    const current = m.unlocked && !m.complete && (m.items.length ? m.balance > 0 : chapter.key === 'freedom');
    const stateClass = m.complete ? 'completed' : current ? 'current' : m.unlocked ? 'available' : 'locked';
    const amountLine = m.items.length
      ? `<small>${money2(m.cleared)} cleared • ${money2(m.balance)} remaining</small>`
      : `<small>${m.unlocked ? (chapter.key === 'freedom' ? 'All debts cleared' : 'Ready for the next chapter') : 'Unlocks as your journey progresses'}</small>`;
    return `<button class="journey-chapter ${chapter.tone} ${stateClass}" data-chapter="${chapter.key}">
      <span class="chapter-node">${m.complete ? '✓' : chapter.number}</span>
      <span class="chapter-icon">${chapter.icon}</span>
      <span class="chapter-copy"><strong>${chapter.name}</strong><span>${chapter.message}</span>${amountLine}</span>
      <span class="chapter-progress">${m.items.length ? `<b>${m.progress.toFixed(0)}%</b><i><em style="width:${m.progress}%"></em></i>` : (m.unlocked ? '›' : '🔒')}</span>
    </button>`;
  }).join('');
  map.innerHTML = chapters;
}

function openJourneyChapter(key) {
  const chapter = JOURNEY_CHAPTERS.find(c => c.key === key);
  if (!chapter) return;
  const metrics = chapterMetrics(chapter);
  if (!metrics.unlocked) {
    openSheet([chapter.icon, chapter.name, chapter.message, '<div class="detail-block"><strong>Locked for now</strong><span>Keep reducing debt to unlock this chapter.</span></div>']);
    return;
  }
  if (metrics.items.length === 1) {
    milestoneSheet(metrics.items[0].id);
    return;
  }
  if (metrics.items.length > 1) {
    const accountButtons = metrics.items.map(item => `<button class="chapter-account" data-milestone="${item.id}"><span>${item.icon}</span><span><strong>${item.accountName}</strong><small>${money2(item.balance)} remaining • ${pct(item).toFixed(0)}% complete</small></span><b>›</b></button>`).join('');
    openSheet([chapter.icon, chapter.name, `${metrics.progress.toFixed(1)}% complete • ${money2(metrics.balance)} remaining`, `<div class="chapter-account-list">${accountButtons}</div>`]);
    return;
  }
  openSheet([chapter.icon, chapter.name, chapter.message, `<div class="detail-block"><strong>${chapter.key === 'freedom' ? 'Debt-free milestone' : 'Future chapter'}</strong><span>${chapter.key === 'freedom' ? 'This unlocks automatically when every debt balance reaches zero.' : 'This chapter will open when the previous stage is complete.'}</span></div>`]);
}

function formatDate(value) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value + 'T00:00:00'));
}

function switchTab(tab) {
  if (!['home', 'journey', 'garden', 'today'].includes(tab)) {
    openSheet(['🔒', 'Coming next', 'This tab will be built after Today is completed.', '']);
    return;
  }
  activeTab = tab;
  const pages = { home: 'homePage', journey: 'journeyPage', garden: 'gardenPage', today: 'todayPage' };
  Object.entries(pages).forEach(([name, id]) => {
    const page = document.getElementById(id);
    page.hidden = name !== tab;
    page.classList.toggle('active-page', name === tab);
  });
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (tab === 'garden') renderGarden();
  if (tab === 'today') renderToday();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSheetScroll(id = 'detailSheet') {
  const panel = document.querySelector(`#${id} .sheet-panel`);
  if (panel) panel.scrollTop = 0;
}

function openSheet(data) {
  document.getElementById('sheetIcon').textContent = data[0];
  document.getElementById('sheetTitle').textContent = data[1];
  document.getElementById('sheetDescription').textContent = data[2] || '';
  document.getElementById('sheetContent').innerHTML = data[3] || '';
  const sheet = document.getElementById('detailSheet');
  sheet.setAttribute('aria-hidden', 'false');
  resetSheetScroll();
  document.body.classList.add('sheet-open');
}

function closeSheet(id = 'detailSheet') {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
}

function currentNextStop() {
  return debtMilestones().find(m => m.balance > 0) || debtMilestones()[0];
}

function getHomeDetails(key) {
  const next = currentNextStop();
  const details = {
    today: ['☀️', 'Today’s focus', 'A calm overview of what matters next.', ''],
    'next-stop': ['📍', 'Next Stop', 'Your next financial milestone.', next ? `<div class="detail-block"><strong>${next.publicName}</strong><span>${next.accountName} • ${money2(next.balance)} left to go.</span></div>` : ''],
    'next-adventure': ['🌊', 'Next Adventure', 'The next experience you are looking forward to together.', '<div class="detail-block"><strong>Esperance</strong><span>Your planned trip remains separate from the debt balances.</span></div>'],
    garden: ['🌳', 'Garden', 'Your savings and net worth represented as something beautiful growing.', ''],
    dreams: ['⭐', 'Dreams', 'Your shared vision board.', ''],
    memories: ['📖', 'Memories', 'Your shared timeline of photos, trips and milestones.', ''],
    wins: ['🏆', 'Wins', 'Celebrate every meaningful achievement.', ''],
    adventures: ['🧭', 'Adventures', 'Plan your next trip and preserve completed journeys.', '']
  };
  return details[key];
}

function milestoneSheet(id, tab = 'overview') {
  selectedMilestone = state.milestones.find(m => m.id === id);
  if (!selectedMilestone) return;
  activeSheetTab = tab;
  const m = selectedMilestone;
  const progress = pct(m);
  const tabs = `<div class="sheet-tabs">${['overview', 'payments', 'plan', 'notes'].map(name => `<button data-sheet-tab="${name}" class="${name === tab ? 'active' : ''}">${name[0].toUpperCase() + name.slice(1)}</button>`).join('')}</div>`;
  let body = '';

  if (tab === 'overview') {
    body = `<div class="account-reveal"><small>Account behind this milestone</small><strong>${m.accountName}</strong></div>
      <div class="finance-grid">
        <div class="finance-stat"><small>${m.kind === 'savings' ? 'Amount still needed' : 'Current balance'}</small><strong>${money2(m.balance)}</strong></div>
        <div class="finance-stat"><small>Tracked starting amount</small><strong>${money2(m.starting)}</strong></div>
        <div class="finance-stat"><small>Interest rate</small><strong>${safeNumber(m.interest).toFixed(2)}% p.a.</strong></div>
        <div class="finance-stat"><small>Estimated payoff</small><strong>${estimatePayoff(m)}</strong></div>
        <div class="finance-stat"><small>Minimum payment</small><strong>${money2(m.minPayment)} / ${m.frequency}</strong></div>
        <div class="finance-stat"><small>Extra payment</small><strong>${money2(m.extraPayment)} / ${m.frequency}</strong></div>
      </div>
      <div class="detail-block"><strong>💡 Why it matters</strong><span>${m.why}</span></div>
      <button class="primary-button" data-add-payment="${m.id}">${m.kind === 'savings' ? 'Add savings' : 'Make a payment'}</button>`;
  }

  if (tab === 'payments') {
    body = `<div class="payment-list">${m.payments.length ? m.payments.slice().reverse().map(item => `<div class="payment-row"><span>${new Intl.DateTimeFormat('en-AU').format(new Date(item.date + 'T00:00:00'))}<br><small>${item.type || 'Payment'}${item.interest ? ` • ${money2(item.interest)} estimated interest` : ''}</small></span><b>${money2(item.amount)}</b></div>`).join('') : '<div class="detail-block"><strong>No payments yet</strong><span>Your new payment history will appear here. Your previous app’s current balances have already been imported.</span></div>'}</div>
      <button class="secondary-button" data-add-payment="${m.id}">＋ Add payment</button>`;
  }

  if (tab === 'plan') {
    body = `<div class="form-grid"><label>Extra payment<input id="whatIfExtra" type="number" min="0" value="${m.extraPayment || 100}"></label><label>Frequency<select id="whatIfFrequency"><option value="week">per week</option><option value="month">per month</option></select></label><button class="primary-button" data-calc-plan="${m.id}">Calculate impact</button></div><div id="planResult"></div>`;
  }

  if (tab === 'notes') {
    body = `<div class="detail-block"><strong>Account name</strong><span>${m.accountName}</span></div><div class="detail-block"><strong>Why it matters</strong><span>${m.why}</span></div>`;
  }

  openSheet([m.icon, m.publicName, `${progress.toFixed(1)}% complete • ${money2(m.balance)} ${m.kind === 'savings' ? 'to goal' : 'left'}`, tabs + body]);
}

function paymentPerMonth(m, extra = m.extraPayment, frequency = m.frequency) {
  const base = safeNumber(m.minPayment);
  const extraAmount = safeNumber(extra);
  const multiplier = frequency === 'week' ? 52 / 12 : 1;
  return (base + extraAmount) * multiplier;
}

function estimatePayoff(m, extra = m.extraPayment, frequency = m.frequency) {
  if (m.kind === 'savings') {
    const monthly = paymentPerMonth(m, extra, frequency);
    if (monthly <= 0) return m.due ? formatDate(m.due) : 'Not set';
    const months = Math.ceil(m.balance / monthly);
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric' }).format(date);
  }

  const monthlyPayment = paymentPerMonth(m, extra, frequency);
  if (monthlyPayment <= 0) return 'Not set';
  const monthlyRate = safeNumber(m.interest) / 100 / 12;
  let months;
  if (monthlyRate <= 0) months = Math.ceil(m.balance / monthlyPayment);
  else if (monthlyPayment <= m.balance * monthlyRate) return 'Payment too low';
  else months = Math.ceil(-Math.log(1 - (monthlyRate * m.balance) / monthlyPayment) / Math.log(1 + monthlyRate));
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric' }).format(date);
}

function paymentForm(id) {
  const m = state.milestones.find(item => item.id === id);
  if (!m) return;
  openSheet([m.icon, m.kind === 'savings' ? `Add to ${m.publicName}` : `Pay ${m.publicName}`, 'Record the amount and update your real balance.', `<div id="paymentForm" class="form-grid"><input id="paymentMilestoneId" type="hidden" value="${m.id}"><label>Amount<input id="paymentAmount" type="text" inputmode="decimal" autocomplete="off" placeholder="151.17"></label><label>Date<input id="paymentDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Type<select id="paymentType"><option>Minimum payment</option><option>Extra payment</option><option>Minimum + extra</option><option>Statement adjustment</option></select></label><div id="paymentSaveStatus" class="save-status" role="status"></div><button id="savePaymentButton" class="primary-button" type="button" data-save-payment="${m.id}">Save update</button></div>`]);
  setTimeout(() => document.getElementById('paymentAmount')?.focus(), 120);
}

function setPaymentStatus(message, isError = false) {
  const el = document.getElementById('paymentSaveStatus');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function commitPaymentDirect(milestoneId) {
  const m = state.milestones.find(item => item.id === milestoneId);
  const amountInput = document.getElementById('paymentAmount');
  const dateInput = document.getElementById('paymentDate');
  const typeInput = document.getElementById('paymentType');
  const saveButton = document.getElementById('savePaymentButton');
  const amount = parseCurrency(amountInput?.value, NaN);
  const date = String(dateInput?.value || '');
  const type = String(typeInput?.value || 'Payment');
  if (!m) { setPaymentStatus('Milestone not found.', true); return; }
  if (!Number.isFinite(amount) || amount <= 0) { setPaymentStatus('Enter an amount greater than $0.', true); amountInput?.focus(); return; }
  if (!date) { setPaymentStatus('Choose a payment date.', true); dateInput?.focus(); return; }
  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';
  setPaymentStatus('Saving payment…');
  try {
    if (type === 'Statement adjustment') {
      const oldBalance = m.balance;
      m.balance = Math.max(0, amount);
      m.updatedAt = date + 'T12:00:00.000Z';
      const entry = { id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), amount: Math.abs(oldBalance - m.balance), date, type, interest: 0, balanceAfter: m.balance, createdAt: new Date().toISOString() };
      if (!Array.isArray(m.payments)) m.payments = [];
      m.payments.push(entry);
      const ledger = readPaymentLedger();
      if (!Array.isArray(ledger[m.id])) ledger[m.id] = [];
      ledger[m.id].push(entry);
      if (!save() || !writePaymentLedger(ledger)) throw new Error('Save failed');
      syncLegacyBalance(m);
    } else {
      persistMilestonePayment(m, amount, date, type);
    }
    state = load();
    render();
    const movingCar = document.getElementById('journeyCar');
    if (movingCar) { movingCar.classList.remove('just-moved'); void movingCar.offsetWidth; movingCar.classList.add('just-moved'); }
    milestoneSheet(m.id, 'payments');
    toast(`✅ Saved ${money2(amount)}`);
  } catch (error) {
    console.error('Payment save failed', error);
    saveButton.disabled = false;
    saveButton.textContent = 'Save update';
    setPaymentStatus('Could not save this payment. Please try once more.', true);
  }
}

function addMilestoneForm() {
  openSheet(['＋', 'New milestone', 'Add another step to your roadmap.', `<form id="milestoneForm" class="form-grid"><label>Emoji<input name="icon" value="🎯" maxlength="4"></label><label>Milestone name<input name="publicName" required placeholder="New milestone"></label><label>Account name<input name="accountName" required placeholder="The real account or goal"></label><label>Starting amount<input name="starting" type="number" min="1" required inputmode="decimal"></label><label>Current balance<input name="balance" type="number" min="0" required inputmode="decimal"></label><label>Interest rate %<input name="interest" type="number" step="0.01" value="0" inputmode="decimal"></label><label>Minimum payment<input name="minPayment" type="number" min="0" value="0" inputmode="decimal"></label><label>Payment frequency<select name="frequency"><option value="month">Monthly</option><option value="week">Weekly</option></select></label><label>Target date<input name="due" type="date"></label><label>Why it matters<textarea name="why" placeholder="What will this milestone change for your family?"></textarea></label><button class="primary-button" type="submit">Add to journey</button></form>`]);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ version: 9, exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `homebound-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  state.lastBackup = new Date().toISOString();
  save();
  toast('💾 Backup created');
}

function toast(text) {
  let node = document.querySelector('.success-toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'success-toast';
    document.body.append(node);
  }
  node.textContent = text;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2200);
}

document.addEventListener('click', event => {
  const closeDetail = event.target.closest('[data-close-sheet]');
  if (closeDetail) {
    closeSheet();
    return;
  }
  const closeNotifications = event.target.closest('[data-close-notifications]');
  if (closeNotifications) {
    closeSheet('notificationsSheet');
    return;
  }

  const tab = event.target.closest('[data-tab]');
  if (tab) {
    switchTab(tab.dataset.tab);
    return;
  }

  const detail = event.target.closest('[data-detail]');
  if (detail) {
    openSheet(getHomeDetails(detail.dataset.detail));
    return;
  }

  const gardenCard = event.target.closest('[data-garden-card]');
  if (gardenCard) {
    openSheet(gardenDetail(gardenCard.dataset.gardenCard));
    return;
  }

  const chapter = event.target.closest('[data-chapter]');
  if (chapter) {
    openJourneyChapter(chapter.dataset.chapter);
    return;
  }

  const milestone = event.target.closest('[data-milestone]');
  if (milestone) {
    milestoneSheet(milestone.dataset.milestone);
    return;
  }

  const sheetTab = event.target.closest('[data-sheet-tab]');
  if (sheetTab && selectedMilestone) {
    milestoneSheet(selectedMilestone.id, sheetTab.dataset.sheetTab);
    return;
  }

  const pay = event.target.closest('[data-add-payment]');
  if (pay) {
    paymentForm(pay.dataset.addPayment);
    return;
  }

  const savePayment = event.target.closest('[data-save-payment]');
  if (savePayment) {
    commitPaymentDirect(savePayment.dataset.savePayment);
    return;
  }

  const calc = event.target.closest('[data-calc-plan]');
  if (calc) {
    const extra = safeNumber(document.getElementById('whatIfExtra').value);
    const frequency = document.getElementById('whatIfFrequency').value;
    const m = state.milestones.find(item => item.id === calc.dataset.calcPlan);
    document.getElementById('planResult').innerHTML = `<div class="calc-result"><div><small>Current payoff</small><strong>${estimatePayoff(m, 0, m.frequency)}</strong></div><div><small>With extra payment</small><strong>${estimatePayoff(m, extra, frequency)}</strong></div></div>`;
    return;
  }

  const todayAdd = event.target.closest('[data-today-add]');
  if (todayAdd) {
    if (todayAdd.dataset.todayAdd === 'income' || todayAdd.dataset.todayAdd === 'expense') todayEntryForm(todayAdd.dataset.todayAdd);
    else todayJourneyForm(todayAdd.dataset.todayAdd);
    return;
  }

  const saveToday = event.target.closest('[data-save-today-entry]');
  if (saveToday) { saveTodayEntry(saveToday.dataset.saveTodayEntry); return; }

  const saveTodayMilestoneButton = event.target.closest('[data-save-today-milestone]');
  if (saveTodayMilestoneButton) { saveTodayMilestone(saveTodayMilestoneButton.dataset.saveTodayMilestone); return; }

  const action = event.target.closest('[data-action]');
  if (action) {
    if (action.dataset.action === 'backup') exportBackup();
    else if (action.dataset.action === 'payment') {
      const next = currentNextStop();
      if (next) paymentForm(next.id);
    } else {
      openSheet([action.dataset.action === 'memory' ? '📷' : '⭐', action.dataset.action === 'memory' ? 'Add a memory' : 'Add a dream', 'This feature comes after Journey approval.', '']);
    }
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'milestoneForm') {
    event.preventDefault();
    const data = new FormData(event.target);
    state.milestones.push({
      id: 'm-' + Date.now(),
      icon: data.get('icon') || '🎯',
      publicName: data.get('publicName'),
      accountName: data.get('accountName'),
      kind: 'debt',
      starting: safeNumber(data.get('starting')),
      balance: safeNumber(data.get('balance')),
      interest: safeNumber(data.get('interest')),
      minPayment: safeNumber(data.get('minPayment')),
      extraPayment: 0,
      frequency: data.get('frequency'),
      due: data.get('due'),
      why: data.get('why') || 'A meaningful step on your road home.',
      updatedAt: null,
      payments: []
    });
    save();
    render();
    closeSheet();
    toast('Milestone added');
  }
});

document.getElementById('addMilestoneButton').addEventListener('click', addMilestoneForm);
document.getElementById('notificationsButton').addEventListener('click', () => {
  document.getElementById('notificationsSheet').setAttribute('aria-hidden', 'false');
  resetSheetScroll('notificationsSheet');
  document.getElementById('notificationBadge').hidden = true;
  document.body.classList.add('sheet-open');
});
document.getElementById('dismissRecovery').addEventListener('click', () => {
  state.recoveryDismissed = true;
  save();
  render();
});

const saveReflectionButton = document.getElementById('saveReflectionButton');
if (saveReflectionButton) {
  saveReflectionButton.addEventListener('click', () => {
    const reflection = document.getElementById('gardenReflection');
    state.garden = state.garden || clone(defaults.garden);
    state.garden.reflection = String(reflection?.value || '').trim();
    state.garden.reflectionDate = new Date().toISOString().slice(0, 10);
    if (save()) {
      renderGarden();
      toast('🌼 Reflection saved');
    } else {
      toast('Could not save reflection');
    }
  });
}

const todayAddButton = document.getElementById('todayAddButton');
if (todayAddButton) todayAddButton.addEventListener('click', () => todayEntryForm('expense'));
const todayViewAllButton = document.getElementById('todayViewAllButton');
if (todayViewAllButton) todayViewAllButton.addEventListener('click', openTodayMonthActivity);

const carousel = document.getElementById('lifeCarousel');
const dots = [...document.querySelectorAll('.carousel-dots i')];
carousel.addEventListener('scroll', () => {
  const max = Math.max(1, carousel.scrollWidth - carousel.clientWidth);
  const index = Math.min(dots.length - 1, Math.round((carousel.scrollLeft / max) * (dots.length - 1)));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}, { passive: true });

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeSheet();
    closeSheet('notificationsSheet');
  }
});

greeting();
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
