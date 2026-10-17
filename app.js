'use strict';

/* =====================================================================
   MediCare HMS - frontend (vanilla JavaScript, talks to the Flask API)
   ===================================================================== */

const $ = (sel) => document.querySelector(sel);
const content = $('#page-content');
const state = { page: 'dashboard', q: '', doctorId: '', date: '' };
let actions = {};            // click handlers for the page currently shown

/* ---------- small helpers ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '';

const todayStr = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD (local time)

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3200);
}

const badge = (s) => `<span class="badge ${esc(String(s).toLowerCase())}">${esc(s)}</span>`;
const btn = (act, id, label, cls = '') =>
  `<button class="btn sm ${cls}" data-act="${act}" data-id="${esc(id)}">${label}</button>`;

function table(cols, rows, empty = 'No records found.') {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const head = cols.map((c) => `<th>${c.h}</th>`).join('');
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td>${c.f(r)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const pageHead = (title, button = '', kicker = '') =>
  `<div class="page-head"><div><div class="eyebrow">${kicker || 'MEDICARE HMS'}</div><h2>${title}</h2></div>${button}</div>`;

/* ---------- generic modal form ---------- */
function openForm(title, fields, onSubmit) {
  const dlg = $('#modal');
  const form = $('#modal-form');
  $('#modal-title').textContent = title;

  form.innerHTML = fields.map((f) => {
    const req = f.required === false ? '' : 'required';
    let input;
    if (f.type === 'select') {
      const opts = f.options.map((o) =>
        `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      input = `<select name="${f.name}" ${req}><option value="">-- select --</option>${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" rows="2" ${req}>${esc(f.value ?? '')}</textarea>`;
    } else {
      input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${req}
        ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}
        ${f.step ? `step="${f.step}"` : ''} ${f.pattern ? `pattern="${f.pattern}" title="${esc(f.title || '')}"` : ''}>`;
    }
    return `<label>${esc(f.label)}${input}</label>`;
  }).join('') + `
    <div class="actions">
      <button type="button" class="btn ghost" id="cancel-btn">Cancel</button>
      <button type="submit" class="btn">Save</button>
    </div>`;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    for (const k in data) if (data[k] === '') data[k] = null;
    try { await onSubmit(data); dlg.close(); } catch (err) { toast(err.message, true); }
  };
  $('#cancel-btn').onclick = () => dlg.close();
  dlg.showModal();
}

const closeView = () => $('#view').close();

/* ---------- option loaders for <select> fields ---------- */
const patientOpts = async () => (await api('/api/patients')).map((p) =>
  ({ value: p.patient_id, label: `#${p.patient_id} ${p.name}` }));
const doctorOpts = async () => (await api('/api/doctors')).map((d) =>
  ({ value: d.doctor_id, label: `${d.name} (${d.specialization})` }));
const deptOpts = async () => (await api('/api/departments')).map((d) =>
  ({ value: d.dept_id, label: d.dept_name }));

/* =====================================================================
   PAGES
   ===================================================================== */
const pages = {};

/* ---------- Dashboard ---------- */
const statCard = (num, label) =>
  `<div class="card"><div class="num">${num}</div><div class="lbl">${label}</div></div>`;

pages.dashboard = async () => {
  const [s, appts] = await Promise.all([
    api('/api/stats'),
    api('/api/appointments?date=' + todayStr()),
  ]);
  const pending = appts.filter(a => String(a.status).toLowerCase() === 'pending').length;
  const completed = appts.filter(a => String(a.status).toLowerCase() === 'completed').length;
  const cancelled = appts.filter(a => String(a.status).toLowerCase() === 'cancelled').length;
  const total = appts.length || 1;
  const completedPct = Math.round((completed / total) * 100);

  content.innerHTML = `
    <section class="welcome-banner">
      <div>
        <div class="eyebrow">TODAY · ${fmtDate(todayStr())}</div>
        <h1>Good to see you, Admin<span>.</span></h1>
        <p>Here is the current operational snapshot of your hospital.</p>
      </div>
      <div class="welcome-orb">✚</div>
    </section>
    <div class="dashboard-toolbar">
      <div class="section-title"><span class="pulse"></span> Live overview</div>
      <div class="toolbar-actions">
        <button class="btn ghost" data-act="refresh">↻ Refresh</button>
        <button class="btn" data-act="register">+ Register patient</button>
      </div>
    </div>
    <div class="cards">
      ${statCard(s.patients, 'Registered patients')}
      ${statCard(s.doctors, 'Doctors')}
      ${statCard(s.todays_appointments, "Today's appointments")}
      ${statCard(s.free_rooms, 'Free rooms')}
      ${statCard(money(s.revenue), 'Revenue collected')}
      ${statCard(money(s.pending_dues), 'Pending dues')}
    </div>
    <div class="dashboard-grid">
      <section class="panel appointments-panel">
        <div class="panel-head">
          <div><div class="eyebrow">SCHEDULE</div><h3>Today's appointments</h3></div>
          <button class="text-btn" data-act="appointments">View all →</button>
        </div>
        ${table([
          { h: 'Time', f: (a) => `<strong>${esc(a.appointment_time)}</strong>` },
          { h: 'Patient', f: (a) => esc(a.patient_name) },
          { h: 'Doctor', f: (a) => esc(a.doctor_name) },
          { h: 'Reason', f: (a) => esc(a.reason) },
          { h: 'Status', f: (a) => badge(a.status) },
        ], appts, 'No appointments scheduled for today.')}
      </section>
      <aside class="panel pulse-panel">
        <div class="panel-head"><div><div class="eyebrow">TODAY</div><h3>Appointment pulse</h3></div></div>
        <div class="progress-ring" style="--progress:${completedPct * 3.6}deg"><div><strong>${completed}</strong><span>completed</span></div></div>
        <div class="mini-stats">
          <div><span class="dot coral"></span><div><strong>${pending}</strong><small>Pending</small></div></div>
          <div><span class="dot blue"></span><div><strong>${completed}</strong><small>Completed</small></div></div>
          <div><span class="dot muted-dot"></span><div><strong>${cancelled}</strong><small>Cancelled</small></div></div>
        </div>
      </aside>
    </div>
    <section class="quick-section">
      <div class="section-title">Quick actions</div>
      <div class="quick-grid">
        <button class="quick-card" data-act="patients"><span class="quick-icon coral-bg">♙</span><span><strong>Patients</strong><small>Search records & admissions</small></span><b>→</b></button>
        <button class="quick-card" data-act="doctors"><span class="quick-icon blue-bg">✚</span><span><strong>Doctors</strong><small>Manage medical staff</small></span><b>→</b></button>
        <button class="quick-card" data-act="appointments"><span class="quick-icon ivory-bg">◷</span><span><strong>Appointments</strong><small>Book & manage visits</small></span><b>→</b></button>
        <button class="quick-card" data-act="billing"><span class="quick-icon dark-bg">₹</span><span><strong>Billing</strong><small>Invoices & payments</small></span><b>→</b></button>
      </div>
    </section>`;
  actions = {
    refresh: () => go('dashboard'),
    register: () => go('patients'),
    patients: () => go('patients'),
    doctors: () => go('doctors'),
    appointments: () => go('appointments'),
    billing: () => go('billing'),
  };
};

/* ---------- Patients ---------- */
const patientCols = () => [
  { h: 'ID', f: (p) => p.patient_id },
  { h: 'Name', f: (p) => esc(p.name) },
  { h: 'Age / Gender', f: (p) => `${esc(p.age)} / ${esc(p.gender)}` },
  { h: 'Phone', f: (p) => esc(p.phone) },
  { h: 'Blood', f: (p) => esc(p.blood_group) },
  { h: 'Room', f: (p) => p.room_number ? badge('Occupied').replace('Occupied', 'Room ' + esc(p.room_number)) : '<span class="muted">Not admitted</span>' },
  { h: 'Registered', f: (p) => fmtDate(p.registered_on) },
  { h: 'Actions', f: (p) =>
      btn('view', p.patient_id, 'Record', 'ghost') +
      (p.room_id ? btn('discharge', p.patient_id, 'Discharge', 'ghost') : btn('admit', p.patient_id, 'Admit', 'ghost')) +
      btn('del', p.patient_id, 'Delete', 'danger') },
];

async function loadPatients() {
  const rows = await api('/api/patients?q=' + encodeURIComponent(state.q));
  $('#tbl').innerHTML = table(patientCols(), rows, 'No patients found.');
}

function showRecord({ patient: p, appointments, bills }) {
  const v = $('#view');
  v.innerHTML = `
    <div class="rec-head"><h2>${esc(p.name)}</h2><span class="muted">Patient #${p.patient_id}</span></div>
    <div class="grid">
      <div><span>Age / Gender</span>${esc(p.age)} / ${esc(p.gender)}</div>
      <div><span>Phone</span>${esc(p.phone) || '-'}</div>
      <div><span>Blood group</span>${esc(p.blood_group) || '-'}</div>
      <div><span>Registered</span>${fmtDate(p.registered_on)}</div>
      <div><span>Current room</span>${p.room_number ? esc(p.room_number) + ' (' + esc(p.room_type) + ')' : 'Not admitted'}</div>
      <div><span>Address</span>${esc(p.address) || '-'}</div>
    </div>
    <h3>Appointment history</h3>
    ${table([
      { h: 'Date', f: (a) => fmtDate(a.appointment_date) },
      { h: 'Time', f: (a) => esc(a.appointment_time) },
      { h: 'Doctor', f: (a) => esc(a.doctor_name) },
      { h: 'Reason', f: (a) => esc(a.reason) },
      { h: 'Status', f: (a) => badge(a.status) },
    ], appointments, 'No appointments yet.')}
    <h3>Bills</h3>
    ${table([
      { h: 'Bill #', f: (b) => b.bill_id },
      { h: 'Date', f: (b) => fmtDate(b.bill_date) },
      { h: 'Total', f: (b) => money(b.total_amount) },
      { h: 'Status', f: (b) => badge(b.payment_status) },
    ], bills, 'No bills yet.')}
    <div class="actions"><button class="btn ghost" onclick="closeView()">Close</button></div>`;
  v.showModal();
}

pages.patients = async () => {
  content.innerHTML = `
    ${pageHead('Patients', '<button class="btn" data-act="add">+ Register patient</button>')}
    <input id="search" class="search" placeholder="Search by name, phone or ID..." value="${esc(state.q)}">
    <div id="tbl"></div>`;

  let timer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = e.target.value.trim();
      loadPatients().catch((err) => toast(err.message, true));
    }, 300);
  });

  actions = {
    add: () => openForm('Register patient', [
      { name: 'name', label: 'Full name' },
      { name: 'age', label: 'Age', type: 'number', min: 0, max: 120 },
      { name: 'gender', label: 'Gender', type: 'select',
        options: ['Male', 'Female', 'Other'].map((g) => ({ value: g, label: g })) },
      { name: 'phone', label: 'Phone (10 digits)', required: false, pattern: '[0-9]{10}', title: 'Enter 10 digits' },
      { name: 'blood_group', label: 'Blood group', type: 'select', required: false,
        options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({ value: g, label: g })) },
      { name: 'address', label: 'Address', type: 'textarea', required: false },
    ], async (d) => { await api('/api/patients', 'POST', d); toast('Patient registered'); go('patients'); }),

    view: async (id) => showRecord(await api('/api/patients/' + id)),

    admit: async (id) => {
      const rooms = await api('/api/rooms?available=1');
      if (!rooms.length) return toast('No free rooms available', true);
      openForm('Admit patient to room', [
        { name: 'room_id', label: 'Available room', type: 'select',
          options: rooms.map((r) => ({ value: r.room_id, label: `${r.room_number} - ${r.room_type} (${money(r.charge_per_day)}/day)` })) },
      ], async (d) => {
        await api(`/api/patients/${id}/room`, 'PUT', { room_id: d.room_id });
        toast('Patient admitted'); go('patients');
      });
    },

    discharge: async (id) => {
      if (!confirm('Discharge this patient and free the room?')) return;
      await api(`/api/patients/${id}/room`, 'PUT', { room_id: null });
      toast('Patient discharged'); go('patients');
    },

    del: async (id) => {
      if (!confirm('Delete this patient along with their appointments and bills?')) return;
      await api('/api/patients/' + id, 'DELETE');
      toast('Patient deleted'); go('patients');
    },
  };
  await loadPatients();
};

/* ---------- Doctors ---------- */
pages.doctors = async () => {
  const rows = await api('/api/doctors');
  content.innerHTML = `
    ${pageHead('Doctors', '<button class="btn" data-act="add">+ Add doctor</button>')}
    ${table([
      { h: 'ID', f: (d) => d.doctor_id },
      { h: 'Name', f: (d) => esc(d.name) },
      { h: 'Specialization', f: (d) => esc(d.specialization) },
      { h: 'Department', f: (d) => esc(d.dept_name) },
      { h: 'Phone', f: (d) => esc(d.phone) },
      { h: 'Email', f: (d) => esc(d.email) },
      { h: 'Fee', f: (d) => money(d.consultation_fee) },
      { h: 'Actions', f: (d) => btn('schedule', d.doctor_id, 'Schedule', 'ghost') + btn('del', d.doctor_id, 'Delete', 'danger') },
    ], rows)}`;

  actions = {
    add: async () => {
      const depts = await deptOpts();
      openForm('Add doctor', [
        { name: 'name', label: 'Name' },
        { name: 'specialization', label: 'Specialization' },
        { name: 'dept_id', label: 'Department', type: 'select', options: depts },
        { name: 'phone', label: 'Phone (10 digits)', required: false, pattern: '[0-9]{10}', title: 'Enter 10 digits' },
        { name: 'email', label: 'Email', type: 'email', required: false },
        { name: 'consultation_fee', label: 'Consultation fee', type: 'number', min: 0, step: '0.01', value: 500 },
      ], async (d) => { await api('/api/doctors', 'POST', d); toast('Doctor added'); go('doctors'); });
    },
    schedule: (id) => { state.doctorId = id; go('schedule'); },
    del: async (id) => {
      if (!confirm('Delete this doctor?')) return;
      await api('/api/doctors/' + id, 'DELETE');
      toast('Doctor deleted'); go('doctors');
    },
  };
};

/* ---------- Departments ---------- */
pages.departments = async () => {
  const rows = await api('/api/departments');
  content.innerHTML = `
    ${pageHead('Departments', '<button class="btn" data-act="add">+ Add department</button>')}
    ${table([
      { h: 'ID', f: (d) => d.dept_id },
      { h: 'Department', f: (d) => esc(d.dept_name) },
      { h: 'Location', f: (d) => esc(d.location) },
      { h: 'Doctors', f: (d) => d.doctor_count },
      { h: 'Actions', f: (d) => btn('del', d.dept_id, 'Delete', 'danger') },
    ], rows)}`;

  actions = {
    add: () => openForm('Add department', [
      { name: 'dept_name', label: 'Department name' },
      { name: 'location', label: 'Location (block / floor)', required: false },
    ], async (d) => { await api('/api/departments', 'POST', d); toast('Department added'); go('departments'); }),
    del: async (id) => {
      if (!confirm('Delete this department?')) return;
      await api('/api/departments/' + id, 'DELETE');
      toast('Department deleted'); go('departments');
    },
  };
};

/* ---------- Appointments ---------- */
pages.appointments = async () => {
  const rows = await api('/api/appointments');
  content.innerHTML = `
    ${pageHead('Appointments', '<button class="btn" data-act="add">+ Book appointment</button>')}
    ${table([
      { h: 'ID', f: (a) => a.appointment_id },
      { h: 'Date', f: (a) => fmtDate(a.appointment_date) },
      { h: 'Time', f: (a) => esc(a.appointment_time) },
      { h: 'Patient', f: (a) => esc(a.patient_name) },
      { h: 'Doctor', f: (a) => esc(a.doctor_name) },
      { h: 'Reason', f: (a) => esc(a.reason) },
      { h: 'Status', f: (a) => badge(a.status) },
      { h: 'Actions', f: (a) => a.status === 'Scheduled'
          ? btn('complete', a.appointment_id, 'Complete', 'ghost') + btn('cancel', a.appointment_id, 'Cancel', 'ghost') + btn('del', a.appointment_id, 'Delete', 'danger')
          : btn('del', a.appointment_id, 'Delete', 'danger') },
    ], rows, 'No appointments booked yet.')}`;

  const setStatus = (status) => async (id) => {
    await api('/api/appointments/' + id, 'PATCH', { status });
    toast('Appointment ' + status.toLowerCase()); go('appointments');
  };

  actions = {
    add: async () => {
      const [patients, doctors] = await Promise.all([patientOpts(), doctorOpts()]);
      openForm('Book appointment', [
        { name: 'patient_id', label: 'Patient', type: 'select', options: patients },
        { name: 'doctor_id', label: 'Doctor', type: 'select', options: doctors },
        { name: 'appointment_date', label: 'Date', type: 'date', min: todayStr(), value: todayStr() },
        { name: 'appointment_time', label: 'Time', type: 'time' },
        { name: 'reason', label: 'Reason', type: 'textarea', required: false },
      ], async (d) => { await api('/api/appointments', 'POST', d); toast('Appointment booked'); go('appointments'); });
    },
    complete: setStatus('Completed'),
    cancel: setStatus('Cancelled'),
    del: async (id) => {
      if (!confirm('Delete this appointment?')) return;
      await api('/api/appointments/' + id, 'DELETE');
      toast('Appointment deleted'); go('appointments');
    },
  };
};

/* ---------- Doctor schedule ---------- */
pages.schedule = async () => {
  const doctors = await api('/api/doctors');
  if (!state.doctorId && doctors.length) state.doctorId = doctors[0].doctor_id;

  let rows = [];
  if (state.doctorId) {
    const params = new URLSearchParams({ doctor_id: state.doctorId });
    if (state.date) params.set('date', state.date);
    rows = await api('/api/appointments?' + params);
  }

  content.innerHTML = `
    ${pageHead('Doctor Schedule')}
    <div class="filters">
      <select id="f-doc">${doctors.map((d) =>
        `<option value="${d.doctor_id}" ${String(d.doctor_id) === String(state.doctorId) ? 'selected' : ''}>${esc(d.name)} - ${esc(d.specialization)}</option>`).join('')}</select>
      <input id="f-date" type="date" value="${esc(state.date)}">
      <button class="btn ghost" data-act="today">Today</button>
      <button class="btn ghost" data-act="all">All dates</button>
    </div>
    ${table([
      { h: 'Date', f: (a) => fmtDate(a.appointment_date) },
      { h: 'Time', f: (a) => esc(a.appointment_time) },
      { h: 'Patient', f: (a) => esc(a.patient_name) },
      { h: 'Phone', f: (a) => esc(a.patient_phone) },
      { h: 'Reason', f: (a) => esc(a.reason) },
      { h: 'Status', f: (a) => badge(a.status) },
    ], rows, 'No appointments for this selection.')}`;

  $('#f-doc').onchange = (e) => { state.doctorId = e.target.value; go('schedule'); };
  $('#f-date').onchange = (e) => { state.date = e.target.value; go('schedule'); };
  actions = {
    today: () => { state.date = todayStr(); go('schedule'); },
    all: () => { state.date = ''; go('schedule'); },
  };
};

/* ---------- Rooms ---------- */
pages.rooms = async () => {
  const rows = await api('/api/rooms');
  content.innerHTML = `
    ${pageHead('Rooms', '<button class="btn" data-act="add">+ Add room</button>')}
    ${table([
      { h: 'Room', f: (r) => esc(r.room_number) },
      { h: 'Type', f: (r) => esc(r.room_type) },
      { h: 'Charge / day', f: (r) => money(r.charge_per_day) },
      { h: 'Status', f: (r) => badge(r.is_available ? 'Available' : 'Occupied') },
      { h: 'Patient', f: (r) => esc(r.patient_name) || '<span class="muted">-</span>' },
      { h: 'Actions', f: (r) => btn('del', r.room_id, 'Delete', 'danger') },
    ], rows)}`;

  actions = {
    add: () => openForm('Add room', [
      { name: 'room_number', label: 'Room number' },
      { name: 'room_type', label: 'Type', type: 'select',
        options: ['General Ward', 'Private', 'ICU', 'Operation Theatre'].map((t) => ({ value: t, label: t })) },
      { name: 'charge_per_day', label: 'Charge per day', type: 'number', min: 0, step: '0.01' },
    ], async (d) => { await api('/api/rooms', 'POST', d); toast('Room added'); go('rooms'); }),
    del: async (id) => {
      if (!confirm('Delete this room?')) return;
      await api('/api/rooms/' + id, 'DELETE');
      toast('Room deleted'); go('rooms');
    },
  };
};

/* ---------- Billing ---------- */
function showInvoice(b) {
  const v = $('#view');
  const roomLine = b.room_number
    ? `Room ${esc(b.room_number)} (${esc(b.room_type)}) &times; ${b.days_stayed} day(s) @ ${money(b.charge_per_day)}`
    : 'Room charges';
  v.innerHTML = `
    <div class="invoice">
      <div class="inv-head">
        <div><h2>MediCare Hospital</h2><span class="muted">Hospital Management System</span></div>
        <div style="text-align:right">Invoice #${b.bill_id}<br>${fmtDate(b.bill_date)}<br>${badge(b.payment_status)}</div>
      </div>
      <p><strong>Patient:</strong> ${esc(b.patient_name)} (ID ${b.patient_id})
         ${b.patient_phone ? ' &middot; ' + esc(b.patient_phone) : ''}</p>
      ${b.doctor_name ? `<p><strong>Doctor:</strong> ${esc(b.doctor_name)} (${esc(b.specialization)}) &middot; ${fmtDate(b.appointment_date)}</p>` : ''}
      <div class="table-wrap"><table class="inv-table">
        <thead><tr><th>Description</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Consultation fee</td><td>${money(b.consultation_fee)}</td></tr>
          <tr><td>${roomLine}</td><td>${money(b.room_charges)}</td></tr>
          <tr><td>Other charges (medicines, tests)</td><td>${money(b.other_charges)}</td></tr>
          <tr class="inv-total"><td>Total</td><td>${money(b.total_amount)}</td></tr>
        </tbody>
      </table></div>
      <div class="actions no-print">
        <button class="btn ghost" onclick="closeView()">Close</button>
        <button class="btn" onclick="window.print()">Print</button>
      </div>
    </div>`;
  v.showModal();
}

pages.billing = async () => {
  const rows = await api('/api/bills');
  content.innerHTML = `
    ${pageHead('Billing', '<button class="btn" data-act="add">+ Generate bill</button>')}
    ${table([
      { h: 'Bill #', f: (b) => b.bill_id },
      { h: 'Date', f: (b) => fmtDate(b.bill_date) },
      { h: 'Patient', f: (b) => esc(b.patient_name) },
      { h: 'Consultation', f: (b) => money(b.consultation_fee) },
      { h: 'Room', f: (b) => money(b.room_charges) },
      { h: 'Other', f: (b) => money(b.other_charges) },
      { h: 'Total', f: (b) => `<strong>${money(b.total_amount)}</strong>` },
      { h: 'Status', f: (b) => badge(b.payment_status) },
      { h: 'Actions', f: (b) => btn('invoice', b.bill_id, 'Invoice', 'ghost') +
          (b.payment_status === 'Pending' ? btn('pay', b.bill_id, 'Mark paid', 'ghost') : '') +
          btn('del', b.bill_id, 'Delete', 'danger') },
    ], rows, 'No bills generated yet.')}`;

  actions = {
    add: async () => {
      const [patients, appts, rooms] = await Promise.all([
        patientOpts(), api('/api/appointments'), api('/api/rooms'),
      ]);
      openForm('Generate bill', [
        { name: 'patient_id', label: 'Patient', type: 'select', options: patients },
        { name: 'appointment_id', label: 'Appointment (optional - adds the doctor fee)', type: 'select', required: false,
          options: appts.filter((a) => a.status !== 'Cancelled').map((a) => ({
            value: a.appointment_id,
            label: `#${a.appointment_id} ${a.patient_name} / ${a.doctor_name} / ${fmtDate(a.appointment_date)}` })) },
        { name: 'room_id', label: 'Room (optional)', type: 'select', required: false,
          options: rooms.map((r) => ({ value: r.room_id, label: `${r.room_number} - ${r.room_type} (${money(r.charge_per_day)}/day)` })) },
        { name: 'days_stayed', label: 'Days stayed', type: 'number', min: 0, value: 0, required: false },
        { name: 'other_charges', label: 'Other charges (medicines, tests)', type: 'number', min: 0, step: '0.01', value: 0, required: false },
      ], async (d) => {
        const bill = await api('/api/bills', 'POST', d);
        toast('Bill generated'); await go('billing');
        showInvoice(await api('/api/bills/' + bill.bill_id));
      });
    },
    invoice: async (id) => showInvoice(await api('/api/bills/' + id)),
    pay: async (id) => { await api(`/api/bills/${id}/pay`, 'PATCH'); toast('Bill marked as paid'); go('billing'); },
    del: async (id) => {
      if (!confirm('Delete this bill?')) return;
      await api('/api/bills/' + id, 'DELETE');
      toast('Bill deleted'); go('billing');
    },
  };
};

/* =====================================================================
   NAVIGATION + EVENT WIRING
   ===================================================================== */
async function go(page) {
  state.page = page;
  document.querySelectorAll('#nav button').forEach((b) =>
    b.classList.toggle('active', b.dataset.page === page));
  actions = {};
  content.innerHTML = '<div class="empty">Loading...</div>';
  try {
    await pages[page]();
  } catch (err) {
    content.innerHTML = `<div class="empty error">${esc(err.message)}</div>`;
  }
}

$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-page]');
  if (b) go(b.dataset.page);
});

// one click handler for every [data-act] button on the current page
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  try { await fn(el.dataset.id, el); } catch (err) { toast(err.message, true); }
});

// ---------- global interaction enhancements ----------
function updateClock() {
  const el = $('#live-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
}
setInterval(updateClock, 1000); updateClock();

const shortcutModal = $('#shortcut-modal');
const commandModal = $('#command-modal');
const commandItems = [
  ['dashboard','Dashboard','Hospital overview'],
  ['patients','Patients','Records, admissions & search'],
  ['doctors','Doctors','Medical staff'],
  ['departments','Departments','Hospital departments'],
  ['appointments','Appointments','Bookings & visit status'],
  ['schedule','Doctor Schedule','Doctor availability'],
  ['rooms','Rooms','Room occupancy'],
  ['billing','Billing','Invoices & payments']
];
function renderCommands(filter='') {
  const list = $('#command-list');
  if (!list) return;
  const items = commandItems.filter(x => (x[1]+' '+x[2]).toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML = items.map((x,i) => `<button class="command-item" data-command="${x[0]}"><span class="command-num">${i+1}</span><span><strong>${x[1]}</strong><small>${x[2]}</small></span><kbd>↵</kbd></button>`).join('') || '<div class="empty">No section found.</div>';
}
function openCommand() { renderCommands(); commandModal.showModal(); setTimeout(() => $('#command-search')?.focus(), 50); }
$('#shortcut-btn')?.addEventListener('click', () => shortcutModal.showModal());
$('#command-search')?.addEventListener('input', e => renderCommands(e.target.value));
$('#command-list')?.addEventListener('click', e => {
  const item=e.target.closest('[data-command]'); if(!item) return;
  commandModal.close(); go(item.dataset.command);
});
$('#sidebar-toggle')?.addEventListener('click', () => document.body.classList.toggle('sidebar-collapsed'));
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') { e.preventDefault(); openCommand(); return; }
  if (e.key==='Escape') { if(commandModal?.open) commandModal.close(); if(shortcutModal?.open) shortcutModal.close(); }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
    const map={'1':'dashboard','2':'patients','3':'doctors','4':'appointments','5':'rooms','6':'billing'};
    if(map[e.key]) go(map[e.key]);
  }
});

go('dashboard');
