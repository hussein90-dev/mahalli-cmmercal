const DB_NAME = "mahalliDB";
const DB_VERSION = 3;

let db = null;
let route = { name: "home", params: {} };
let historyStack = [];

const $ = (selector) => document.querySelector(selector);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function closeModal() {
  const modal = $("#modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.innerHTML = "";
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const stores = ["companies","customers","suppliers","purchases","expenses","payments","requests","trash","settings","meta"];
      stores.forEach((name) => {
        if (!database.objectStoreNames.contains(name)) {
          const store = database.createObjectStore(name, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      });
    };
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onerror = () => reject(request.error);
  });
}

function store(name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

function getRecord(name, id) {
  return new Promise((resolve, reject) => {
    const request = store(name).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(name) {
  return new Promise((resolve, reject) => {
    const request = store(name).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(name, value) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(name, id) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function nextNumber(key, prefix = "") {
  const meta = await getRecord("meta", key);
  const next = Number(meta?.value || 0) + 1;
  await putRecord("meta", { id: key, value: next });
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function convertAmount(amount, currency, rate) {
  const value = Number(amount || 0);
  const exchangeRate = Number(rate || 0);
  return currency === "USD"
    ? { usd: value, iqd: value * exchangeRate }
    : { usd: exchangeRate ? value / exchangeRate : 0, iqd: value };
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
}

function go(name, params = {}, push = true) {
  if (push && route.name !== "home") historyStack.push({ ...route });
  route = { name, params };
  render();
}

function home() {
  route = { name: "home", params: {} };
  historyStack = [];
  render();
}

function goBack() {
  const previous = historyStack.pop();
  if (previous) { route = previous; render(); } else home();
}

async function render() {
  if (!db) return;
  const app = $("#app");
  if (!app) return;
  $("#backBtn")?.classList.toggle("hidden", route.name === "home");
  $("#homeBtn")?.classList.toggle("hidden", route.name === "home");
  app.innerHTML = "";
  switch (route.name) {
    case "home": renderHome(app); break;
    case "companies": await renderCompanies(app); break;
    case "company": await renderCompany(app, route.params.id); break;
    case "customer": await renderCustomer(app, route.params.id); break;
    case "payments": await renderPayments(app); break;
    case "expenses": await renderExpenses(app); break;
    default: home();
  }
}

function renderHome(app) {
  app.innerHTML = `
    <div class="home-title">محلّي</div>
    <div class="home-grid">
      <button class="home-card" onclick="go('companies')"><span class="emoji">🏢</span>الشركات والعملاء</button>
      <button class="home-card" onclick="placeholder('المشتريات')"><span class="emoji">🛒</span>المشتريات</button>
      <button class="home-card" onclick="placeholder('الموردون')"><span class="emoji">🏭</span>الموردون</button>
      <button class="home-card" onclick="go('expenses')"><span class="emoji">💸</span>المصروفات</button>
      <button class="home-card" onclick="go('payments')"><span class="emoji">💰</span>الدفعات</button>
      <button class="home-card" onclick="placeholder('التقارير')"><span class="emoji">📊</span>التقارير</button>
      <button class="home-card" onclick="placeholder('البحث')"><span class="emoji">🔍</span>البحث</button>
      <button class="home-card" onclick="placeholder('الإعدادات والنسخ الاحتياطي')"><span class="emoji">⚙️</span>الإعدادات والنسخ الاحتياطي</button>
    </div>`;
}

function placeholder(title) {
  const modal = $("#modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="modal-box"><div class="modal-title">${esc(title)}</div><p class="muted">هذه الوحدة ستُستكمل في المرحلة التالية فوق قاعدة البيانات نفسها.</p><button class="btn btn-primary" onclick="closeModal()">حسنًا</button></div>`;
}

function filterCards(value, listId) {
  const search = String(value || "").toLowerCase();
  document.querySelectorAll(`#${listId} .searchable`).forEach((element) => {
    const text = String(element.dataset.search || "").toLowerCase();
    element.style.display = text.includes(search) ? "" : "none";
  });
}

async function renderCompanies(app) {
  const companies = (await getAll("companies")).sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  app.innerHTML = `
    <div class="section-head"><div class="section-title">الشركات والعملاء</div><button class="btn btn-primary" onclick="companyForm()">＋ إضافة</button></div>
    <input class="search" placeholder="بحث باسم الشركة" oninput="filterCards(this.value, 'company-list')">
    <div id="company-list">${companies.length ? companies.map((c) => `
      <div class="card searchable" data-search="${esc(c.name)}">
        <div class="row"><div><strong>${esc(c.name)}</strong><div class="muted">${esc(c.phone||"")}</div></div><div class="amount">${money(c.totalUSD)} $<br>${money(c.totalIQD)} د.ع</div></div>
        <div class="list-actions"><button class="btn btn-light" onclick="go('company',{id:'${c.id}'})">فتح</button><button class="btn btn-light" onclick="companyForm('${c.id}')">تعديل</button><button class="btn btn-danger" onclick="deleteCompany('${c.id}')">حذف</button></div>
      </div>`).join("") : `<div class="empty">لا توجد شركات بعد.</div>`}</div>`;
}

function companyForm(id = "") { openCompanyModal(id); }

async function openCompanyModal(id) {
  const c = id ? await getRecord("companies", id) : {};
  const modal = $("#modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `
    <div class="modal-box"><div class="modal-title">${id ? "تعديل الشركة" : "إضافة شركة"}</div>
      <div class="field"><label>اسم الشركة *</label><input id="fName" value="${esc(c.name||"")}"></div>
      <div class="field"><label>الهاتف</label><input id="fPhone" value="${esc(c.phone||"")}"></div>
      <div class="field"><label>العنوان</label><input id="fAddress" value="${esc(c.address||"")}"></div>
      <div class="field"><label>ملاحظات</label><textarea id="fNotes">${esc(c.notes||"")}</textarea></div>
      <div class="form-actions"><button class="btn btn-light" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveCompany('${id}')">حفظ</button></div>
    </div>`;
}

async function saveCompany(id) {
  const name = $("#fName").value.trim();
  if (!name) { toast("اسم الشركة مطلوب"); return; }
  const old = id ? await getRecord("companies", id) : null;
  await putRecord("companies", {
    id: id || uid("company"), name,
    phone: $("#fPhone").value.trim(), address: $("#fAddress").value.trim(), notes: $("#fNotes").value.trim(),
    createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    totalUSD: old?.totalUSD || 0, totalIQD: old?.totalIQD || 0
  });
  closeModal(); toast("تم حفظ الشركة"); render();
}

async function deleteCompany(id) {
  const c = await getRecord("companies", id);
  if (!c) return;
  if (!confirm("سيتم نقل الشركة إلى سلة المحذوفات. هل تريد المتابعة؟")) return;
  await putRecord("trash", { id: uid("trash"), originalId: id, type: "company", deletedAt: new Date().toISOString(), data: c });
  await deleteRecord("companies", id);
  toast("تم نقل الشركة إلى سلة المحذوفات"); render();
}

async function renderCompany(app, id) {
  const c = await getRecord("companies", id);
  if (!c) { home(); return; }
  const customers = (await getAll("customers")).filter((x) => x.companyId === id).sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  app.innerHTML = `
    <div class="section-head"><div class="section-title">${esc(c.name)}</div><button class="btn btn-light" onclick="companyForm('${id}')">تعديل</button></div>
    <div class="total-box"><div class="total">الدولار<strong>${money(c.totalUSD)} $</strong></div><div class="total">الدينار<strong>${money(c.totalIQD)} د.ع</strong></div></div>
    <div class="actions" style="margin-bottom:12px"><button class="btn btn-primary" onclick="customerForm('${id}')">＋ إضافة عميل</button><button class="btn btn-primary" onclick="placeholder('إضافة طلب للشركة')">＋ إضافة طلب</button><button class="btn btn-success" onclick="paymentFormCompany('${id}')">💰 إضافة دفعة للشركة</button></div>
    <input class="search" placeholder="بحث عن عميل" oninput="filterCards(this.value, 'customer-list')">
    <div id="customer-list">${customers.length ? customers.map((x) => `
      <div class="card searchable" data-search="${esc(x.name)}"><div class="row"><div><strong>${esc(x.name)}</strong><div class="muted">${esc(x.phone||"")}</div></div></div>
      <div class="list-actions"><button class="btn btn-light" onclick="go('customer',{id:'${x.id}'})">فتح</button><button class="btn btn-light" onclick="customerForm('${id}','${x.id}')">تعديل</button></div></div>`).join("") : `<div class="empty">لا يوجد عملاء لهذه الشركة.</div>`}</div>`;
}

async function customerForm(companyId = "", customerId = "") {
  const c = customerId ? await getRecord("customers", customerId) : {};
  const modal = $("#modal"); modal.classList.remove("hidden");
  modal.innerHTML = `
    <div class="modal-box"><div class="modal-title">${customerId ? "تعديل العميل" : "إضافة عميل"}</div>
      <div class="field"><label>اسم العميل *</label><input id="cuName" value="${esc(c.name||"")}"></div>
      <div class="field"><label>الهاتف</label><input id="cuPhone" value="${esc(c.phone||"")}"></div>
      <div class="field"><label>العنوان</label><input id="cuAddress" value="${esc(c.address||"")}"></div>
      <div class="field"><label>ملاحظات</label><textarea id="cuNotes">${esc(c.notes||"")}</textarea></div>
      <div class="form-actions"><button class="btn btn-light" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveCustomer('${companyId}','${customerId}')">حفظ</button></div>
    </div>`;
}

async function saveCustomer(companyId, id) {
  const name = $("#cuName").value.trim();
  if (!name) { toast("اسم العميل مطلوب"); return; }
  const old = id ? await getRecord("customers", id) : null;
  await putRecord("customers", {
    id: id || uid("customer"), name,
    phone: $("#cuPhone").value.trim(), address: $("#cuAddress").value.trim(), notes: $("#cuNotes").value.trim(),
    companyId: companyId || old?.companyId || null,
    accountNumber: old?.accountNumber || null, accountStatus: old?.accountStatus || "مفتوح",
    createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  closeModal(); toast("تم حفظ العميل"); render();
}

async function renderCustomer(app, id) {
  const c = await getRecord("customers", id);
  if (!c) { home(); return; }
  const requests = (await getAll("requests")).filter((x) => x.customerId === id).sort((a,b) => String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
  const payments = (await getAll("payments")).filter((x) => x.customerId === id).sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  const total = requests.reduce((s,x) => s + Number(x.totalUSD||0), 0);
  const paid = payments.reduce((s,x) => s + Number(x.usd||0), 0);
  const company = c.companyId ? await getRecord("companies", c.companyId) : null;
  app.innerHTML = `
    <div class="section-head"><div class="section-title">${esc(c.name)}</div><button class="btn btn-light" onclick="customerForm('${c.companyId||""}','${id}')">تعديل</button></div>
    <div class="muted">${company ? `الشركة: ${esc(company.name)}` : "عميل مستقل"}</div>
    <div class="total-box"><div class="total">إجمالي الطلبات<strong>${money(total)} $</strong></div><div class="total">المتبقي<strong>${money(total-paid)} $</strong></div></div>
    <div class="actions" style="margin:12px 0"><button class="btn btn-primary" onclick="placeholder('إضافة طلب')">＋ إضافة طلب</button><button class="btn btn-success" onclick="paymentFormCustomer('${id}')">💰 إضافة دفعة</button></div>
    <h3>الطلبات</h3>
    ${requests.length ? requests.map((r) => `<div class="card"><div class="row"><strong>${esc(r.number)}</strong><span>${esc(r.product||"")}</span></div><div>${money(r.totalUSD)} $ | ${money(r.totalIQD)} د.ع</div><div class="muted">${esc(r.status||"")} — ${formatDate(r.dateTime)}</div></div>`).join("") : `<div class="empty">لا توجد طلبات.</div>`}
    <h3>الدفعات</h3>
    ${payments.length ? payments.map((p) => `<div class="card"><div class="row"><strong>${esc(p.number)}</strong><span>${money(p.usd)} $</span></div><div class="muted">${formatDate(p.dateTime)}</div></div>`).join("") : `<div class="empty">لا توجد دفعات.</div>`}`;
}

async function paymentFormCustomer(customerId) { await paymentForm("customer", customerId); }
async function paymentFormCompany(companyId) { await paymentForm("company", companyId); }

async function paymentForm(kind, id) {
  const entity = await getRecord(kind === "customer" ? "customers" : "companies", id);
  const modal = $("#modal"); modal.classList.remove("hidden");
  modal.innerHTML = `
    <div class="modal-box"><div class="modal-title">إضافة دفعة</div>
      <div class="field"><label>${kind === "customer" ? "العميل" : "الشركة"}</label><input disabled value="${esc(entity?.name||"")}"></div>
      <div class="field"><label>المبلغ *</label><input id="pAmount" type="number" step="1" min="1"></div>
      <div class="field"><label>العملة</label><select id="pCurrency"><option value="USD">USD</option><option value="IQD">IQD</option></select></div>
      <div class="field"><label>سعر الصرف *</label><input id="pRate" type="number" step="0.01" min="0"></div>
      <div class="field"><label>التاريخ والوقت</label><input id="pDate" type="datetime-local" value="${nowLocal()}"></div>
      <div class="field"><label>ملاحظات</label><textarea id="pNotes"></textarea></div>
      <div class="form-actions"><button class="btn btn-light" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="savePayment('${kind}','${id}')">حفظ</button></div>
    </div>`;
}

async function savePayment(kind, id) {
  const amount = Number($("#pAmount").value);
  const rate = Number($("#pRate").value);
  if (!Number.isInteger(amount) || amount <= 0 || rate <= 0) { toast("المبلغ يجب أن يكون عددًا صحيحًا وسعر الصرف أكبر من صفر"); return; }
  const customer = kind === "customer" ? await getRecord("customers", id) : null;
  const conversion = convertAmount(amount, $("#pCurrency").value, rate);
  const payment = {
    id: uid("payment"), number: await nextNumber("paymentSeq", "#P"),
    type: kind === "customer" ? "دفعة عميل" : "دفعة شركة",
    customerId: kind === "customer" ? id : null,
    companyId: kind === "company" ? id : (customer?.companyId || null),
    originalAmount: amount, currency: $("#pCurrency").value, rate,
    usd: conversion.usd, iqd: conversion.iqd, dateTime: $("#pDate").value,
    notes: $("#pNotes").value.trim(), createdAt: new Date().toISOString()
  };
  await putRecord("payments", payment);
  if (payment.companyId) await recalcCompany(payment.companyId);
  closeModal(); toast("تم حفظ الدفعة"); render();
}

async function renderPayments(app) {
  const payments = (await getAll("payments")).sort((a,b) => String(b.dateTime||"").localeCompare(String(a.dateTime||"")));
  app.innerHTML = `<div class="section-head"><div class="section-title">الدفعات</div></div>${payments.length ? payments.map((p) => `<div class="card"><div class="row"><strong>${esc(p.number)}</strong><span>${esc(p.type)}</span></div><div>${money(p.usd)} $ | ${money(p.iqd)} د.ع</div><div class="muted">${formatDate(p.dateTime)}</div></div>`).join("") : `<div class="empty">لا توجد دفعات.</div>`}`;
}

async function recalcCompany(companyId) {
  if (!companyId) return;
  const company = await getRecord("companies", companyId);
  if (!company) return;
  const requests = (await getAll("requests")).filter((x) => x.companyId === companyId);
  const payments = (await getAll("payments")).filter((x) => x.companyId === companyId);
  company.totalUSD = requests.reduce((s,x) => s + Number(x.totalUSD||0), 0) - payments.reduce((s,x) => s + Number(x.usd||0), 0);
  company.totalIQD = requests.reduce((s,x) => s + Number(x.totalIQD||0), 0) - payments.reduce((s,x) => s + Number(x.iqd||0), 0);
  await putRecord("companies", company);
}

async function renderExpenses(app) {
  const expenses = (await getAll("expenses")).sort((a,b) => String(b.dateTime||"").localeCompare(String(a.dateTime||"")));
  app.innerHTML = `<div class="section-head"><div class="section-title">المصروفات</div><button class="btn btn-primary" onclick="expenseForm()">＋ إضافة</button></div>${expenses.length ? expenses.map((x) => `<div class="card"><div class="row"><strong>#${esc(x.number)}</strong><span>${esc(x.type)}</span></div><div>${money(x.usd)} $ | ${money(x.iqd)} د.ع</div><div class="muted">${formatDate(x.dateTime)}</div><div class="list-actions"><button class="btn btn-light" onclick="expenseForm('${x.id}')">تعديل</button><button class="btn btn-danger" onclick="deleteExpense('${x.id}')">حذف</button></div></div>`).join("") : `<div class="empty">لا توجد مصروفات.</div>`}`;
}

async function expenseForm(id = "") {
  const x = id ? await getRecord("expenses", id) : {};
  const modal = $("#modal"); modal.classList.remove("hidden");
  modal.innerHTML = `
    <div class="modal-box"><div class="modal-title">${id ? "تعديل المصروف" : "إضافة مصروف"}</div>
      <div class="field"><label>النوع</label><input id="eType" value="${esc(x.type||"أخرى")}"></div>
      <div class="field"><label>المبلغ</label><input id="eAmount" type="number" step="0.01" min="0" value="${x.originalAmount ?? ""}"></div>
      <div class="field"><label>العملة</label><select id="eCurrency"><option value="USD" ${x.currency === "USD" ? "selected" : ""}>USD</option><option value="IQD" ${x.currency === "IQD" ? "selected" : ""}>IQD</option></select></div>
      <div class="field"><label>سعر الصرف</label><input id="eRate" type="number" step="0.01" min="0" value="${x.rate ?? ""}"></div>
      <div class="field"><label>التاريخ والوقت</label><input id="eDate" type="datetime-local" value="${x.dateTime || nowLocal()}"></div>
      <div class="field"><label>ملاحظات</label><textarea id="eNotes">${esc(x.notes||"")}</textarea></div>
      <div class="form-actions"><button class="btn btn-light" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveExpense('${id}')">حفظ</button></div>
    </div>`;
}

async function saveExpense(id) {
  const amount = Number($("#eAmount").value);
  const rate = Number($("#eRate").value);
  if (amount <= 0 || rate <= 0) { toast("أدخل المبلغ وسعر الصرف بشكل صحيح"); return; }
  const old = id ? await getRecord("expenses", id) : null;
  const conversion = convertAmount(amount, $("#eCurrency").value, rate);
  await putRecord("expenses", {
    id: id || uid("expense"), number: old?.number || await nextNumber("expenseSeq", "#E"),
    type: $("#eType").value.trim() || "أخرى", originalAmount: amount,
    currency: $("#eCurrency").value, rate, usd: conversion.usd, iqd: conversion.iqd,
    dateTime: $("#eDate").value, notes: $("#eNotes").value.trim(),
    createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  closeModal(); toast("تم حفظ المصروف"); render();
}

async function deleteExpense(id) {
  const x = await getRecord("expenses", id);
  if (!x) return;
  if (!confirm("نقل المصروف إلى سلة المحذوفات؟")) return;
  await putRecord("trash", { id: uid("trash"), originalId: id, type: "expense", deletedAt: new Date().toISOString(), data: x });
  await deleteRecord("expenses", id);
  toast("تم حذف المصروف"); render();
}

$("#homeBtn")?.addEventListener("click", home);
$("#backBtn")?.addEventListener("click", goBack);
$("#modal")?.addEventListener("click", (event) => {
  if (event.target.id === "modal") closeModal();
});

openDB().then(render).catch((error) => {
  console.error(error);
  const app = $("#app");
  if (app) app.innerHTML = `<div class="empty danger-text">تعذر فتح قاعدة البيانات المحلية.</div>`;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((error) => console.error("Service Worker:", error));
  });
}
