import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc as fsDoc, getDoc as fsGetDoc, setDoc as fsSetDoc, collection as fsCollection, getDocs as fsGetDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// --- Document Object Module Elements ---
const userBusinessName = document.getElementById('userBusinessName');
const logoutBtn = document.getElementById('logoutBtn');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');
const netBalanceEl = document.getElementById('netBalance');

// --- Chart Instances ---
let incomeCategoryChartInstance = null;
let categoryChartInstance = null;
let lineChartInstance = null;
let barChartInstance = null;

let currentUser = null;
const STORAGE_KEY_PREFIX = 'sme_budget_categories_';

// --- Design Tokens ---
const COLORS = {
  green: '#009A44',
  greenAlpha: 'rgba(0, 154, 68, 0.75)',
  red: '#D32F2F',
  redAlpha: 'rgba(211, 47, 47, 0.75)',
  blue: '#0033A0',
  blueLight: 'rgba(0, 51, 160, 0.15)',
  netLine: '#374151',
  categoryPalette: [
    'rgba(211,  47,  47, 0.80)',
    'rgba(230,  81,   0, 0.80)',
    'rgba(123,  31, 162, 0.80)',
    'rgba(  2, 136, 209, 0.80)',
    'rgba(  0, 121, 107, 0.80)',
  ],
  incomePalette: [
    'rgba(  0, 154,  68, 0.82)',
    'rgba( 46, 125,  50, 0.82)',
    'rgba(  0, 188, 100, 0.82)',
    'rgba(  0, 105,  92, 0.82)',
    'rgba( 27, 163, 156, 0.82)',
  ],
};

// --- Currency Formatter ---
const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);

// --- Auth State Observer ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const userDoc = await fsGetDoc(fsDoc(db, 'users', user.uid));
    let businessName = (userDoc.exists() && userDoc.data().businessName)
      ? userDoc.data().businessName
      : user.displayName;

    if (!businessName) {
      businessName = prompt('Welcome! Please enter your business name to continue:');
      if (businessName && businessName.trim()) {
        businessName = businessName.trim();
        await updateProfile(user, { displayName: businessName });
        await fsSetDoc(fsDoc(db, 'users', user.uid), {
          businessName,
          email: user.email,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } else {
        businessName = user.email;
      }
    }
    userBusinessName.textContent = businessName;
    loadDashboardData();
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}

// --- Firestore Data Load ---
async function loadDashboardData() {
  if (!currentUser) return;
  try {
    const snap = await fsGetDocs(fsCollection(db, 'users', currentUser.uid, 'transactions'));
    const data = [];
    snap.forEach(d => data.push(d.data()));
    renderTopBudgets(data);
    if (!snap.empty) {
      processAndRenderDashboard(data);
    }
  } catch (err) {
    console.error('Error loading Firestore data:', err);
  }
}

// --- Date Utilities ---
function parseDate(dateVal) {
  if (!dateVal) return new Date(0);
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal === 'number') {
    return new Date(Math.round((dateVal - 25569) * 86400 * 1000));
  }
  const str = String(dateVal);
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) return new Date(parts[2] + '-' + parts[1] + '-' + parts[0]);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function formatDateStr(dateVal) {
  const d = parseDate(dateVal);
  if (d.getTime() === 0) return String(dateVal);
  return d.toLocaleDateString('en-KE');
}

// --- Core Processing ---
function processAndRenderDashboard(data) {
  let totalIncome = 0;
  let totalExpense = 0;
  const labels = [];
  const cashInData = [];
  const cashOutData = [];
  const balances = [];
  const netPerDate = [];
  let runningBalance = 0;
  const categoryMap = {};
  const incomeCategoryMap = {};

  const sorted = [...data].sort(
    (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
  );

  sorted.forEach(row => {
    const cashIn = parseFloat((row.cashin || '0').toString().replace(/,/g, '')) || 0;
    const cashOut = parseFloat((row.cashout || '0').toString().replace(/,/g, '')) || 0;

    runningBalance += cashIn - cashOut;
    totalIncome += cashIn;
    totalExpense += cashOut;

    labels.push(formatDateStr(row.date));
    cashInData.push(cashIn);
    cashOutData.push(cashOut);
    balances.push(runningBalance);
    netPerDate.push(cashIn - cashOut);

    if (cashOut > 0) {
      const rawDesc = (row.description || 'Other').toString().trim();
      const category = rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1, 22) + (rawDesc.length > 22 ? '...' : '');
      categoryMap[category] = (categoryMap[category] || 0) + cashOut;
    }
    if (cashIn > 0) {
      const rawDesc = (row.description || 'Other').toString().trim();
      const category = rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1, 22) + (rawDesc.length > 22 ? '...' : '');
      incomeCategoryMap[category] = (incomeCategoryMap[category] || 0) + cashIn;
    }
  });

  const netBalance = runningBalance;

  totalIncomeEl.textContent = formatCurrency(totalIncome);
  totalExpenseEl.textContent = formatCurrency(totalExpense);
  netBalanceEl.textContent = formatCurrency(netBalance);

  const sortedCats = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const sortedIncomeCats = Object.entries(incomeCategoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  renderIncomeCategoryChart(
    sortedIncomeCats.map(([k]) => k),
    sortedIncomeCats.map(([, v]) => v)
  );
  renderCategoryChart(
    sortedCats.map(([k]) => k),
    sortedCats.map(([, v]) => v)
  );
  renderLineChart(labels, balances);
  renderBarChart(labels, cashInData, cashOutData, netPerDate);
  renderTopBudgets(data);
}

// --- Chart 0: Top Income (Horizontal Bar — Green palette) ---
function renderIncomeCategoryChart(catLabels, catValues) {
  const ctx = document.getElementById('incomeChart').getContext('2d');
  if (incomeCategoryChartInstance) incomeCategoryChartInstance.destroy();

  if (!catLabels.length) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#777';
    ctx.textAlign = 'center';
    ctx.fillText('No income data available yet.', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  incomeCategoryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: catLabels,
      datasets: [{
        label: 'Total Received (KES)',
        data: catValues,
        backgroundColor: COLORS.greenAlpha,
        borderColor: COLORS.green,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ' ' + formatCurrency(ctx.parsed.x); },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function (v) { return formatCurrency(v); },
            maxTicksLimit: 5,
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y: {
          ticks: { font: { size: 12 } },
          grid: { display: false },
        },
      },
    },
  });
}

// --- Chart 1: Top Expense (Horizontal Bar) ---
function renderCategoryChart(catLabels, catValues) {
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (categoryChartInstance) categoryChartInstance.destroy();

  if (!catLabels.length) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#777';
    ctx.textAlign = 'center';
    ctx.fillText('No expense data available yet.', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  categoryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: catLabels,
      datasets: [{
        label: 'Total Spent (KES)',
        data: catValues,
        backgroundColor: COLORS.redAlpha,
        borderColor: COLORS.red,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ' ' + formatCurrency(ctx.parsed.x); },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function (v) { return formatCurrency(v); },
            maxTicksLimit: 5,
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y: {
          ticks: { font: { size: 12 } },
          grid: { display: false },
        },
      },
    },
  });
}

// --- Chart 2: Cash Flow Trend (Smart X-axis tick reduction) ---
function renderLineChart(labels, balances) {
  const ctx = document.getElementById('lineChart').getContext('2d');
  if (lineChartInstance) lineChartInstance.destroy();

  const n = labels.length;
  const maxTicks = n <= 10 ? n : n <= 30 ? 8 : n <= 90 ? 6 : 5;

  lineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Cumulative Balance',
        data: balances,
        borderColor: COLORS.blue,
        backgroundColor: COLORS.blueLight,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: COLORS.blue,
      }],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ' Balance: ' + formatCurrency(ctx.parsed.y); },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: maxTicks,
            maxRotation: 35,
            minRotation: 0,
            autoSkip: true,
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        y: {
          beginAtZero: false,
          ticks: {
            callback: function (v) { return formatCurrency(v); },
            maxTicksLimit: 6,
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
    },
  });
}

// --- Chart 3: Daily Inflows vs Outflows  ---
function renderBarChart(labels, inflows, outflows,) {
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChartInstance) barChartInstance.destroy();

  const n = labels.length;
  const maxTicks = n <= 10 ? n : n <= 30 ? 10 : n <= 90 ? 7 : 5;

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Cash In',
          data: inflows,
          backgroundColor: COLORS.greenAlpha,
          borderColor: COLORS.green,
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'yBar',
          order: 2,
        },
        {
          type: 'bar',
          label: 'Cash Out',
          data: outflows,
          backgroundColor: COLORS.redAlpha,
          borderColor: COLORS.red,
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'yBar',
          order: 3,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, padding: 16, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y); },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: maxTicks,
            maxRotation: 35,
            autoSkip: true,
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        yBar: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          ticks: {
            callback: function (v) { return formatCurrency(v); },
            maxTicksLimit: 6,
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
          title: { display: true, text: 'Volume (KES)', font: { size: 11 }, color: '#777' },
        },
        yNet: {
          type: 'linear',
          position: 'right',
          ticks: {
            callback: function (v) { return formatCurrency(v); },
            maxTicksLimit: 6,
            font: { size: 11 },
          },
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Net (KES)', font: { size: 11 }, color: '#777' },
        },
      },
    },
  });
}

// --- Render Top 3 Budget Categories ---
function renderTopBudgets(transactions = []) {
  const grid = document.getElementById('budgetTop3Grid');
  const emptyState = document.getElementById('budgetTop3Empty');
  
  if (!grid || !emptyState) return;

  let storedCategories = [];
  if (currentUser) {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${currentUser.uid}`);
      storedCategories = raw ? JSON.parse(raw) : [];
    } catch {
      storedCategories = [];
    }
  }

  if (storedCategories.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  grid.classList.remove('hidden');

  // Sort by limit descending, take top 3
  const top3 = storedCategories
    .sort((a, b) => Number(b.limit) - Number(a.limit))
    .slice(0, 3);

  grid.innerHTML = top3.map(cat => {
    let spent = 0;
    transactions.forEach(tx => {
      if (String(tx.categoryId) === String(cat.id)) {
        if (cat.type === 'expense') {
          spent += parseFloat(String(tx.cashout || 0).replace(/,/g, '')) || 0;
        } else {
          spent += parseFloat(String(tx.cashin || 0).replace(/,/g, '')) || 0;
        }
      }
    });
    const remaining = Number(cat.limit) - spent;

    return `
    <div class="stat-card" style="border-top: 4px solid var(--primary-blue, #0033A0);">
      <h3 style="margin-bottom: 0.25rem; color: var(--text-dark); font-weight: 600;">${cat.name}</h3>
      <div class="value" style="font-size: 1.6rem; color: var(--primary-blue, #0033A0); font-weight: 700;">${formatCurrency(remaining)}</div>
      <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 0.5rem; font-weight: 500; display: flex; justify-content: space-between;">
        <span>Remaining Balance</span>
        <span class="budget-card-type-badge ${cat.type === 'expense' ? 'badge-expense' : 'badge-income'}">
          ${cat.type === 'expense' ? 'Expense' : 'Income / Savings'}
        </span>
      </div>
    </div>
  `}).join('');
}

