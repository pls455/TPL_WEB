import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// Firebase web configuration identifies the project; it is not an Admin SDK credential.
// Never put service-account keys or Dbrij access secrets in this file.
const firebaseConfig = {
  apiKey: "AIzaSyBLrH0yYSJEm50z2HusQI3D2HGjusNccFU",
  authDomain: "tpl-38d2e.firebaseapp.com",
  projectId: "tpl-38d2e",
  storageBucket: "tpl-38d2e.firebasestorage.app",
  messagingSenderId: "61246778282",
  appId: "1:61246778282:web:3f55d12d32281ebf3659d3"
};
const SUPER_ADMIN_UID = "ZbkBsAAjdccepK8mrmf3jfgrqdR2";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const loginView = $("login-view");
const dashboardView = $("dashboard-view");
const loginForm = $("login-form");
const loginButton = $("login-button");
let currentUser = null;

const roleNames = {
  super_admin: "المدير العام",
  content_manager: "مدير محتوى",
  academic_reviewer: "مراجع أكاديمي",
  sponsored_ads_manager: "مدير الإعلانات",
  content_contributor: "مساهم محتوى",
  technical_support: "الدعم الفني"
};
const statusNames = {
  draft: "مسودة", pending_review: "بانتظار المراجعة", needs_changes: "تحتاج تعديل",
  approved: "معتمدة", published: "منشورة", archived: "مؤرشفة"
};
function showMessage(message, success = false) {
  $("login-message").textContent = message;
  $("login-message").style.color = success ? "#236244" : "#9b3737";
}
function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  $("account-actions").hidden = true;
}
function showDashboard(user, role) {
  currentUser = user;
  loginView.hidden = true;
  dashboardView.hidden = false;
  $("account-actions").hidden = false;
  $("user-email").textContent = user.email || "حساب الإدارة";
  $("role-pill").textContent = roleNames[role] || role;
}
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "جارٍ التحقق...";
  showMessage("");
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (error) {
    showMessage(authErrorMessage(error.code));
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "دخول إلى اللوحة";
  }
});
$("sign-out").addEventListener("click", () => signOut(auth));
$("refresh-button").addEventListener("click", () => loadDashboard(currentUser));

onAuthStateChanged(auth, async (user) => {
  if (!user) { currentUser = null; showLogin(); return; }
  currentUser = user;
  try {
    const role = user.uid === SUPER_ADMIN_UID ? "super_admin" : await readRole(user.uid);
    if (!role) {
      await signOut(auth);
      showLogin();
      showMessage("تم تسجيل الدخول، لكن هذا الحساب غير مخوّل للوصول إلى لوحة الإدارة.");
      return;
    }
    showDashboard(user, role);
    await loadDashboard(user);
  } catch (error) {
    $("status-banner").textContent = "تعذّر التحقق من الصلاحيات أو قراءة البيانات. راجع إعدادات Firestore Rules. لن تُمنح صلاحيات من الواجهة.";
    console.error("TPL admin initialization failed:", error);
  }
});
async function readRole(uid) {
  const snap = await getDoc(doc(db, "adminUsers", uid));
  if (!snap.exists() || snap.data().active === false) return null;
  return snap.data().role || null;
}
async function loadDashboard(user) {
  if (!user) return;
  $("status-banner").textContent = "تم التحقق من الحساب. يجري تحميل ملخص الموارد من Firestore.";
  try {
    const publishedQuery = query(collection(db, "resources"), where("status", "==", "published"), limit(100));
    const publishedSnap = await getDocs(publishedQuery);
    $("published-count").textContent = String(publishedSnap.size);
    const pendingQuery = query(collection(db, "resources"), where("status", "==", "pending_review"), limit(100));
    try {
      const pendingSnap = await getDocs(pendingQuery);
      $("pending-count").textContent = String(pendingSnap.size);
    } catch { $("pending-count").textContent = "—"; }
    try {
      const reportsQuery = query(collection(db, "reports"), where("status", "==", "open"), limit(100));
      const reportsSnap = await getDocs(reportsQuery);
      $("reports-count").textContent = String(reportsSnap.size);
    } catch { $("reports-count").textContent = "—"; }
    renderResources(publishedSnap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 10));
    $("status-banner").textContent = "تم تحميل البيانات المتاحة. عدد العناصر المعروض محدود، ولا يتم عرض روابط التخزين الخاصة.";
  } catch (error) {
    console.error("Resource loading failed:", error);
    $("status-banner").textContent = "تم تسجيل الدخول، لكن قراءة الموارد غير متاحة بعد. تأكد من نشر قواعد Firestore الآمنة وإنشاء بيانات أولية معتمدة.";
    $("published-count").textContent = "—";
    $("pending-count").textContent = "—";
    $("reports-count").textContent = "—";
    $("resources-body").innerHTML = '<tr><td colspan="4" class="empty-state">لا توجد بيانات متاحة أو أن قواعد القراءة لم تُضبط بعد.</td></tr>';
  }
}
function renderResources(resources) {
  const tbody = $("resources-body");
  tbody.replaceChildren();
  if (!resources.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">لا توجد موارد منشورة حتى الآن.</td></tr>';
    return;
  }
  for (const item of resources) {
    const tr = document.createElement("tr");
    for (const value of [item.title || "بدون عنوان", item.subjectName || item.subjectId || "—", item.type || "—"]) {
      const td = document.createElement("td"); td.textContent = value; tr.appendChild(td);
    }
    const statusCell = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "status-tag" + (item.status === "published" ? " published" : "");
    tag.textContent = statusNames[item.status] || item.status || "—";
    statusCell.appendChild(tag); tr.appendChild(statusCell); tbody.appendChild(tr);
  }
}
function authErrorMessage(code) {
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "بيانات الدخول غير صحيحة.";
  if (code === "auth/too-many-requests") return "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.";
  if (code === "auth/network-request-failed") return "تعذّر الاتصال. تحقق من الإنترنت.";
  return "تعذّر تسجيل الدخول. تحقق من الحساب وإعدادات Firebase.";
}
