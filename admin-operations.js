import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, setDoc, updateDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

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
const $ = (id) => document.getElementById(id);

const roleNames = {
  super_admin: "المدير العام",
  content_manager: "مدير محتوى",
  academic_reviewer: "مراجع أكاديمي",
  content_contributor: "مساهم محتوى",
  sponsored_ads_manager: "مدير الإعلانات",
  technical_support: "الدعم الفني"
};
const reportStatusNames = { open: "مفتوح", resolved: "تمت المعالجة", dismissed: "مغلق دون إجراء" };
let currentUser = null;
let currentRole = null;
let teamMembers = [];
let reports = [];
let teamUnsubscribe = null;
let reportsUnsubscribe = null;

function canManageTeam() {
  return currentRole === "super_admin";
}
function canManageReports() {
  return ["super_admin", "technical_support", "content_manager", "academic_reviewer"].includes(currentRole);
}
function operationsMessage(text, isError = false) {
  const target = $("operations-message");
  target.textContent = text || "";
  target.classList.toggle("error", Boolean(isError));
}
function stopListeners() {
  if (teamUnsubscribe) teamUnsubscribe();
  if (reportsUnsubscribe) reportsUnsubscribe();
  teamUnsubscribe = null;
  reportsUnsubscribe = null;
}
function makeButton(label, callback, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button-mini" + (danger ? " danger" : "");
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}
function makeRow(titleText, metaText, stateText, active, buttons) {
  const row = document.createElement("div");
  row.className = "manager-row";
  const main = document.createElement("div");
  main.className = "manager-row-main";
  const title = document.createElement("span");
  title.className = "manager-row-title";
  title.textContent = titleText;
  const meta = document.createElement("span");
  meta.className = "manager-row-meta";
  meta.textContent = metaText;
  main.append(title, meta);
  const status = document.createElement("span");
  status.className = "manager-status" + (active ? "" : " inactive");
  status.textContent = stateText;
  row.append(main, status);
  if (buttons.length) {
    const actions = document.createElement("div");
    actions.className = "manager-row-actions";
    buttons.forEach((button) => actions.appendChild(button));
    row.appendChild(actions);
  }
  return row;
}
function showEmpty(list, text) {
  list.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "manager-empty";
  empty.textContent = text;
  list.appendChild(empty);
}

function renderTeam() {
  $("team-total").textContent = String(teamMembers.length);
  const list = $("team-list");
  list.replaceChildren();
  if (!teamMembers.length) {
    showEmpty(list, "لا توجد حسابات إدارية إضافية بعد. أضف UID لحساب موجود في Firebase Authentication.");
    return;
  }
  teamMembers.forEach((member) => {
    const isRoot = member.id === SUPER_ADMIN_UID;
    const actions = [];
    if (!isRoot) {
      actions.push(makeButton("تعديل", () => editTeamMember(member)));
      actions.push(makeButton(member.active ? "تعطيل" : "تفعيل", () => toggleTeamMember(member), member.active));
    }
    list.appendChild(makeRow(
      member.displayName || member.email || member.id,
      (member.email || "دون بريد مسجل") + " · " + (roleNames[member.role] || member.role || "دون دور") + " · UID: " + member.id,
      isRoot ? "مدير عام ثابت" : member.active ? "نشط" : "معطّل",
      isRoot || member.active,
      actions
    ));
  });
}
function editTeamMember(member) {
  if (!canManageTeam() || member.id === SUPER_ADMIN_UID) return;
  $("team-edit-uid").value = member.id;
  $("team-uid").value = member.id;
  $("team-uid").disabled = true;
  $("team-name").value = member.displayName;
  $("team-email").value = member.email;
  $("team-role").value = member.role in roleNames && member.role !== "super_admin" ? member.role : "content_manager";
  $("team-active").checked = member.active;
  $("team-submit").textContent = "حفظ الصلاحيات";
  $("team-cancel").hidden = false;
  $("team-name").focus();
}
function resetTeamForm() {
  $("team-form").reset();
  $("team-edit-uid").value = "";
  $("team-uid").disabled = false;
  $("team-active").checked = true;
  $("team-role").value = "content_manager";
  $("team-submit").textContent = "إضافة عضو";
  $("team-cancel").hidden = true;
}
async function toggleTeamMember(member) {
  if (!canManageTeam() || member.id === SUPER_ADMIN_UID) return;
  try {
    await updateDoc(doc(db, "adminUsers", member.id), {
      active: !member.active,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    });
    operationsMessage(member.active ? "تم تعطيل حساب الإدارة. سيُرفض دخوله عند التحقق من الصلاحيات." : "تم تفعيل حساب الإدارة.");
  } catch (error) {
    console.error("Admin member status update failed:", error);
    operationsMessage("تعذّر تغيير حالة العضو. تحقق من قواعد Firestore.", true);
  }
}
$("team-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageTeam() || !currentUser) return;
  const editingId = $("team-edit-uid").value;
  const uid = (editingId || $("team-uid").value).trim();
  const displayName = $("team-name").value.trim();
  const email = $("team-email").value.trim();
  const role = $("team-role").value;
  const active = $("team-active").checked;
  if (!uid || uid === SUPER_ADMIN_UID || role === "super_admin") {
    operationsMessage("أدخل UID لحساب آخر. حساب المدير العام الأساسي لا يُدار من هذا النموذج.", true);
    return;
  }
  if (editingId && editingId !== uid) {
    operationsMessage("لا يمكن تغيير UID لسجل قائم. أنشئ سجلًا جديدًا للحساب الصحيح.", true);
    return;
  }
  if (!editingId && teamMembers.some((member) => member.id === uid)) {
    operationsMessage("هذا الـ UID مسجل بالفعل. استخدم زر التعديل في السجل الموجود.", true);
    return;
  }
  const button = $("team-submit");
  button.disabled = true;
  try {
    if (editingId) {
      await updateDoc(doc(db, "adminUsers", uid), {
        displayName, email, role, active,
        updatedAt: serverTimestamp(), updatedBy: currentUser.uid
      });
      operationsMessage("تم تحديث دور عضو الفريق وحالته.");
    } else {
      await setDoc(doc(db, "adminUsers", uid), {
        displayName, email, role, active,
        createdBy: currentUser.uid, createdAt: serverTimestamp(),
        updatedBy: currentUser.uid, updatedAt: serverTimestamp()
      });
      operationsMessage("تم تسجيل عضو الإدارة. يجب أن يكون UID تابعًا لحساب موجود في Firebase Authentication.");
    }
    resetTeamForm();
  } catch (error) {
    console.error("Admin member save failed:", error);
    operationsMessage("تعذّر حفظ العضو. تأكد من أنك المدير العام وأن قواعد Firestore منشورة.", true);
  } finally {
    button.disabled = false;
  }
});
$("team-cancel").addEventListener("click", resetTeamForm);

function renderReports() {
  const openCount = reports.filter((report) => (report.status || "open") === "open").length;
  $("report-total").textContent = String(openCount);
  const list = $("reports-list");
  list.replaceChildren();
  if (!reports.length) {
    showEmpty(list, "لا توجد بلاغات مسجلة.");
    return;
  }
  reports.forEach((report) => {
    const status = report.status || "open";
    const title = report.title || report.subject || report.topic || report.type || "بلاغ بدون عنوان";
    const description = report.description || report.message || report.details || report.content || "";
    const reporter = report.reporterUid || report.userId || "مبلّغ غير محدد";
    const created = report.createdAt && typeof report.createdAt.toDate === "function"
      ? report.createdAt.toDate().toLocaleString("ar-PS")
      : "";
    const actions = [];
    if (status === "open") {
      actions.push(makeButton("تمت المعالجة", () => setReportStatus(report, "resolved")));
      actions.push(makeButton("إغلاق دون إجراء", () => setReportStatus(report, "dismissed"), true));
    } else {
      actions.push(makeButton("إعادة فتح", () => setReportStatus(report, "open")));
    }
    list.appendChild(makeRow(
      String(title),
      String(description || "لا يوجد وصف") + " · المبلّغ: " + reporter + (created ? " · " + created : ""),
      reportStatusNames[status] || status,
      status === "resolved",
      actions
    ));
  });
}
async function setReportStatus(report, status) {
  if (!canManageReports()) return;
  try {
    await updateDoc(doc(db, "reports", report.id), {
      status,
      reviewedBy: currentUser.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    operationsMessage(status === "open" ? "تمت إعادة فتح البلاغ." : "تم تحديث حالة البلاغ والاحتفاظ بسجله.");
  } catch (error) {
    console.error("Report status update failed:", error);
    operationsMessage("تعذّر تحديث البلاغ. تحقق من صلاحيات الدعم الفني وقواعد Firestore.", true);
  }
}

onAuthStateChanged(auth, async (user) => {
  stopListeners();
  currentUser = user || null;
  currentRole = null;
  $("operations-management").hidden = true;
  if (!user) return;
  try {
    if (user.uid === SUPER_ADMIN_UID) {
      currentRole = "super_admin";
    } else {
      const roleSnap = await getDoc(doc(db, "adminUsers", user.uid));
      if (!roleSnap.exists() || roleSnap.data().active !== true) return;
      currentRole = roleSnap.data().role || null;
    }
    const teamAllowed = canManageTeam();
    const reportsAllowed = canManageReports();
    $("team-admin").hidden = !teamAllowed;
    $("report-admin").hidden = !reportsAllowed;
    $("operations-management").hidden = !(teamAllowed || reportsAllowed);
    if (teamAllowed) {
      teamUnsubscribe = onSnapshot(collection(db, "adminUsers"), (snapshot) => {
        teamMembers = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            displayName: String(data.displayName || data.name || ""),
            email: String(data.email || ""),
            role: String(data.role || ""),
            active: data.active === true
          };
        }).sort((a, b) => (a.displayName || a.email || a.id).localeCompare(b.displayName || b.email || b.id, "ar"));
        renderTeam();
      }, (error) => {
        console.error("Team listener failed:", error);
        operationsMessage("تعذّرت قراءة فريق الإدارة. تحقق من أن الحساب هو المدير العام.", true);
      });
    }
    if (reportsAllowed) {
      reportsUnsubscribe = onSnapshot(collection(db, "reports"), (snapshot) => {
        reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
          });
        renderReports();
      }, (error) => {
        console.error("Reports listener failed:", error);
        operationsMessage("تعذّرت قراءة البلاغات. تحقق من صلاحيات الدور وقواعد Firestore.", true);
      });
    }
  } catch (error) {
    console.error("Operations admin initialization failed:", error);
    $("operations-management").hidden = true;
    operationsMessage("تعذّر التحقق من الصلاحيات. لم يتم فتح أدوات الفريق أو البلاغات.", true);
  }
});
