import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, updateDoc,
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

let currentUser = null;
let currentRole = null;
let subjects = [];
let units = [];
let tests = [];
let questions = [];
let unsubscribers = [];

const roleNames = {
  super_admin: "المدير العام",
  content_manager: "مدير محتوى",
  academic_reviewer: "مراجع أكاديمي"
};
const testTypeNames = { practice: "تدريب", timed: "اختبار بوقت", past_paper: "ورقة امتحان سابقة" };
const questionTypeNames = { multiple_choice: "اختيار من متعدد", true_false: "صح أو خطأ", short_answer: "إجابة قصيرة" };

function canManageUnits() {
  return currentRole === "super_admin" || currentRole === "content_manager";
}
function canManageAssessments() {
  return ["super_admin", "content_manager", "academic_reviewer"].includes(currentRole);
}
function canSeeCatalog() {
  return canManageUnits() || canManageAssessments();
}
function message(text, isError = false) {
  const target = $("catalog-message");
  if (!target) return;
  target.textContent = text || "";
  target.classList.toggle("error", Boolean(isError));
}
function stopListeners() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
}
function safeButton(label, callback, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button-mini" + (danger ? " danger" : "");
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}
function makeRow(titleText, metaText, statusText, statusActive, actions = []) {
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
  row.appendChild(main);
  if (statusText) {
    const status = document.createElement("span");
    status.className = "manager-status" + (statusActive ? "" : " inactive");
    status.textContent = statusText;
    row.appendChild(status);
  }
  if (actions.length) {
    const actionBox = document.createElement("div");
    actionBox.className = "manager-row-actions";
    actions.forEach((action) => actionBox.appendChild(action));
    row.appendChild(actionBox);
  }
  return row;
}
function renderEmpty(container, text) {
  container.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "manager-empty";
  empty.textContent = text;
  container.appendChild(empty);
}
function fillSubjectSelect(elementId, selectedId = "") {
  const select = $(elementId);
  if (!select) return;
  const previous = selectedId || select.value;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = subjects.some((subject) => subject.active) ? "اختر المادة" : "أضف مادة نشطة من إدارة الفروع والمواد";
  select.appendChild(placeholder);
  subjects.filter((subject) => subject.active).forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.name;
    select.appendChild(option);
  });
  if (previous && Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
}
function renderTestSelect(selectedId = "") {
  const select = $("question-test");
  const previous = selectedId || select.value;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = tests.length ? "اختر الاختبار" : "أنشئ اختبارًا أولًا";
  select.appendChild(placeholder);
  [...tests].sort((a, b) => a.title.localeCompare(b.title, "ar")).forEach((test) => {
    const option = document.createElement("option");
    option.value = test.id;
    option.textContent = test.title + (test.published ? " · منشور" : " · مسودة");
    select.appendChild(option);
  });
  if (previous && Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  } else if (tests.length) {
    select.value = tests[0].id;
  }
  renderQuestions();
}
function startListeners() {
  stopListeners();
  const subjectsUnsub = onSnapshot(collection(db, "subjects"), (snapshot) => {
    subjects = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        name: String(data.name || ""),
        active: data.active !== false,
        branchIds: Array.isArray(data.branchIds) ? data.branchIds.filter((id) => typeof id === "string") : []
      };
    }).filter((item) => item.name.trim()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    fillSubjectSelect("unit-subject");
    fillSubjectSelect("test-subject");
  }, (error) => {
    console.error("Catalog subject listener failed:", error);
    message("تعذّرت قراءة المواد؛ تحقق من نشر قواعد Firestore.", true);
  });
  unsubscribers.push(subjectsUnsub);

  if (canManageUnits()) {
    unsubscribers.push(onSnapshot(collection(db, "units"), (snapshot) => {
      units = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          name: String(data.name || ""),
          description: String(data.description || ""),
          subjectId: String(data.subjectId || ""),
          subjectName: String(data.subjectName || ""),
          branchIds: Array.isArray(data.branchIds) ? data.branchIds : [],
          order: Number.isFinite(Number(data.order)) ? Number(data.order) : 9999,
          active: data.active !== false
        };
      }).filter((item) => item.name.trim()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
      renderUnits();
    }, (error) => {
      console.error("Unit listener failed:", error);
      message("تعذّرت قراءة الوحدات. تحقق من صلاحيات مدير المحتوى وقواعد Firestore.", true);
    }));
  }

  if (canManageAssessments()) {
    unsubscribers.push(onSnapshot(collection(db, "tests"), (snapshot) => {
      tests = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          title: String(data.title || ""),
          description: String(data.description || ""),
          subjectId: String(data.subjectId || ""),
          subjectName: String(data.subjectName || ""),
          branchIds: Array.isArray(data.branchIds) ? data.branchIds : [],
          type: String(data.type || "practice"),
          durationMinutes: Number.isFinite(Number(data.durationMinutes)) ? Number(data.durationMinutes) : 0,
          published: data.published === true,
          active: data.active !== false
        };
      }).filter((item) => item.title.trim()).sort((a, b) => a.title.localeCompare(b.title, "ar"));
      renderTests();
      renderTestSelect();
    }, (error) => {
      console.error("Test listener failed:", error);
      message("تعذّرت قراءة الاختبارات. تحقق من صلاحيات المراجع الأكاديمي وقواعد Firestore.", true);
    }));
    unsubscribers.push(onSnapshot(collection(db, "questions"), (snapshot) => {
      questions = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          testId: String(data.testId || ""),
          testTitle: String(data.testTitle || ""),
          questionText: String(data.questionText || ""),
          type: String(data.type || "multiple_choice"),
          options: Array.isArray(data.options) ? data.options.filter((option) => typeof option === "string") : [],
          correctAnswer: String(data.correctAnswer || ""),
          points: Number.isFinite(Number(data.points)) ? Number(data.points) : 1,
          active: data.active !== false
        };
      }).sort((a, b) => a.questionText.localeCompare(b.questionText, "ar"));
      renderQuestions();
      renderTests();
    }, (error) => {
      console.error("Question listener failed:", error);
      message("تعذّرت قراءة بنك الأسئلة. تحقق من قواعد Firestore.", true);
    }));
  }
}
function renderUnits() {
  $("unit-total").textContent = String(units.length);
  const list = $("units-list");
  list.replaceChildren();
  if (!units.length) return renderEmpty(list, "لا توجد وحدات بعد. أضف الوحدة الأولى من النموذج.");
  units.forEach((unit) => {
    const subject = subjects.find((item) => item.id === unit.subjectId);
    const actions = [
      safeButton("تعديل", () => editUnit(unit)),
      safeButton(unit.active ? "تعطيل" : "تفعيل", () => toggleUnit(unit), unit.active)
    ];
    list.appendChild(makeRow(unit.name, (subject?.name || unit.subjectName || "مادة غير معروفة") + " · الترتيب: " + unit.order +
      (unit.description ? " · " + unit.description : ""), unit.active ? "نشطة" : "معطّلة", unit.active, actions));
  });
}
function editUnit(unit) {
  $("unit-edit-id").value = unit.id;
  $("unit-name").value = unit.name;
  fillSubjectSelect("unit-subject", unit.subjectId);
  $("unit-order").value = String(unit.order === 9999 ? 1 : unit.order);
  $("unit-description").value = unit.description;
  $("unit-submit").textContent = "حفظ التعديلات";
  $("unit-cancel").hidden = false;
  $("unit-name").focus();
}
function resetUnitForm() {
  $("unit-form").reset();
  $("unit-edit-id").value = "";
  $("unit-order").value = String(units.length + 1);
  $("unit-submit").textContent = "إضافة وحدة";
  $("unit-cancel").hidden = true;
  fillSubjectSelect("unit-subject", "");
}
async function toggleUnit(unit) {
  if (!canManageUnits()) return;
  try {
    await updateDoc(doc(db, "units", unit.id), { active: !unit.active, updatedAt: serverTimestamp() });
    message(unit.active ? "تم تعطيل الوحدة دون حذفها." : "تم تفعيل الوحدة.");
  } catch (error) {
    console.error("Unit state update failed:", error);
    message("تعذّر تغيير حالة الوحدة. تحقق من صلاحيات الإدارة وقواعد Firestore.", true);
  }
}
$("unit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageUnits() || !currentUser) return;
  const id = $("unit-edit-id").value;
  const name = $("unit-name").value.trim();
  const order = Number($("unit-order").value);
  const description = $("unit-description").value.trim();
  const subject = subjects.find((item) => item.id === $("unit-subject").value && item.active);
  if (!name || !subject || !Number.isInteger(order) || order < 0) {
    message("اكتب اسم الوحدة، واختر مادة نشطة، وحدد ترتيبًا صحيحًا.", true);
    return;
  }
  if (units.some((item) => item.id !== id && item.subjectId === subject.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    message("توجد وحدة بالاسم نفسه داخل المادة. عدّل الوحدة الموجودة بدل تكرارها.", true);
    return;
  }
  const button = $("unit-submit");
  button.disabled = true;
  const payload = {
    name, description, order, subjectId: subject.id, subjectName: subject.name,
    branchIds: subject.branchIds, updatedAt: serverTimestamp()
  };
  try {
    if (id) {
      await updateDoc(doc(db, "units", id), payload);
      message("تم حفظ تعديلات الوحدة في السحابة.");
    } else {
      await addDoc(collection(db, "units"), {
        ...payload, active: true, createdBy: currentUser.uid, createdAt: serverTimestamp()
      });
      message("تمت إضافة الوحدة إلى Firestore.");
    }
    resetUnitForm();
  } catch (error) {
    console.error("Unit save failed:", error);
    message("تعذّر حفظ الوحدة. تحقق من صلاحيات مدير المحتوى وقواعد Firestore.", true);
  } finally {
    button.disabled = false;
  }
});
$("unit-cancel").addEventListener("click", resetUnitForm);

function renderTests() {
  $("test-total").textContent = String(tests.length);
  const list = $("tests-list");
  list.replaceChildren();
  if (!tests.length) return renderEmpty(list, "لا توجد اختبارات بعد. أنشئ اختبارًا ثم أضف أسئلته من بنك الأسئلة.");
  tests.forEach((test) => {
    const subject = subjects.find((item) => item.id === test.subjectId);
    const count = questions.filter((question) => question.testId === test.id && question.active).length;
    const state = test.published ? "منشور" : "مسودة";
    const actions = [
      safeButton("تعديل", () => editTest(test)),
      safeButton(test.published ? "إيقاف النشر" : "نشر التعريف", () => toggleTestPublished(test), test.published)
    ];
    list.appendChild(makeRow(test.title,
      (subject?.name || test.subjectName || "مادة غير معروفة") + " · " + (testTypeNames[test.type] || test.type) +
      " · " + (test.durationMinutes ? test.durationMinutes + " دقيقة" : "دون مؤقت") + " · " + count + " سؤال",
      state, test.published && test.active, actions));
  });
}
function editTest(test) {
  $("test-edit-id").value = test.id;
  $("test-title").value = test.title;
  fillSubjectSelect("test-subject", test.subjectId);
  $("test-type").value = test.type in testTypeNames ? test.type : "practice";
  $("test-duration").value = String(test.durationMinutes);
  $("test-description").value = test.description;
  $("test-submit").textContent = "حفظ التعديلات";
  $("test-cancel").hidden = false;
  $("test-title").focus();
}
function resetTestForm() {
  $("test-form").reset();
  $("test-edit-id").value = "";
  $("test-duration").value = "0";
  $("test-submit").textContent = "إضافة اختبار";
  $("test-cancel").hidden = true;
  fillSubjectSelect("test-subject", "");
}
async function toggleTestPublished(test) {
  if (!canManageAssessments()) return;
  if (!test.published && !questions.some((question) => question.testId === test.id && question.active)) {
    message("أضف سؤالًا نشطًا واحدًا على الأقل قبل نشر الاختبار.", true);
    return;
  }
  try {
    await updateDoc(doc(db, "tests", test.id), { published: !test.published, updatedAt: serverTimestamp() });
    message(test.published ? "تم إيقاف نشر تعريف الاختبار." : "تم نشر تعريف الاختبار. أسئلة الاختبار وإجاباتها ما زالت محمية من قراءة الطلاب حتى اكتمال مسار المحاولة والتصحيح الآمن.");
  } catch (error) {
    console.error("Test publish update failed:", error);
    message("تعذّر تغيير حالة نشر الاختبار. تحقق من قواعد Firestore.", true);
  }
}
$("test-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageAssessments() || !currentUser) return;
  const id = $("test-edit-id").value;
  const title = $("test-title").value.trim();
  const description = $("test-description").value.trim();
  const type = $("test-type").value;
  const durationMinutes = Number($("test-duration").value);
  const subject = subjects.find((item) => item.id === $("test-subject").value && item.active);
  if (!title || !subject || !Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 600) {
    message("اكتب عنوان الاختبار واختر مادة نشطة وحدد مدة من 0 إلى 600 دقيقة.", true);
    return;
  }
  if (tests.some((item) => item.id !== id && item.subjectId === subject.id && item.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
    message("يوجد اختبار بهذا الاسم داخل المادة. افتح الاختبار الموجود لتعديله.", true);
    return;
  }
  const button = $("test-submit");
  button.disabled = true;
  const payload = {
    title, description, type, durationMinutes, subjectId: subject.id, subjectName: subject.name,
    branchIds: subject.branchIds, active: true, updatedAt: serverTimestamp()
  };
  try {
    if (id) {
      await updateDoc(doc(db, "tests", id), payload);
      message("تم حفظ تعديلات الاختبار.");
    } else {
      await addDoc(collection(db, "tests"), {
        ...payload, published: false, createdBy: currentUser.uid, createdAt: serverTimestamp()
      });
      message("تم إنشاء الاختبار كمسودة. أضف الأسئلة ثم انشر تعريفه عند الجاهزية.");
    }
    resetTestForm();
  } catch (error) {
    console.error("Test save failed:", error);
    message("تعذّر حفظ الاختبار. تحقق من صلاحية المراجع الأكاديمي وقواعد Firestore.", true);
  } finally {
    button.disabled = false;
  }
});
$("test-cancel").addEventListener("click", resetTestForm);

function updateQuestionTypeFields() {
  const type = $("question-type").value;
  const options = $("question-options");
  if (options.previousElementSibling) options.previousElementSibling.hidden = type !== "multiple_choice";
  options.hidden = type !== "multiple_choice";
  if (type === "true_false") {
    $("question-answer").placeholder = "اكتب: صح أو خطأ";
  } else if (type === "multiple_choice") {
    $("question-answer").placeholder = "اكتب الإجابة المطابقة لأحد الخيارات";
  } else {
    $("question-answer").placeholder = "اكتب الإجابة النموذجية";
  }
}
$("question-type").addEventListener("change", updateQuestionTypeFields);
$("question-test").addEventListener("change", renderQuestions);

function renderQuestions() {
  const selectedTestId = $("question-test").value;
  const list = $("questions-list");
  if (!list) return;
  const visible = questions.filter((question) => question.testId === selectedTestId);
  $("question-total").textContent = String(visible.length);
  list.replaceChildren();
  if (!selectedTestId) return renderEmpty(list, "اختر اختبارًا لعرض أسئلته.");
  if (!visible.length) return renderEmpty(list, "لا توجد أسئلة لهذا الاختبار بعد.");
  visible.forEach((question, index) => {
    const meta = (questionTypeNames[question.type] || question.type) + " · " + question.points + " علامة · " +
      (question.active ? "نشط" : "معطّل") + (question.options.length ? " · " + question.options.length + " خيارات" : "");
    const actions = [
      safeButton("تعديل", () => editQuestion(question)),
      safeButton(question.active ? "تعطيل" : "تفعيل", () => toggleQuestion(question), question.active)
    ];
    list.appendChild(makeRow((index + 1) + ". " + question.questionText, meta,
      question.active ? "نشط" : "معطّل", question.active, actions));
  });
}
function editQuestion(question) {
  $("question-edit-id").value = question.id;
  renderTestSelect(question.testId);
  $("question-test").value = question.testId;
  $("question-text").value = question.questionText;
  $("question-type").value = question.type in questionTypeNames ? question.type : "multiple_choice";
  $("question-options").value = question.options.join("\n");
  $("question-answer").value = question.correctAnswer;
  $("question-points").value = String(question.points);
  $("question-submit").textContent = "حفظ التعديلات";
  $("question-cancel").hidden = false;
  $("question-text").focus();
  updateQuestionTypeFields();
}
function resetQuestionForm() {
  $("question-form").reset();
  $("question-edit-id").value = "";
  $("question-points").value = "1";
  $("question-submit").textContent = "إضافة سؤال";
  $("question-cancel").hidden = true;
  renderTestSelect($("question-test").value);
  updateQuestionTypeFields();
}
async function toggleQuestion(question) {
  if (!canManageAssessments()) return;
  try {
    await updateDoc(doc(db, "questions", question.id), { active: !question.active, updatedAt: serverTimestamp() });
    message(question.active ? "تم تعطيل السؤال دون حذفه." : "تم تفعيل السؤال.");
  } catch (error) {
    console.error("Question state update failed:", error);
    message("تعذّر تغيير حالة السؤال. تحقق من قواعد Firestore.", true);
  }
}
$("question-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageAssessments() || !currentUser) return;
  const id = $("question-edit-id").value;
  const test = tests.find((item) => item.id === $("question-test").value && item.active);
  const questionText = $("question-text").value.trim();
  const type = $("question-type").value;
  let options = [];
  if (type === "multiple_choice") {
    options = $("question-options").value.split("\n").map((item) => item.trim()).filter(Boolean);
    options = [...new Set(options)];
    if (options.length < 2) {
      message("سؤال الاختيار من متعدد يحتاج خيارين مختلفين على الأقل.", true);
      return;
    }
  } else if (type === "true_false") {
    options = ["صح", "خطأ"];
  }
  let correctAnswer = $("question-answer").value.trim();
  if (type === "true_false") {
    const normalized = correctAnswer.replace(/أ|إ|آ/g, "ا").toLocaleLowerCase();
    if (["صح", "صحيح", "نعم"].includes(normalized)) correctAnswer = "صح";
    else if (["خطا", "خطأ", "غلط", "لا"].includes(normalized)) correctAnswer = "خطأ";
    else {
      message("إجابة سؤال الصح والخطأ يجب أن تكون «صح» أو «خطأ».", true);
      return;
    }
  }
  if (!test || !questionText || !correctAnswer) {
    message("اختر اختبارًا نشطًا واكتب السؤال والإجابة الصحيحة.", true);
    return;
  }
  if (type === "multiple_choice" && !options.includes(correctAnswer)) {
    message("الإجابة الصحيحة يجب أن تطابق أحد الخيارات المكتوبة حرفيًا.", true);
    return;
  }
  const points = Number($("question-points").value);
  if (!Number.isFinite(points) || points < 0.5 || points > 100) {
    message("العلامة يجب أن تكون بين 0.5 و100.", true);
    return;
  }
  const old = questions.find((item) => item.id === id);
  const button = $("question-submit");
  button.disabled = true;
  const payload = {
    testId: test.id, testTitle: test.title, subjectId: test.subjectId, subjectName: test.subjectName,
    questionText, type, options, correctAnswer, points,
    explanation: $("question-explanation").value.trim(),
    active: old ? old.active : true, updatedAt: serverTimestamp()
  };
  try {
    if (id) {
      await updateDoc(doc(db, "questions", id), payload);
      message("تم حفظ تعديلات السؤال.");
    } else {
      await addDoc(collection(db, "questions"), {
        ...payload, createdBy: currentUser.uid, createdAt: serverTimestamp()
      });
      message("تمت إضافة السؤال إلى بنك الأسئلة.");
    }
    resetQuestionForm();
  } catch (error) {
    console.error("Question save failed:", error);
    message("تعذّر حفظ السؤال. تحقق من صلاحيات الإدارة وقواعد Firestore.", true);
  } finally {
    button.disabled = false;
  }
});
$("question-cancel").addEventListener("click", resetQuestionForm);

onAuthStateChanged(auth, async (user) => {
  stopListeners();
  currentUser = user || null;
  currentRole = null;
  if (!user) {
    $("catalog-management").hidden = true;
    return;
  }
  try {
    if (user.uid === SUPER_ADMIN_UID) {
      currentRole = "super_admin";
    } else {
      const roleSnap = await getDoc(doc(db, "adminUsers", user.uid));
      if (!roleSnap.exists() || roleSnap.data().active !== true) {
        $("catalog-management").hidden = true;
        return;
      }
      currentRole = roleSnap.data().role || null;
    }
    $("catalog-management").hidden = !canSeeCatalog();
    $("unit-admin").hidden = !canManageUnits();
    $("test-admin").hidden = !canManageAssessments();
    $("question-admin").hidden = !canManageAssessments();
    if (canSeeCatalog()) {
      startListeners();
      fillSubjectSelect("unit-subject");
      fillSubjectSelect("test-subject");
      updateQuestionTypeFields();
      message("تم التحقق من الصلاحيات. دورك: " + (roleNames[currentRole] || currentRole) + ".");
    }
  } catch (error) {
    console.error("Catalog admin role check failed:", error);
    $("catalog-management").hidden = true;
    message("تعذّر التحقق من الصلاحيات. لم يتم فتح أدوات إدارة المنهج.", true);
  }
});
