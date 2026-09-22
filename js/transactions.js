import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc as fsDoc, getDoc as fsGetDoc, collection as fsCollection, getDocs as fsGetDocs, addDoc as fsAddDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Document Object Model Elements
const userBusinessName = document.getElementById('userBusinessName');
const logoutBtn = document.getElementById('logoutBtn');
const tableBody = document.getElementById('transactionTableBody');
const addTransactionForm = document.getElementById('addTransactionForm');
const txErrorMsg = document.getElementById('txErrorMsg');
const txSubmitBtn = document.getElementById('txSubmitBtn');
const txBudget = document.getElementById('txBudget');

let currentUser = null;
let budgetCategories = [];
const STORAGE_KEY_PREFIX = 'sme_budget_categories_';

function loadBudgetCategories() {
  if (!currentUser) return;

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${currentUser.uid}`);
    budgetCategories = raw ? JSON.parse(raw) : [];
  } catch {
    budgetCategories = [];
  }

  if (txBudget) {
    budgetCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `${cat.name}`;
      txBudget.appendChild(opt);
    });
  }
}

// Mutual exclusion and Category restrictions
const txCashInInput = document.getElementById('txCashIn');
const txCashOutInput = document.getElementById('txCashOut');

function updateCashInputsState() {
  const selectedCatId = txBudget ? txBudget.value : '';
  const selectedCat = budgetCategories.find(c => c.id === selectedCatId);
  const catType = selectedCat ? selectedCat.type : null;

  const cashInVal = parseFloat(txCashInInput.value);
  const hasCashIn = !isNaN(cashInVal) && cashInVal > 0;

  const cashOutVal = parseFloat(txCashOutInput.value);
  const hasCashOut = !isNaN(cashOutVal) && cashOutVal > 0;

  let disableCashIn = false;
  let disableCashOut = false;

  // Rule 1: Category restriction
  if (catType === 'expense') {
    disableCashIn = true;
    txCashInInput.value = '';
  } else if (catType === 'income') {
    disableCashOut = true;
    txCashOutInput.value = '';
  }

  // Rule 2: Mutual exclusion (only if not already disabled)
  if (!disableCashIn && hasCashOut) {
    disableCashIn = true;
  }
  if (!disableCashOut && hasCashIn) {
    disableCashOut = true;
  }

  txCashInInput.disabled = disableCashIn;
  txCashOutInput.disabled = disableCashOut;
}

if (txCashInInput && txCashOutInput) {
  txCashInInput.addEventListener('input', updateCashInputsState);
  txCashOutInput.addEventListener('input', updateCashInputsState);

  if (txBudget) {
    txBudget.addEventListener('change', updateCashInputsState);
  }

  if (addTransactionForm) {
    addTransactionForm.addEventListener('reset', () => {
      setTimeout(updateCashInputsState, 0);
    });
  }
}

// Currency Formatter
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
};

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loadBudgetCategories();
    // Fetch Business Name
    const userDoc = await fsGetDoc(fsDoc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().businessName) {
      userBusinessName.textContent = userDoc.data().businessName;
    } else {
      // Fallback: use Firebase Auth displayName (set at registration)
      userBusinessName.textContent = user.displayName || user.email;
    }

    // Load existing data
    loadTransactions();
  }
});

// Logout Handler
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}

// Handle Add Transaction Form
if (addTransactionForm) {
  addTransactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    txErrorMsg.classList.add('hidden');
    const dateVal = document.getElementById('txDate').value;
    const descVal = document.getElementById('txDesc').value;
    const cashInVal = parseFloat(document.getElementById('txCashIn').value) || 0;
    const cashOutVal = parseFloat(document.getElementById('txCashOut').value) || 0;

    if (cashInVal === 0 && cashOutVal === 0) {
      txErrorMsg.textContent = "Please enter either a Cash In or Cash Out amount.";
      txErrorMsg.classList.remove('hidden');
      return;
    }

    if (cashInVal > 0 && cashOutVal > 0) {
      txErrorMsg.textContent = "A transaction can only be Cash In or Cash Out, not both.";
      txErrorMsg.classList.remove('hidden');
      return;
    }

    try {
      txSubmitBtn.textContent = 'Adding...';
      txSubmitBtn.disabled = true;

      const categoryIdVal = txBudget ? txBudget.value : '';

      // Balance is never stored — it is always computed at render time
      const newTx = {
        date: dateVal,
        description: descVal,
        cashin: cashInVal,
        cashout: cashOutVal,
        categoryId: categoryIdVal
      };

      const txCollection = fsCollection(db, "users", currentUser.uid, "transactions");
      await fsAddDoc(txCollection, newTx);

      // Clear form
      addTransactionForm.reset();

      // Reload table
      await loadTransactions();
    } catch (error) {
      console.error(error);
      txErrorMsg.textContent = 'Error adding transaction: ' + error.message;
      txErrorMsg.classList.remove('hidden');
    } finally {
      txSubmitBtn.textContent = 'Add';
      txSubmitBtn.disabled = false;
    }
  });
}

// Load Data from Firestore
async function loadTransactions() {
  if (!currentUser) return;
  try {
    const txCollection = fsCollection(db, "users", currentUser.uid, "transactions");
    const snapshot = await fsGetDocs(txCollection);
    if (!snapshot.empty) {
      const data = [];
      snapshot.forEach(docSnap => data.push(docSnap.data()));
      renderTransactions(data);
    } else {
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 10px;">No transactions found. Please upload a cash book.</td></tr>';
    }
  } catch (error) {
    console.error("Error loading data from Firestore:", error);
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 10px; color: var(--danger-red);">Error: ${error.message}</td></tr>`;
  }
}

// Render Table
function renderTransactions(data) {
  // Date parsing logic for sorting
  const parseDate = (dateVal) => {
    if (!dateVal) return new Date(0);
    // Handle JS Date object directly
    if (dateVal instanceof Date) return dateVal;
    // Handle Excel serial date
    if (typeof dateVal === 'number') {
      return new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    }
    const str = String(dateVal);
    // Handle DD/MM/YYYY
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  // Format Date for UI
  const formatDateStr = (dateVal) => {
    const d = parseDate(dateVal);
    if (d.getTime() === new Date(0).getTime()) return String(dateVal);
    return d.toLocaleDateString('en-KE');
  };

  // Ensure chronological order
  const sortedData = data.sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  if (tableBody) tableBody.innerHTML = '';
  let runningBalance = 0;

  sortedData.forEach(row => {
    // Parse values, removing any commas/symbols from strings if present
    const cashIn = parseFloat((row.cashin || '0').toString().replace(/,/g, '')) || 0;
    const cashOut = parseFloat((row.cashout || '0').toString().replace(/,/g, '')) || 0;

    // Always compute balance as a running total — never trust a stored balance value
    runningBalance += (cashIn - cashOut);
    const currentBalance = runningBalance;

    const formattedDate = formatDateStr(row.date);

    // Find Category Name
    const category = budgetCategories.find(c => c.id === row.categoryId);
    const categoryDisplay = category ? `<span>${category.name}</span>` : '-';

    // Table population
    if (tableBody) {
      const tr = document.createElement('tr');
      tr.style.borderBottom = "1px solid #ddd";
      tr.innerHTML = `
        <td style="padding: 10px;">${formattedDate}</td>
        <td style="padding: 10px;">${row.description || '-'}</td>
        <td style="padding: 10px;">${categoryDisplay}</td>
        <td style="padding: 10px; color: var(--secondary-green);">${formatCurrency(cashIn)}</td>
        <td style="padding: 10px; color: var(--danger-red);">${formatCurrency(cashOut)}</td>
        <td style="padding: 10px; font-weight: 500;">${formatCurrency(currentBalance)}</td>
      `;
      tableBody.appendChild(tr);
    }
  });
}
