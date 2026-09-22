
import { auth, db } from './firebase-config.js';//imports to load Firebase services and your local Firebase configuration.
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";//It runs the callback and listens for login state changes.
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";//This imports Firestore database functions.

// Constants

const STORAGE_KEY_PREFIX = 'sme_budget_categories_';//creates a variable whose binding cannot be reassigned.

// State

let categories = [];//Stores the budget categories currently loaded from localStorage and Firestore Later, it may contain objects.
let editingId = null;//Stores the ID of the category currently being edited.
let currentUser = null;//Stores the currently authenticated user object from Firebase Authentication.
let transactions = [];//Stores the transactions loaded from Firestore for calculating budget usage.

// --- Document Object Module Elements ---

const categoriesGrid = document.getElementById('categoriesGrid');
const emptyState = document.getElementById('emptyState');
const deleteModal = document.getElementById('deleteModal');
const categoryForm = document.getElementById('categoryForm');
const formTitle = document.getElementById('formTitle');
const editCategoryId = document.getElementById('editCategoryId');
const saveCategoryBtn = document.getElementById('saveCategoryBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

// Form fields
const categoryName = document.getElementById('categoryName');
const budgetLimit = document.getElementById('budgetLimit');
// Error fields
const nameError = document.getElementById('nameError');
const limitError = document.getElementById('limitError');

// Summary stats
const totalCategories = document.getElementById('totalCategories');
const totalExpenseBudget = document.getElementById('totalExpenseBudget');
const totalIncomeBudget = document.getElementById('totalIncomeBudget');

// Buttons
const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const deleteCategoryName = document.getElementById('deleteCategoryName');



// ─────────────────────────────────────────────
// Auth: Business name display + logout
// ─────────────────────────────────────────────

const userBusinessName = document.getElementById('userBusinessName');
const logoutBtn = document.getElementById('logoutBtn');

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loadCategories();
    renderCategories();
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists() && userDoc.data().businessName) {
        userBusinessName.textContent = userDoc.data().businessName;
      } else {
        userBusinessName.textContent = user.displayName || user.email;
      }
    } catch {
      userBusinessName.textContent = user.displayName || user.email;
    }
    await loadTransactions();
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}

// ─────────────────────────────────────────────
// Data Layer (localStorage + API placeholders)
// ─────────────────────────────────────────────

async function loadTransactions() {
  if (!currentUser) return;
  try {
    const txCollection = collection(db, "users", currentUser.uid, "transactions");
    const snapshot = await getDocs(txCollection);
    transactions = [];
    snapshot.forEach(docSnap => {
      transactions.push(docSnap.data());
    });
    renderCategories();
  } catch (error) {
    console.error("Failed to load transactions", error);
  }
}

/**
 * Load categories from localStorage.
 */
function loadCategories() {
  if (!currentUser) {
    categories = [];
    return;
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${currentUser.uid}`);
    categories = raw ? JSON.parse(raw) : [];
  } catch {
    categories = [];
  }
}

/**
 * Persist categories to localStorage.
 * PLACEHOLDER: Replace with API call, e.g.:
 *   await fetch('/api/budget-categories', { method: 'PUT', body: JSON.stringify(categories) });
 */
function saveCategories() {
  if (!currentUser) return;
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${currentUser.uid}`, JSON.stringify(categories));
}

/**
 * Generate a unique ID for a new category.
 */
function generateId() {
  return 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ─────────────────────────────────────────────
// Rendering: Cards + Summary + Empty State
// ─────────────────────────────────────────────

function formatCurrency(amount) {
  return 'KSh ' + Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function renderCategories() {
  if (categories.length === 0) {
    categoriesGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');
  } else {
    categoriesGrid.classList.remove('hidden');
    emptyState.classList.add('hidden');
  }

  categoriesGrid.innerHTML = categories.map(cat => {
    let spent = 0;
    transactions.forEach(tx => {
      if (tx.categoryId === cat.id) {
        if (cat.type === 'expense') {
          spent += parseFloat(tx.cashout || 0);
        } else {
          spent += parseFloat(tx.cashin || 0);
        }
      }
    });
    const percent = Math.min(100, Math.round((spent / cat.limit) * 100));

    return `
        <div class="budget-card" style="border-top: 4px solid var(--primary-blue, #0033A0);" data-id="${cat.id}">
          <div class="budget-card-header" style="align-items: center; margin-bottom: 0.5rem;">
            <h4 class="budget-card-name" style="margin-bottom: 0;">${escapeHtml(cat.name)}</h4>
            <div class="budget-card-actions">
              <button class="budget-card-action-btn edit-btn" data-id="${cat.id}" title="Edit category" aria-label="Edit ${cat.name}">
                Edit
              </button>
              <button class="budget-card-action-btn delete-btn" data-id="${cat.id}" title="Delete category" aria-label="Delete ${cat.name}">
                Del
              </button>
            </div>
          </div>
          <div class="budget-card-limit">${formatCurrency(cat.limit)}<span class="budget-card-period"> / month</span></div>
          <span class="budget-card-type-badge ${cat.type === 'expense' ? 'badge-expense' : 'badge-income'}">
            ${cat.type === 'expense' ? 'Expense' : 'Income / Savings'}
          </span>
          <div style="width: 100%; height: 8px; background: #eee; border-radius: 4px; margin-top: 15px;">
            <div style="width: ${percent}%; height: 100%; background: var(--primary-blue, #0033A0); border-radius: 4px;"></div>
          </div>
          <div style="font-size: 12px; margin-top: 5px; color: #555; display: flex; justify-content: space-between;">
            <span>Used: ${formatCurrency(spent)}</span>
            <span>Left: ${formatCurrency(cat.limit - spent)}</span>
          </div>
        </div>
      `;
  }).join('');

  categoriesGrid.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editCategory(btn.dataset.id);
    });
  });

  categoriesGrid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id);
    });
  });
}


function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateSummary() {
  totalCategories.textContent = categories.length;

  const expenseSum = categories
    .filter(c => c.type === 'expense')
    .reduce((sum, c) => sum + Number(c.limit), 0);

  const incomeSum = categories
    .filter(c => c.type === 'income')
    .reduce((sum, c) => sum + Number(c.limit), 0);

  totalExpenseBudget.textContent = formatCurrency(expenseSum);
  totalIncomeBudget.textContent = formatCurrency(incomeSum);
}

// ─────────────────────────────────────────────
// Modal Handling
// ─────────────────────────────────────────────

function resetForm() {
  editingId = null;
  editCategoryId.value = '';
  formTitle.textContent = 'Add New Category';
  saveCategoryBtn.textContent = 'Add';
  cancelEditBtn.classList.add('hidden');
  categoryForm.reset();
  clearAllErrors();
}

function editCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;

  editingId = id;
  editCategoryId.value = id;
  formTitle.textContent = 'Edit Category';
  saveCategoryBtn.textContent = 'Update';
  cancelEditBtn.classList.remove('hidden');

  categoryName.value = cat.name;
  budgetLimit.value = cat.limit;
  clearAllErrors();
  categoryName.focus();
}

let deleteTargetId = null;

function openDeleteModal(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;

  deleteTargetId = id;
  deleteCategoryName.textContent = cat.name;
  showModal(deleteModal);
}

function showModal(modal) {
  modal.classList.remove('hidden');
  // Trigger animation
  requestAnimationFrame(() => {
    modal.classList.add('visible');
  });
  document.body.style.overflow = 'hidden';
}

function hideModal(modal) {
  modal.classList.remove('visible');
  setTimeout(() => {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }, 250);
}


// Validation


function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

function clearAllErrors() {
  [nameError, limitError].forEach(el => hideError(el));
}

function validateForm() {
  let valid = true;
  clearAllErrors();

  const name = categoryName.value.trim();
  const limit = budgetLimit.value;
  if (!name) {
    showError(nameError, 'Category name is required.');
    valid = false;
  } else if (name.length < 2) {
    showError(nameError, 'Name must be at least 2 characters.');
    valid = false;
  } else {
    // Check for duplicate names (excluding current if editing)
    const duplicate = categories.find(c =>
      c.name.toLowerCase() === name.toLowerCase() && c.id !== editingId
    );
    if (duplicate) {
      showError(nameError, 'A category with this name already exists.');
      valid = false;
    }
  }

  if (!limit || Number(limit) <= 0) {
    showError(limitError, 'Please enter a positive budget amount.');
    valid = false;
  } else if (Number(limit) > 100000000) {
    showError(limitError, 'Budget limit seems too high. Please verify.');
    valid = false;
  }

  return valid;
}



function addCategory(data) {
  const newCat = {
    id: generateId(),
    name: data.name,
    limit: Number(data.limit),
    type: 'expense',
    createdAt: new Date().toISOString()
  };
  categories.push(newCat);
  saveCategories();
  renderCategories();
}

function updateCategory(id, data) {
  const index = categories.findIndex(c => c.id === id);
  if (index === -1) return;

  categories[index] = {
    ...categories[index],
    name: data.name,
    limit: Number(data.limit),
    type: data.type,
    updatedAt: new Date().toISOString()
  };
  saveCategories();
  renderCategories();
}

function deleteCategory(id) {
  categories = categories.filter(c => c.id !== id);
  saveCategories();
  renderCategories();
}


// Event Listeners


// Close modals
closeDeleteModalBtn.addEventListener('click', () => hideModal(deleteModal));
cancelDeleteBtn.addEventListener('click', () => hideModal(deleteModal));

// Cancel edit form
cancelEditBtn.addEventListener('click', resetForm);

// Click overlay to close
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) hideModal(deleteModal);
});

// Escape key to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!deleteModal.classList.contains('hidden')) hideModal(deleteModal);
  }
});

// Form submission (add / edit)
categoryForm.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!validateForm()) return;

  const data = {
    name: categoryName.value.trim(),
    limit: budgetLimit.value
  };

  if (editingId) {
    updateCategory(editingId, data);
  } else {
    addCategory(data);
  }

  resetForm();
});

// Delete confirmation
confirmDeleteBtn.addEventListener('click', () => {
  if (deleteTargetId) {
    deleteCategory(deleteTargetId);
    deleteTargetId = null;
  }
  hideModal(deleteModal);
});



