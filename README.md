# MediCare Hospital Management System

DBMS mini project - Healthcare domain.

**Architecture:** HTML + CSS + JavaScript -> Python Flask (REST API) -> PostgreSQL -> managed with pgAdmin

## Features
- **Patients** - register, search, full record (appointments + bills), admit / discharge to rooms
- **Doctors & Departments** - add / delete, doctors linked to departments
- **Appointments** - book, complete, cancel; a doctor can't be double-booked
- **Doctor Schedule** - pick a doctor and (optionally) a date
- **Rooms** - availability tracked automatically by a database trigger
- **Billing** - bill = consultation fee + (room charge x days) + other charges, printable invoice, mark paid
- **Dashboard** - counts, revenue, pending dues, today's appointments

## Project structure
```
hospital-management/
|-- app.py              Flask backend (REST API)
|-- schema.sql          Tables, view, trigger + sample data
|-- queries.sql         Sample queries for demo / viva
|-- requirements.txt
`-- static/
    |-- index.html
    |-- style.css
    `-- app.js
```

## Setup (step by step)

### 1. Create the database in pgAdmin
1. Open **pgAdmin** and connect to your server.
2. Right-click **Databases -> Create -> Database...**, name it `hospital_db`, Save.
3. Right-click `hospital_db` -> **Query Tool**.
4. Click the folder icon, open `schema.sql`, press **F5** to run it.
5. Refresh the database tree: **Schemas -> public -> Tables** should show 6 tables
   (department, doctor, room, patient, appointment, billing) and the view `doctor_schedule`.

> Needs PostgreSQL 12 or newer. You can re-run `schema.sql` any time to reset the data.

### 2. Set your password
Open `app.py` and edit `DB_CONFIG` (top of file) - at minimum the `password`
you chose while installing PostgreSQL. Or set environment variables
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

### 3. Install and run
```bash
cd hospital-management
python -m venv venv
venv\Scripts\activate          # Windows   (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python app.py
```
Open **http://127.0.0.1:5000** in your browser.

## Database design (for your report)
| Table | Primary key | Foreign keys |
|---|---|---|
| department | dept_id | - |
| doctor | doctor_id | dept_id -> department |
| room | room_id | - |
| patient | patient_id | room_id -> room (only while admitted) |
| appointment | appointment_id | patient_id -> patient, doctor_id -> doctor |
| billing | bill_id | patient_id, appointment_id, room_id |

Relationships: Department 1-N Doctor, Patient M-N Doctor (via Appointment), Room 1-N Patient (over time), Patient 1-N Billing.

## DBMS concepts demonstrated
- Primary keys, foreign keys, `ON DELETE` rules (CASCADE / RESTRICT / SET NULL)
- Constraints: `NOT NULL`, `UNIQUE`, `CHECK`, `DEFAULT`
- Partial unique index (prevents double-booking a doctor)
- Generated column (`billing.total_amount`)
- View (`doctor_schedule`)
- Trigger + PL/pgSQL function (`sync_room_availability`)
- Joins, GROUP BY / HAVING, subqueries (see `queries.sql`)
- Normalization (3NF)

## Troubleshooting
- **"Cannot connect to the database"** - PostgreSQL not running, or wrong password / db name in `DB_CONFIG`.
- **`relation "patient" does not exist`** - `schema.sql` wasn't run on `hospital_db`.
- **Port 5000 busy** - run with `set PORT=5001` (Windows) / `PORT=5001 python app.py`.
- **`pip install psycopg2-binary` fails** - upgrade pip: `python -m pip install --upgrade pip`.
