//dependencies needed for user authentication and database operations.
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Document Object Model Elements gets information from index.html file to change it
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const toggleFormLink = document.getElementById('toggleFormLink');
const toggleText = document.getElementById('toggleText');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

// Change Between Login and Register Forms
//load login page first
let isLogin = true;
//
const toggleMessage = document.getElementById('toggleMessage');

// check user click the login or register
if (toggleFormLink) {
  toggleFormLink.addEventListener('click', (e) => {
    //
    e.preventDefault(); // Prevent reloading the page when clicking the link
    isLogin = !isLogin; // Toggle between login and register forms


    if (isLogin) {
      loginForm.classList.remove('hidden'); //hide the register form
      registerForm.classList.add('hidden'); //show the register form
      if (toggleMessage) toggleMessage.textContent = "Don't have an account?";
      toggleFormLink.textContent = "Register here";
    } else {
      loginForm.classList.add('hidden');//hide the login form
      registerForm.classList.remove('hidden');//show the login form
      if (toggleMessage) toggleMessage.textContent = "Already have an account?";
      toggleFormLink.textContent = "Log in here";
    }
  });
}

// Handle Registration
if (registerForm) {
  //prevents runtime errors on pages that don’t have a registration form
  registerForm.addEventListener('submit', async (e) => { //prevents runtime errors on pages that don’t have a registration form
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const btn = document.getElementById('registerBtn');

    try {
      btn.textContent = 'Creating...';
      btn.disabled = true;
      registerError.classList.add('hidden');

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Save business name to Firebase Auth profile 
      await updateProfile(user, { displayName: name });

      // Also store in Firestore for richer user data
      await setDoc(doc(db, "users", user.uid), {
        businessName: name,
        email: email,
        createdAt: new Date().toISOString()
      });

      // Redirect to dashboard
      window.location.href = 'dashboard.html';
    } catch (error) {
      registerError.textContent = error.message;
      registerError.classList.remove('hidden');
    } finally {
      btn.textContent = 'Create Account';
      btn.disabled = false;
    }
  });
}

// Handle Login
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');

    try {
      btn.textContent = 'Logging in...';
      btn.disabled = true;
      loginError.classList.add('hidden');

      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'dashboard.html';
    } catch (error) {
      loginError.textContent = 'Invalid email or password.';
      loginError.classList.remove('hidden');
    } finally {
      btn.textContent = 'Log In';
      btn.disabled = false;
    }
  });
}

// Check Auth State on page load
onAuthStateChanged(auth, (user) => {
  const currentPath = window.location.pathname;// current page path to determine if user is on a public or protected page

  const isPublicPage = currentPath.endsWith('index.html') || currentPath.endsWith('/');// Check if the it a haome page rep by /
  const isProtectedPage = currentPath.endsWith('dashboard.html') ||
    currentPath.endsWith('transactions.html') ||
    currentPath.endsWith('budget.html') ||
    currentPath.endsWith('upload.html') ||
    currentPath.endsWith('chatbot.html');

  // If user is logged in and on index page, redirect to dashboard
  if (user && isPublicPage) {
    window.location.href = 'dashboard.html';
  }
  // If user is not logged in and on a protected page, redirect to index
  if (!user && isProtectedPage) {
    window.location.href = 'index.html';
  }
});
