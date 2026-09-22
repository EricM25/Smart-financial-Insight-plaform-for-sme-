import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB0P67eWAa0v9q0Nrw48hjt2IJA5ot-__Y",
  authDomain: "sme-cash-insight.firebaseapp.com",
  projectId: "sme-cash-insight",
  storageBucket: "sme-cash-insight.firebasestorage.app",
  messagingSenderId: "170871147067",
  appId: "1:170871147067:web:9e361dcf12b252398b2a1e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
