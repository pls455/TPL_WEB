import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs, addDoc, updateDoc, deleteDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-storage.js";

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
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const $ = (id) => document.getElementById(id);
const loginView = $("login-view");
const dashboardView = $("dashboard-view");
const loginForm = $("login-form");
const loginButton = $("login-button");
let currentUser = null;
let currentRole = null;
let branchUnsubscribe = null;
let subjectUnsubscribe = null;
let resourceUnsubscribe = null;
let managedBranches = [];
let managedSubjects = [];
let managedResources = [];

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
function openFormDisclosure(formId) {
  const disclosure = $(formId)?.closest("details.form-disclosure");
  if (disclosure) disclosure.open = true;
}
function closeFormDisclosure(formId) {
  const disclosure = $(formId)?.closest("details.form-disclosure");
  if (disclosure) disclosure.open = false;
}
function showMessage(message, success = false) {
  $("login-message").textContent = message;
  $("login-message").style.color = success ? "#236244" : "#9b3737";
}
function showLogin() {
  stopTaxonomyListeners();
  const navigation = $("admin-navigation");
  if (navigation) navigation.hidden = true;
  loginView.hidden = false;
  dashboardView.hidden = true;
  $("account-actions").hidden = true;
}
function showDashboard(user, role) {
  currentUser = user;
  currentRole = role;
  $("management-panel").hidden = !canAccessResourceManagement();
  const taxonomyControls = $("taxonomy-controls");
  if (taxonomyControls) taxonomyControls.hidden = !canManageTaxonomy();
  const managementHeading = $("management-panel").querySelector(".panel-heading");
  if (managementHeading) managementHeading.hidden = !canManageTaxonomy();
  loginView.hidden = true;
  dashboardView.hidden = false;
  $("account-actions").hidden = false;
  $("user-email").textContent = user.email || "حساب الإدارة";
  $("role-pill").textContent = roleNames[role] || role;
  configureAdminNavigation();
  resetResourceForm();
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
    if (canAccessResourceManagement()) startTaxonomyListeners();
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
const adminPageLabels = {
  overview: "نظرة عامة",
  taxonomy: "الفروع والمواد",
  resources: "الموارد",
  curriculum: "المنهج والاختبارات",
  team: "الفريق والبلاغات"
};
function canOpenCatalog() {
  return ["super_admin", "content_manager", "academic_reviewer"].includes(currentRole);
}
function canOpenOperations() {
  return ["super_admin", "content_manager", "academic_reviewer", "technical_support"].includes(currentRole);
}
function configureAdminNavigation() {
  const navigation = $("admin-navigation");
  if (!navigation) return;
  navigation.hidden = false;
  navigation.querySelector('[data-admin-page="taxonomy"]').hidden = !canManageTaxonomy();
  navigation.querySelector('[data-admin-page="resources"]').hidden = !canAccessResourceManagement();
  navigation.querySelector('[data-admin-page="curriculum"]').hidden = !canOpenCatalog();
  navigation.querySelector('[data-admin-page="team"]').hidden = !canOpenOperations();
  navigation.querySelectorAll("[data-admin-page]").forEach((button) => {
    if (!button.dataset.bound) {
      button.dataset.bound = "true";
      button.addEventListener("click", () => showAdminPage(button.dataset.adminPage));
    }
  });
  showAdminPage("overview");
}
function showAdminPage(page) {
  const allowed = {
    overview: true,
    taxonomy: canManageTaxonomy(),
    resources: canAccessResourceManagement(),
    curriculum: canOpenCatalog(),
    team: canOpenOperations()
  };
  if (!allowed[page]) page = "overview";
  document.querySelectorAll("[data-admin-page]").forEach((button) => {
    const active = button.dataset.adminPage === page;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  $("overview-section").hidden = page !== "overview";
  $("recent-resources-panel").hidden = page !== "overview";
  $("management-panel").hidden = !["taxonomy", "resources"].includes(page) || !canAccessResourceManagement();
  $("catalog-management").hidden = page !== "curriculum" || !canOpenCatalog();
  $("operations-management").hidden = page !== "team" || !canOpenOperations();
  $("taxonomy-controls").hidden = page !== "taxonomy" || !canManageTaxonomy();
  const managementHeading = $("management-panel").querySelector(".panel-heading");
  if (managementHeading) managementHeading.hidden = page !== "taxonomy" || !canManageTaxonomy();
  $("resource-manager-section").hidden = page !== "resources";
  $("dashboard-view").dataset.activePage = page;
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
function canCreateResources() {
  return ["super_admin", "content_manager", "content_contributor"].includes(currentRole);
}
function canReviewResources() {
  return ["super_admin", "content_manager", "academic_reviewer"].includes(currentRole);
}
function canEditResources() {
  return canReviewResources();
}
function canAccessResourceManagement() {
  return canManageTaxonomy() || canCreateResources() || canReviewResources();
}

function taxonomyMessage(message, isError = false) {
  const node = $("taxonomy-message");
  node.textContent = message || "";
  node.classList.toggle("error", Boolean(isError));
}

function stopTaxonomyListeners() {
  if (branchUnsubscribe) branchUnsubscribe();
  if (subjectUnsubscribe) subjectUnsubscribe();
  if (resourceUnsubscribe) resourceUnsubscribe();
  branchUnsubscribe = null;
  subjectUnsubscribe = null;
  resourceUnsubscribe = null;
}

function startTaxonomyListeners() {
  stopTaxonomyListeners();
  if (!canAccessResourceManagement()) return;
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
    renderSubjects();
    renderResourceSubjectOptions();
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
    renderResourceSubjectOptions();
    renderManagedResources();
  }, (error) => {
    console.error("Subject management read failed:", error);
    taxonomyMessage("تعذّرت قراءة المواد. تحقق من قواعد Firestore وصلاحية مدير المحتوى.", true);
  });

  resourceUnsubscribe = onSnapshot(collection(db, "resources"), (snapshot) => {
    managedResources = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        title: String(data.title || ""),
        description: String(data.description || ""),
        type: String(data.type || "link"),
        subjectId: String(data.subjectId || ""),
        subjectName: String(data.subjectName || ""),
        branchIds: Array.isArray(data.branchIds) ? data.branchIds.filter((id) => typeof id === "string") : [],
        externalUrl: String(data.externalUrl || data.sourceUrl || ""),
        status: String(data.status || "draft"),
        version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
        storageKey: String(data.storageKey || "")
      };
    }).filter((item) => item.title.trim()).sort((a, b) => a.title.localeCompare(b.title, "ar"));
    renderManagedResources();
  }, (error) => {
    console.error("Resource management read failed:", error);
    taxonomyMessage("تعذّرت قراءة الموارد. تحقق من قواعد Firestore وصلاحيات الإدارة.", true);
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
      makeManagerButton("حذف", "button-mini danger", () => deleteBranch(branch))
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
      makeManagerButton("حذف", "button-mini danger", () => deleteSubject(subject))
    );
    row.append(main, status, actions);
    list.appendChild(row);
  }
}

function beginBranchEdit(branch) {
  openFormDisclosure("branch-form");
  $("branch-edit-id").value = branch.id;
  $("branch-name").value = branch.name;
  $("branch-order").value = String(branch.order === 9999 ? 1 : branch.order);
  $("branch-submit").textContent = "حفظ التعديلات";
  $("branch-cancel").hidden = false;
  $("branch-name").focus();
}

function resetBranchForm() {
  closeFormDisclosure("branch-form");
  $("branch-form").reset();
  $("branch-edit-id").value = "";
  $("branch-order").value = String(managedBranches.length + 1);
  $("branch-submit").textContent = "إضافة فرع";
  $("branch-cancel").hidden = true;
}

function beginSubjectEdit(subject) {
  openFormDisclosure("subject-form");
  $("subject-edit-id").value = subject.id;
  $("subject-name").value = subject.name;
  $("subject-order").value = String(subject.order === 9999 ? 1 : subject.order);
  renderBranchChoices(subject.branchIds);
  $("subject-submit").textContent = "حفظ التعديلات";
  $("subject-cancel").hidden = false;
  $("subject-name").focus();
}

function resetSubjectForm() {
  closeFormDisclosure("subject-form");
  $("subject-form").reset();
  $("subject-edit-id").value = "";
  $("subject-order").value = String(managedSubjects.length + 1);
  $("subject-submit").textContent = "إضافة مادة";
  $("subject-cancel").hidden = true;
  renderBranchChoices([]);
}

async function deleteBranch(branch) {
  if (!canManageTaxonomy()) return;
  if (!confirm(`حذف فرع «${branch.name}» نهائيًا؟`)) return;
  const linkedSubjects = managedSubjects.filter((subject) => subject.branchIds.includes(branch.id));
  if (linkedSubjects.length) {
    taxonomyMessage("لا يمكن حذف الفرع قبل فك ارتباط المواد التالية به: " + linkedSubjects.map((item) => item.name).join("، ") + ".", true);
    return;
  }
  try {
    await deleteDoc(doc(db, "branches", branch.id));
    taxonomyMessage("تم حذف الفرع نهائيًا.");
  } catch (error) {
    console.error("Branch delete failed:", error);
    taxonomyMessage("تعذّر حذف الفرع. تحقق من صلاحيات الإدارة وقواعد Firestore.", true);
  }
}

async function deleteSubject(subject) {
  if (!canManageTaxonomy()) return;
  if (!confirm(`حذف مادة «${subject.name}» نهائيًا؟`)) return;
  try {
    const [resources, tests, units] = await Promise.all([
      getDocs(query(collection(db, "resources"), where("subjectId", "==", subject.id))),
      getDocs(query(collection(db, "tests"), where("subjectId", "==", subject.id))),
      getDocs(query(collection(db, "units"), where("subjectId", "==", subject.id)))
    ]);
    const dependentCount = resources.size + tests.size + units.size;
    if (dependentCount) {
      taxonomyMessage(`لا يمكن حذف المادة؛ ما زال مرتبطًا بها ${resources.size} مورد و${tests.size} اختبار و${units.size} وحدة. احذف العناصر المرتبطة أولًا.`, true);
      return;
    }
    await deleteDoc(doc(db, "subjects", subject.id));
    taxonomyMessage("تم حذف المادة نهائيًا.");
  } catch (error) {
    console.error("Subject delete failed:", error);
    taxonomyMessage("تعذّر حذف المادة أو التحقق من ارتباطاتها. تحقق من قواعد Firestore.", true);
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


// ---------- External learning resources ----------
const resourceTypeNames = {
  pdf: "ملف PDF",
  video: "فيديو",
  exam: "امتحان سابق",
  link: "رابط خارجي",
  summary: "ملخص",
  image: "صورة", document: "مستند Word", presentation: "عرض تقديمي",
  spreadsheet: "ملف Excel", audio: "ملف صوتي", archive: "ملف مضغوط"
};

function renderResourceSubjectOptions(selectedId = null) {
  const select = $("resource-subject");
  const previous = selectedId ?? select.value;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = managedSubjects.some((item) => item.active)
    ? "اختر المادة"
    : "أضف مادة نشطة أولًا";
  select.appendChild(placeholder);
  managedSubjects.filter((item) => item.active).forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.name;
    select.appendChild(option);
  });
  if (previous && Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function renderManagedResources() {
  $("resource-total").textContent = String(managedResources.length);
  const list = $("resources-manager-list");
  list.replaceChildren();
  if (!managedResources.length) {
    const empty = document.createElement("div");
    empty.className = "manager-empty";
    empty.textContent = "لا توجد موارد بعد. ارفع ملفًا أو أضف رابطًا خارجيًا من النموذج أعلاه.";
    list.appendChild(empty);
    return;
  }
  for (const resource of managedResources) {
    const row = document.createElement("div");
    row.className = "manager-row";
    const main = document.createElement("div");
    main.className = "manager-row-main";
    const title = document.createElement("span");
    title.className = "manager-row-title";
    title.textContent = resource.title;
    const subject = managedSubjects.find((item) => item.id === resource.subjectId);
    const meta = document.createElement("span");
    meta.className = "manager-row-meta";
    meta.textContent = (subject?.name || resource.subjectName || "مادة غير معروفة") + " · " +
      (resourceTypeNames[resource.type] || resource.type) + (resource.storageKey ? " · ملف مرفوع" : resource.externalUrl ? " · رابط خارجي" : "");
    main.append(title, meta);
    const status = document.createElement("span");
    status.className = "manager-status" + (resource.status === "published" ? "" : " inactive");
    status.textContent = statusNames[resource.status] || resource.status;
    const actions = document.createElement("div");
    actions.className = "manager-row-actions";
    let toggleLabel = "إرسال للمراجعة";
    if (resource.status === "pending_review") toggleLabel = "اعتماد ونشر";
    if (resource.status === "published") toggleLabel = "إيقاف النشر";
    if (canEditResources()) {
      actions.append(makeManagerButton("تعديل", "button-mini", () => beginResourceEdit(resource)));
    }
    if (canReviewResources()) {
      actions.append(makeManagerButton(toggleLabel, "button-mini" + (resource.status === "published" ? " danger" : ""), () => advanceResourceStatus(resource)));
    }
    if (canManageTaxonomy()) {
      actions.append(makeManagerButton("حذف", "button-mini danger", () => deleteResource(resource)));
    }
    if (actions.childElementCount) row.append(main, status, actions);
    else row.append(main, status);
    list.appendChild(row);
  }
}

function beginResourceEdit(resource) {
  openFormDisclosure("resource-form");
  if (!canEditResources()) return;
  $("resource-form").hidden = false;
  $("resource-submit").hidden = false;
  $("resource-edit-id").value = resource.id;
  $("resource-title").value = resource.title;
  $("resource-description").value = resource.description;
  $("resource-type").value = resource.type in resourceTypeNames ? resource.type : "link";
  renderResourceSubjectOptions(resource.subjectId);
  $("resource-source-mode").value = resource.storageKey ? "upload" : "link";
  $("resource-url").value = resource.externalUrl;
  $("resource-file").value = "";
  syncResourceSourceMode();
  $("resource-submit").textContent = "حفظ وإرسال للمراجعة";
  $("resource-cancel").hidden = false;
  $("resource-title").focus();
}

function resetResourceForm() {
  closeFormDisclosure("resource-form");
  $("resource-form").reset();
  $("resource-form").hidden = !canCreateResources();
  $("resource-submit").hidden = !canCreateResources();
  $("resource-edit-id").value = "";
  $("resource-type").value = "pdf";
  $("resource-source-mode").value = "upload";
  $("resource-file").value = "";
  syncResourceSourceMode();
  $("resource-submit").textContent = "إضافة للمراجعة";
  $("resource-cancel").hidden = true;
  renderResourceSubjectOptions("");
}

async function deleteResource(resource) {
  if (!canManageTaxonomy()) return;
  if (!confirm(`حذف المورد «${resource.title}» نهائيًا؟`)) return;
  try {
    await deleteDoc(doc(db, "resources", resource.id));
    if (resource.storageKey) {
      try { await deleteObject(storageRef(storage, resource.storageKey)); }
      catch (storageError) { console.warn("Storage file cleanup failed:", storageError); }
    }
    taxonomyMessage("تم حذف المورد نهائيًا.");
  } catch (error) {
    console.error("Resource delete failed:", error);
    taxonomyMessage("تعذّر حذف المورد. تحقق من صلاحيات الإدارة.", true);
  }
}

function syncResourceSourceMode() {
  const mode = $("resource-source-mode")?.value || "upload";
  $("resource-file-field").hidden = mode !== "upload";
  $("resource-link-field").hidden = mode !== "link";
  $("resource-file").required = mode === "upload" && !$("resource-edit-id").value;
  $("resource-url").required = mode === "link";
}
$("resource-source-mode").addEventListener("change", syncResourceSourceMode);
$("resource-file").addEventListener("change", () => {
  const file = $("resource-file").files?.[0];
  if (!file) return;
  const ext = file.name.toLowerCase().split(".").pop();
  const typeByExtension = {
    pdf: "pdf", png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image",
    doc: "document", docx: "document", ppt: "presentation", pptx: "presentation",
    xls: "spreadsheet", xlsx: "spreadsheet", mp4: "video", mp3: "audio", wav: "audio",
    zip: "archive", rar: "archive"
  };
  if (typeByExtension[ext]) $("resource-type").value = typeByExtension[ext];
});

async function advanceResourceStatus(resource) {
  if (!canReviewResources()) return;
  let nextStatus;
  const update = { updatedAt: serverTimestamp() };
  if (resource.status === "published") {
    nextStatus = "archived";
  } else if (resource.status === "pending_review") {
    nextStatus = "published";
    update.reviewedBy = currentUser.uid;
    update.reviewedAt = serverTimestamp();
    update.reviewNote = "تم الاعتماد والنشر من لوحة الإدارة";
  } else {
    nextStatus = "pending_review";
  }
  update.status = nextStatus;
  try {
    await updateDoc(doc(db, "resources", resource.id), update);
    taxonomyMessage(
      nextStatus === "published" ? "تم اعتماد المورد ونشره داخل التطبيق."
        : nextStatus === "archived" ? "تم إيقاف نشر المورد، مع الاحتفاظ بسجله."
        : "تم إرسال المورد إلى قائمة المراجعة."
    );
  } catch (error) {
    console.error("Resource status change failed:", error);
    taxonomyMessage("تعذّر تغيير حالة المورد. تحقق من الصلاحيات وقواعد Firestore.", true);
  }
}

$("resource-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const editId = $("resource-edit-id").value;
  if (!currentUser || (!canCreateResources() && !(editId && canEditResources()))) return;
  const title = $("resource-title").value.trim();
  const description = $("resource-description").value.trim();
  const type = $("resource-type").value;
  const mode = $("resource-source-mode").value;
  const file = $("resource-file").files?.[0] || null;
  const old = managedResources.find((item) => item.id === editId);
  const subject = managedSubjects.find((item) => item.id === $("resource-subject").value && item.active);
  if (!title || !subject) {
    taxonomyMessage("اكتب عنوان المورد واختر مادة نشطة.", true);
    return;
  }
  if (file && file.size > 50 * 1024 * 1024) {
    taxonomyMessage("حجم الملف أكبر من 50 ميغابايت. اختر ملفًا أصغر.", true);
    return;
  }
  if (file && !/\.(pdf|png|jpe?g|webp|gif|docx?|pptx?|xlsx?|mp4|mp3|wav|zip|rar)$/i.test(file.name)) {
    taxonomyMessage("نوع الملف غير مدعوم. اختر PDF أو صورة أو مستندًا أو وسائط أو ملفًا مضغوطًا.", true);
    return;
  }
  let externalUrl = old?.externalUrl || "";
  let sourceUrl = old?.externalUrl || "";
  let storageKey = old?.storageKey || "";
  if (mode === "link") {
    let parsedUrl;
    try { parsedUrl = new URL($("resource-url").value.trim()); } catch { parsedUrl = null; }
    if (!parsedUrl || !["https:", "http:"].includes(parsedUrl.protocol)) {
      taxonomyMessage("استخدم رابطًا صالحًا يبدأ بـ https:// أو http://.", true);
      return;
    }
    externalUrl = parsedUrl.href;
    sourceUrl = parsedUrl.href;
    storageKey = "";
  } else if (file) {
    externalUrl = "";
    sourceUrl = "";
  } else if (!editId || !storageKey) {
    taxonomyMessage("اختر ملفًا من جهازك قبل إضافة المورد.", true);
    return;
  }
  const activeBranchIds = subject.branchIds.filter((id) => managedBranches.some((branch) => branch.id === id && branch.active));
  if (!activeBranchIds.length) {
    taxonomyMessage("المادة غير مرتبطة بأي فرع نشط. عدّل ارتباطات المادة أولًا.", true);
    return;
  }

  const button = $("resource-submit");
  button.disabled = true;
  let uploadedKey = "";
  try {
    const resourceRef = editId ? doc(db, "resources", editId) : doc(collection(db, "resources"));
    if (mode === "upload" && file) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-100) || "file";
      storageKey = `resources/${resourceRef.id}/${Date.now()}_${safeName}`;
      uploadedKey = storageKey;
      const objectRef = storageRef(storage, storageKey);
      const uploaded = await uploadBytes(objectRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { uploadedBy: currentUser.uid, resourceId: resourceRef.id }
      });
      externalUrl = await getDownloadURL(uploaded.ref);
      sourceUrl = externalUrl;
    }

    const payload = {
      title, description, type, branchIds: activeBranchIds,
      subjectId: subject.id, subjectName: subject.name, keywords: [],
      sourceName: mode === "upload" ? "ملف مرفوع" : "رابط خارجي",
      sourceUrl: sourceUrl, externalUrl: externalUrl, storageKey: storageKey,
      status: "pending_review", updatedAt: serverTimestamp(),
      version: (old?.version || 0) + 1
    };
    if (editId) {
      await updateDoc(resourceRef, payload);
      taxonomyMessage("تم حفظ المورد وإرساله للمراجعة. سيظهر للطلاب بعد اعتماده ونشره.");
    } else {
      await setDoc(resourceRef, {
        ...payload, createdBy: currentUser.uid, createdAt: serverTimestamp()
      });
      taxonomyMessage("تم حفظ المورد بانتظار المراجعة. سيظهر بعد اعتماد الإدارة.");
    }
    if (old?.storageKey && old.storageKey !== storageKey) {
      try { await deleteObject(storageRef(storage, old.storageKey)); }
      catch (storageError) { console.warn("Previous storage file cleanup failed:", storageError); }
    }
    resetResourceForm();
  } catch (error) {
    console.error("Resource save failed:", error);
    if (uploadedKey) {
      try { await deleteObject(storageRef(storage, uploadedKey)); } catch {}
    }
    taxonomyMessage("تعذّر حفظ المورد أو رفع الملف. تحقق من نشر Firestore Rules وStorage Rules والصلاحيات.", true);
  } finally {
    button.disabled = false;
  }
});

$("resource-cancel").addEventListener("click", resetResourceForm);
