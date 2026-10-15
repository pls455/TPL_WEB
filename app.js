import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs, addDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

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
let currentRole = null;
let branchUnsubscribe = null;
let subjectUnsubscribe = null;
let managedBranches = [];
let managedSubjects = [];

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
  stopTaxonomyListeners();
  loginView.hidden = false;
  dashboardView.hidden = true;
  $("account-actions").hidden = true;
}
function showDashboard(user, role) {
  currentUser = user;
  currentRole = role;
  $("management-panel").hidden = !canManageTaxonomy();
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
  if (!user) { stopTaxonomyListeners(); currentUser = null; currentRole = null; showLogin(); return; }
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
    if (canManageTaxonomy()) startTaxonomyListeners();
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


// ---------- Cloud-managed branches and subjects ----------
function canManageTaxonomy() {
  return currentRole === "super_admin" || currentRole === "content_manager";
}

function taxonomyMessage(message, isError = false) {
  const node = $("taxonomy-message");
  node.textContent = message || "";
  node.classList.toggle("error", Boolean(isError));
}

function stopTaxonomyListeners() {
  if (branchUnsubscribe) branchUnsubscribe();
  if (subjectUnsubscribe) subjectUnsubscribe();
  branchUnsubscribe = null;
  subjectUnsubscribe = null;
}

function startTaxonomyListeners() {
  stopTaxonomyListeners();
  if (!canManageTaxonomy()) return;
  taxonomyMessage("جارٍ تحميل الفروع والمواد...");
  branchUnsubscribe = onSnapshot(collection(db, "branches"), (snapshot) => {
    managedBranches = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        name: String(data.name || ""),
        active: data.active === true,
        order: Number.isFinite(Number(data.order)) ? Number(data.order) : 9999
      };
    }).filter((item) => item.name.trim()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
    renderBranches();
    renderBranchChoices();
  }, (error) => {
    console.error("Branch management read failed:", error);
    taxonomyMessage("تعذّرت قراءة الفروع. تحقق من نشر Firestore Rules وصلاحية مدير المحتوى.", true);
  });

  subjectUnsubscribe = onSnapshot(collection(db, "subjects"), (snapshot) => {
    managedSubjects = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        name: String(data.name || ""),
        active: data.active === true,
        branchIds: Array.isArray(data.branchIds) ? data.branchIds.filter((id) => typeof id === "string") : [],
        order: Number.isFinite(Number(data.order)) ? Number(data.order) : 9999
      };
    }).filter((item) => item.name.trim()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
    renderSubjects();
  }, (error) => {
    console.error("Subject management read failed:", error);
    taxonomyMessage("تعذّرت قراءة المواد. تحقق من قواعد Firestore وصلاحية مدير المحتوى.", true);
  });
}

function makeManagerButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className || "button-mini";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderBranches() {
  $("branch-total").textContent = String(managedBranches.length);
  const list = $("branches-list");
  list.replaceChildren();
  if (!managedBranches.length) {
    const empty = document.createElement("div");
    empty.className = "manager-empty";
    empty.textContent = "لا توجد فروع بعد. أضف أول فرع من النموذج أعلاه.";
    list.appendChild(empty);
    return;
  }
  for (const branch of managedBranches) {
    const row = document.createElement("div");
    row.className = "manager-row";
    const main = document.createElement("div");
    main.className = "manager-row-main";
    const title = document.createElement("span");
    title.className = "manager-row-title";
    title.textContent = branch.name;
    const meta = document.createElement("span");
    meta.className = "manager-row-meta";
    meta.textContent = "ترتيب العرض: " + branch.order + " · " + (branch.active ? "يظهر للطلاب" : "موقوف عن الطلاب");
    main.append(title, meta);
    const status = document.createElement("span");
    status.className = "manager-status" + (branch.active ? "" : " inactive");
    status.textContent = branch.active ? "نشط" : "معطّل";
    const actions = document.createElement("div");
    actions.className = "manager-row-actions";
    actions.append(
      makeManagerButton("تعديل", "button-mini", () => beginBranchEdit(branch)),
      makeManagerButton(branch.active ? "تعطيل" : "تفعيل", "button-mini" + (branch.active ? " danger" : ""), () => toggleBranch(branch))
    );
    row.append(main, status, actions);
    list.appendChild(row);
  }
}

function renderBranchChoices(selectedIds = null) {
  const container = $("subject-branch-options");
  const remembered = selectedIds ?? Array.from(container.querySelectorAll('input[name="subject-branch"]:checked')).map((input) => input.value);
  container.replaceChildren();
  if (!managedBranches.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "أضف فرعًا أولًا، ثم اربط المواد به.";
    container.appendChild(empty);
    return;
  }
  for (const branch of managedBranches) {
    const label = document.createElement("label");
    label.className = "branch-choice";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "subject-branch";
    input.value = branch.id;
    input.checked = remembered.includes(branch.id);
    const text = document.createElement("span");
    text.textContent = branch.name + (branch.active ? "" : " (معطّل)");
    label.append(input, text);
    container.appendChild(label);
  }
}

function renderSubjects() {
  $("subject-total").textContent = String(managedSubjects.length);
  const list = $("subjects-list");
  list.replaceChildren();
  if (!managedSubjects.length) {
    const empty = document.createElement("div");
    empty.className = "manager-empty";
    empty.textContent = "لا توجد مواد بعد. أضف مادة واربطها بفرع واحد أو أكثر.";
    list.appendChild(empty);
    return;
  }
  for (const subject of managedSubjects) {
    const row = document.createElement("div");
    row.className = "manager-row";
    const main = document.createElement("div");
    main.className = "manager-row-main";
    const title = document.createElement("span");
    title.className = "manager-row-title";
    title.textContent = subject.name;
    const names = subject.branchIds.map((id) => managedBranches.find((item) => item.id === id)?.name || "فرع غير معروف");
    const meta = document.createElement("span");
    meta.className = "manager-row-meta";
    meta.textContent = "الفروع: " + (names.length ? names.join("، ") : "لم يتم ربطها بأي فرع") + " · الترتيب: " + subject.order;
    main.append(title, meta);
    const status = document.createElement("span");
    status.className = "manager-status" + (subject.active ? "" : " inactive");
    status.textContent = subject.active ? "نشطة" : "معطّلة";
    const actions = document.createElement("div");
    actions.className = "manager-row-actions";
    actions.append(
      makeManagerButton("تعديل", "button-mini", () => beginSubjectEdit(subject)),
      makeManagerButton(subject.active ? "تعطيل" : "تفعيل", "button-mini" + (subject.active ? " danger" : ""), () => toggleSubject(subject))
    );
    row.append(main, status, actions);
    list.appendChild(row);
  }
}

function beginBranchEdit(branch) {
  $("branch-edit-id").value = branch.id;
  $("branch-name").value = branch.name;
  $("branch-order").value = String(branch.order === 9999 ? 1 : branch.order);
  $("branch-submit").textContent = "حفظ التعديلات";
  $("branch-cancel").hidden = false;
  $("branch-name").focus();
}

function resetBranchForm() {
  $("branch-form").reset();
  $("branch-edit-id").value = "";
  $("branch-order").value = String(managedBranches.length + 1);
  $("branch-submit").textContent = "إضافة فرع";
  $("branch-cancel").hidden = true;
}

function beginSubjectEdit(subject) {
  $("subject-edit-id").value = subject.id;
  $("subject-name").value = subject.name;
  $("subject-order").value = String(subject.order === 9999 ? 1 : subject.order);
  renderBranchChoices(subject.branchIds);
  $("subject-submit").textContent = "حفظ التعديلات";
  $("subject-cancel").hidden = false;
  $("subject-name").focus();
}

function resetSubjectForm() {
  $("subject-form").reset();
  $("subject-edit-id").value = "";
  $("subject-order").value = String(managedSubjects.length + 1);
  $("subject-submit").textContent = "إضافة مادة";
  $("subject-cancel").hidden = true;
  renderBranchChoices([]);
}

async function toggleBranch(branch) {
  if (!canManageTaxonomy()) return;
  try {
    await updateDoc(doc(db, "branches", branch.id), { active: !branch.active, updatedAt: serverTimestamp() });
    taxonomyMessage(branch.active ? "تم تعطيل الفرع. سيختفي من تطبيق الطلاب دون حذف المواد المرتبطة." : "تم تفعيل الفرع وسيظهر للطلاب.");
  } catch (error) {
    console.error("Branch update failed:", error);
    taxonomyMessage("لم يتم تغيير حالة الفرع. تحقق من الصلاحيات والاتصال.", true);
  }
}

async function toggleSubject(subject) {
  if (!canManageTaxonomy()) return;
  try {
    await updateDoc(doc(db, "subjects", subject.id), { active: !subject.active, updatedAt: serverTimestamp() });
    taxonomyMessage(subject.active ? "تم تعطيل المادة وإخفاؤها عن الطلاب." : "تم تفعيل المادة.");
  } catch (error) {
    console.error("Subject update failed:", error);
    taxonomyMessage("لم يتم تغيير حالة المادة. تحقق من الصلاحيات والاتصال.", true);
  }
}

$("branch-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageTaxonomy() || !currentUser) return;
  const id = $("branch-edit-id").value;
  const name = $("branch-name").value.trim();
  const order = Number($("branch-order").value);
  if (!name || !Number.isInteger(order) || order < 0) {
    taxonomyMessage("اكتب اسم الفرع وترتيبًا صحيحًا.", true);
    return;
  }
  if (managedBranches.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.id !== id)) {
    taxonomyMessage("يوجد فرع بهذا الاسم بالفعل. عدّل الفرع الموجود بدل تكراره.", true);
    return;
  }
  const button = $("branch-submit");
  button.disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, "branches", id), { name, order, updatedAt: serverTimestamp() });
      taxonomyMessage("تم حفظ الفرع. سيحدّث تطبيق الطلاب قائمته تلقائيًا.");
    } else {
      await addDoc(collection(db, "branches"), {
        name, order, active: true, createdBy: currentUser.uid,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      taxonomyMessage("تمت إضافة الفرع ونشره للطلاب.");
    }
    resetBranchForm();
  } catch (error) {
    console.error("Branch save failed:", error);
    taxonomyMessage("تعذّر حفظ الفرع. تأكد من أن حسابك مدير عام أو مدير محتوى وأن Firestore Rules منشورة.", true);
  } finally {
    button.disabled = false;
  }
});

$("branch-cancel").addEventListener("click", resetBranchForm);

$("subject-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageTaxonomy() || !currentUser) return;
  const id = $("subject-edit-id").value;
  const name = $("subject-name").value.trim();
  const order = Number($("subject-order").value);
  const branchIds = Array.from(document.querySelectorAll('input[name="subject-branch"]:checked')).map((input) => input.value);
  if (!name || !Number.isInteger(order) || order < 0) {
    taxonomyMessage("اكتب اسم المادة وترتيبًا صحيحًا.", true);
    return;
  }
  if (!branchIds.length) {
    taxonomyMessage("اربط المادة بفرع واحد على الأقل.", true);
    return;
  }
  if (managedSubjects.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.id !== id)) {
    taxonomyMessage("توجد مادة بهذا الاسم بالفعل. افتحها للتعديل وأضف الفروع إليها بدل إنشاء نسخة مكررة.", true);
    return;
  }
  const button = $("subject-submit");
  button.disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, "subjects", id), { name, order, branchIds, updatedAt: serverTimestamp() });
      taxonomyMessage("تم حفظ المادة وربطها بالفروع المحددة.");
    } else {
      await addDoc(collection(db, "subjects"), {
        name, order, branchIds, active: true, createdBy: currentUser.uid,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      taxonomyMessage("تمت إضافة المادة. ستظهر تلقائيًا في فروعها داخل التطبيق.");
    }
    resetSubjectForm();
  } catch (error) {
    console.error("Subject save failed:", error);
    taxonomyMessage("تعذّر حفظ المادة. تحقق من صلاحيات مدير المحتوى وقواعد Firestore.", true);
  } finally {
    button.disabled = false;
  }
});

$("subject-cancel").addEventListener("click", resetSubjectForm);
