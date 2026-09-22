import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc as fsDoc, getDoc as fsGetDoc, setDoc as fsSetDoc, collection as fsCollection, getDocs as fsGetDocs, deleteDoc as fsDeleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Document Object Model Elements
const userBusinessName = document.getElementById('userBusinessName');
const logoutBtn = document.getElementById('logoutBtn');
const excelUpload = document.getElementById('excelUpload');
const uploadStatus = document.getElementById('uploadStatus');
const downloadExcelBtn = document.getElementById('downloadExcelBtn');
const downloadStatus = document.getElementById('downloadStatus');

let currentUser = null;

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    // Fetch Business Name
    const userDoc = await fsGetDoc(fsDoc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().businessName) {
      userBusinessName.textContent = userDoc.data().businessName;
    } else {
      // Fallback: use Firebase Auth displayName (set at registration)
      userBusinessName.textContent = user.displayName || user.email;
    }
  }
});

// Logout Handler
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}

// Excel File Upload Handler
if (excelUpload) {
  excelUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Guard clause
    if (!currentUser) {
      uploadStatus.textContent = 'Please wait for authentication to finish.';
      uploadStatus.style.color = 'var(--danger-red)';
      return;
    }

    uploadStatus.textContent = 'Parsing Excel file...';
    uploadStatus.style.color = 'var(--primary-blue)';

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Assume first sheet is the one we want
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        // Normalize keys (handle spaces and case differences securely)
        const normalizedData = rawJson.map(row => {
          const newRow = {};
          for (let key in row) {
            const lowerKey = key.trim().toLowerCase();
            if (lowerKey.includes('date')) newRow['date'] = row[key];
            else if (lowerKey.includes('desc')) newRow['description'] = row[key];
            else if (lowerKey.replace(/\s+/g, '') === 'cashin' || lowerKey.includes('inflow')) newRow['cashin'] = row[key];
            else if (lowerKey.replace(/\s+/g, '') === 'cashout' || lowerKey.includes('outflow')) newRow['cashout'] = row[key];
            else if (lowerKey.includes('balance')) newRow['balance'] = row[key];
            else newRow[lowerKey.replace(/\s+/g, '')] = row[key];
          }
          return newRow;
        });

        // Filter out empty rows — balance column no longer required; computed at render time
        const validData = normalizedData.filter(row => row.date && (row.cashin !== undefined || row.cashout !== undefined));

        if (validData.length === 0) {
          throw new Error("No valid data found. Ensure columns include: Date, Description, Cash In, Cash Out.");
        }

        uploadStatus.textContent = 'Clearing old data...';

        // Store each row as a document in a subcollection
        const txCollection = fsCollection(db, "users", currentUser.uid, "transactions");
        const existingDocs = await fsGetDocs(txCollection);

        const deletePromises = [];
        existingDocs.forEach(docSnap => {
          deletePromises.push(fsDeleteDoc(docSnap.ref));
        });
        await Promise.all(deletePromises);

        uploadStatus.textContent = 'Saving to Firestore...';
        const addPromises = [];
        validData.forEach(row => {
          addPromises.push(fsSetDoc(fsDoc(txCollection), row));
        });
        await Promise.all(addPromises);

        uploadStatus.textContent = 'Upload successful! Redirecting to Dashboard...';
        uploadStatus.style.color = 'var(--secondary-green)';

        // Clear file input
        excelUpload.value = '';

        // Redirect to Dashboard to view the newly uploaded data
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1500);

      } catch (error) {
        console.error(error);
        uploadStatus.textContent = 'Error: ' + error.message;
        uploadStatus.style.color = 'var(--danger-red)';
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Excel File Download Handler
if (downloadExcelBtn) {
  downloadExcelBtn.addEventListener('click', async () => {
    if (!currentUser) {
      downloadStatus.textContent = 'Please wait for authentication...';
      downloadStatus.style.color = 'var(--danger-red)';
      return;
    }

    downloadStatus.textContent = 'Preparing download...';
    downloadStatus.style.color = 'var(--primary-blue)';

    try {
      const txCollection = fsCollection(db, "users", currentUser.uid, "transactions");
      const txDocs = await fsGetDocs(txCollection);

      const transactions = [];
      txDocs.forEach(docSnap => {
        transactions.push(docSnap.data());
      });

      if (transactions.length === 0) {
        downloadStatus.textContent = 'No transactions found to download.';
        downloadStatus.style.color = 'var(--danger-red)';
        return;
      }

      // Sort transactions chronologically before computing balance
      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Compute running balance at export time — system always calculates this
      let exportRunningBalance = 0;
      const formattedData = transactions.map(tx => {
        const cashIn = parseFloat((tx.cashin || '0').toString().replace(/,/g, '')) || 0;
        const cashOut = parseFloat((tx.cashout || '0').toString().replace(/,/g, '')) || 0;
        exportRunningBalance += (cashIn - cashOut);
        return {
          'Date': tx.date || '',
          'Description': tx.description || '',
          'Cash In': cashIn,
          'Cash Out': cashOut,
          'Balance': exportRunningBalance
        };
      });

      // Sort by date (assuming YYYY-MM-DD format if parsed properly, otherwise just by string)
      formattedData.sort((a, b) => new Date(a.Date) - new Date(b.Date));

      const worksheet = XLSX.utils.json_to_sheet(formattedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");

      // XLSX is available globally from the CDN script
      XLSX.writeFile(workbook, "SME_Transactions.xlsx");

      downloadStatus.textContent = 'Download complete!';
      downloadStatus.style.color = 'var(--secondary-green)';

      setTimeout(() => {
        downloadStatus.textContent = '';
      }, 3000);

    } catch (error) {
      console.error(error);
      downloadStatus.textContent = 'Error: ' + error.message;
      downloadStatus.style.color = 'var(--danger-red)';
    }
  });
}
