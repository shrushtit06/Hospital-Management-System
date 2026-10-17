"""
Hospital Management System - Flask REST API (PostgreSQL backend)

Run:  python app.py      then open  http://127.0.0.1:5000
"""
import os
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation

import psycopg2
from psycopg2 import errors
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request, send_from_directory
from flask.json.provider import DefaultJSONProvider

# ---------------------------------------------------------------------
# Database settings - change the defaults here or set environment variables
# ---------------------------------------------------------------------
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
    "dbname": os.getenv("DB_NAME", "hospital_db"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "YourNewPassword123"),   # <-- your PostgreSQL password
}


class HospitalJSONProvider(DefaultJSONProvider):
    """Send dates as YYYY-MM-DD, times as HH:MM and money as plain numbers."""

    @staticmethod
    def default(o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, time):
            return o.strftime("%H:%M")
        if isinstance(o, Decimal):
            return float(o)
        return DefaultJSONProvider.default(o)


app = Flask(__name__)
app.json = HospitalJSONProvider(app)


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
def run(sql, params=None, fetch="all"):
    """Run one SQL statement in its own transaction.
    fetch = 'all' -> list of rows, 'one' -> single row, 'count' -> affected rows."""
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            if fetch == "all":
                return cur.fetchall()
            if fetch == "one":
                return cur.fetchone()
            return cur.rowcount
    finally:
        conn.close()


def payload():
    return request.get_json(silent=True) or {}


def require(data, *fields):
    missing = [f for f in fields if data.get(f) in (None, "")]
    if missing:
        raise ValueError("Missing required field(s): " + ", ".join(missing))


def opt(data, key):
    """Optional text field: stripped string or None."""
    value = data.get(key)
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def removed(count, what):
    if count == 0:
        return jsonify(error=f"{what} not found"), 404
    return jsonify(message=f"{what} deleted")


# ---------------------------------------------------------------------
# Error handling - turns database errors into readable messages
# ---------------------------------------------------------------------
@app.errorhandler(psycopg2.Error)
def handle_db_error(e):
    app.logger.error("Database error: %s", e)
    if isinstance(e, psycopg2.OperationalError):
        return jsonify(error="Cannot connect to the database. Check DB_CONFIG in app.py "
                             "and make sure PostgreSQL is running."), 500
    if isinstance(e, errors.UniqueViolation):
        constraint = e.diag.constraint_name or ""
        if "slot" in constraint:
            return jsonify(error="That doctor already has an appointment at the selected date and time."), 409
        return jsonify(error="A record with the same unique value (e.g. email or name) already exists."), 409
    if isinstance(e, errors.ForeignKeyViolation):
        return jsonify(error="Operation blocked: this record is linked to other records "
                             "(for example a doctor with appointments, or a room in use)."), 409
    if isinstance(e, errors.CheckViolation):
        return jsonify(error="One of the values is not allowed (check age, amounts, status)."), 400
    if isinstance(e, errors.NotNullViolation):
        return jsonify(error="A required value is missing."), 400
    if isinstance(e, errors.RaiseException):          # raised by our trigger
        return jsonify(error=e.diag.message_primary), 409
    if isinstance(e, psycopg2.DataError):
        return jsonify(error="Invalid input format."), 400
    return jsonify(error="Database error. See the terminal for details."), 500


@app.errorhandler(ValueError)
@app.errorhandler(InvalidOperation)
def handle_value_error(e):
    return jsonify(error=str(e) if isinstance(e, ValueError) else "Invalid number supplied."), 400


# ---------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------
@app.get("/api/stats")
def stats():
    row = run("""
        SELECT
          (SELECT COUNT(*) FROM patient)                                   AS patients,
          (SELECT COUNT(*) FROM doctor)                                    AS doctors,
          (SELECT COUNT(*) FROM appointment
            WHERE appointment_date = CURRENT_DATE AND status = 'Scheduled') AS todays_appointments,
          (SELECT COUNT(*) FROM room WHERE is_available)                   AS free_rooms,
          (SELECT COALESCE(SUM(total_amount), 0) FROM billing
            WHERE payment_status = 'Paid')                                 AS revenue,
          (SELECT COALESCE(SUM(total_amount), 0) FROM billing
            WHERE payment_status = 'Pending')                              AS pending_dues
    """, fetch="one")
    return jsonify(row)


# ---------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------
@app.get("/api/departments")
def list_departments():
    return jsonify(run("""
        SELECT d.*, COUNT(doc.doctor_id) AS doctor_count
        FROM department d
        LEFT JOIN doctor doc ON doc.dept_id = d.dept_id
        GROUP BY d.dept_id
        ORDER BY d.dept_name
    """))


@app.post("/api/departments")
def add_department():
    d = payload()
    require(d, "dept_name")
    row = run("INSERT INTO department (dept_name, location) VALUES (%s, %s) RETURNING *",
              (d["dept_name"].strip(), opt(d, "location")), "one")
    return jsonify(row), 201


@app.delete("/api/departments/<int:dept_id>")
def delete_department(dept_id):
    return removed(run("DELETE FROM department WHERE dept_id = %s", (dept_id,), "count"), "Department")


# ---------------------------------------------------------------------
# Doctors
# ---------------------------------------------------------------------
@app.get("/api/doctors")
def list_doctors():
    return jsonify(run("""
        SELECT d.*, dep.dept_name
        FROM doctor d
        JOIN department dep ON dep.dept_id = d.dept_id
        ORDER BY d.name
    """))


@app.post("/api/doctors")
def add_doctor():
    d = payload()
    require(d, "name", "specialization", "dept_id")
    fee = d.get("consultation_fee")
    fee = Decimal(str(fee)) if fee not in (None, "") else Decimal("500")
    row = run("""
        INSERT INTO doctor (name, specialization, phone, email, consultation_fee, dept_id)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING *
    """, (d["name"].strip(), d["specialization"].strip(), opt(d, "phone"), opt(d, "email"),
          fee, int(d["dept_id"])), "one")
    return jsonify(row), 201


@app.delete("/api/doctors/<int:doctor_id>")
def delete_doctor(doctor_id):
    return removed(run("DELETE FROM doctor WHERE doctor_id = %s", (doctor_id,), "count"), "Doctor")


# ---------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------
@app.get("/api/patients")
def list_patients():
    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        rows = run("""
            SELECT p.*, r.room_number
            FROM patient p LEFT JOIN room r ON r.room_id = p.room_id
            WHERE p.name ILIKE %s OR p.phone ILIKE %s OR CAST(p.patient_id AS TEXT) = %s
            ORDER BY p.patient_id DESC
        """, (like, like, q))
    else:
        rows = run("""
            SELECT p.*, r.room_number
            FROM patient p LEFT JOIN room r ON r.room_id = p.room_id
            ORDER BY p.patient_id DESC
        """)
    return jsonify(rows)


@app.post("/api/patients")
def add_patient():
    d = payload()
    require(d, "name", "age", "gender")
    row = run("""
        INSERT INTO patient (name, age, gender, phone, address, blood_group)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING *
    """, (d["name"].strip(), int(d["age"]), d["gender"], opt(d, "phone"),
          opt(d, "address"), opt(d, "blood_group")), "one")
    return jsonify(row), 201


@app.get("/api/patients/<int:pid>")
def patient_record(pid):
    """Complete patient record: details + appointment history + bills."""
    patient = run("""
        SELECT p.*, r.room_number, r.room_type
        FROM patient p LEFT JOIN room r ON r.room_id = p.room_id
        WHERE p.patient_id = %s
    """, (pid,), "one")
    if not patient:
        return jsonify(error="Patient not found"), 404
    appointments = run("""
        SELECT * FROM doctor_schedule WHERE patient_id = %s
        ORDER BY appointment_date DESC, appointment_time DESC
    """, (pid,))
    bills = run("SELECT * FROM billing WHERE patient_id = %s ORDER BY bill_id DESC", (pid,))
    return jsonify(patient=patient, appointments=appointments, bills=bills)


@app.put("/api/patients/<int:pid>/room")
def set_patient_room(pid):
    """Admit a patient to a room (room_id) or discharge them (room_id = null).
    The database trigger keeps room availability in sync."""
    room_id = payload().get("room_id") or None
    if room_id is not None:
        room_id = int(room_id)
    count = run("UPDATE patient SET room_id = %s WHERE patient_id = %s", (room_id, pid), "count")
    if count == 0:
        return jsonify(error="Patient not found"), 404
    return jsonify(message="Admitted to room" if room_id else "Patient discharged")


@app.delete("/api/patients/<int:pid>")
def delete_patient(pid):
    return removed(run("DELETE FROM patient WHERE patient_id = %s", (pid,), "count"), "Patient")


# ---------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------
@app.get("/api/rooms")
def list_rooms():
    only_free = request.args.get("available") == "1"
    return jsonify(run(f"""
        SELECT r.*, p.name AS patient_name
        FROM room r
        LEFT JOIN patient p ON p.room_id = r.room_id
        {"WHERE r.is_available" if only_free else ""}
        ORDER BY r.room_number
    """))


@app.post("/api/rooms")
def add_room():
    d = payload()
    require(d, "room_number", "room_type", "charge_per_day")
    row = run("""
        INSERT INTO room (room_number, room_type, charge_per_day)
        VALUES (%s, %s, %s) RETURNING *
    """, (d["room_number"].strip(), d["room_type"], Decimal(str(d["charge_per_day"]))), "one")
    return jsonify(row), 201


@app.delete("/api/rooms/<int:room_id>")
def delete_room(room_id):
    return removed(run("DELETE FROM room WHERE room_id = %s", (room_id,), "count"), "Room")


# ---------------------------------------------------------------------
# Appointments (also serves the doctor schedule through filters)
# ---------------------------------------------------------------------
@app.get("/api/appointments")
def list_appointments():
    conditions, params = [], []
    if request.args.get("doctor_id"):
        conditions.append("doctor_id = %s")
        params.append(int(request.args["doctor_id"]))
    if request.args.get("date"):
        conditions.append("appointment_date = %s")
        params.append(request.args["date"])
    if request.args.get("status"):
        conditions.append("status = %s")
        params.append(request.args["status"])
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    return jsonify(run(
        f"SELECT * FROM doctor_schedule {where} ORDER BY appointment_date, appointment_time", params))


@app.post("/api/appointments")
def book_appointment():
    d = payload()
    require(d, "patient_id", "doctor_id", "appointment_date", "appointment_time")
    day = datetime.strptime(d["appointment_date"], "%Y-%m-%d").date()
    if day < date.today():
        raise ValueError("Appointment date cannot be in the past.")
    row = run("""
        INSERT INTO appointment (patient_id, doctor_id, appointment_date, appointment_time, reason)
        VALUES (%s, %s, %s, %s, %s) RETURNING *
    """, (int(d["patient_id"]), int(d["doctor_id"]), day, d["appointment_time"],
          opt(d, "reason")), "one")
    return jsonify(row), 201


@app.patch("/api/appointments/<int:aid>")
def update_appointment_status(aid):
    status = payload().get("status")
    if status not in ("Scheduled", "Completed", "Cancelled"):
        raise ValueError("Status must be Scheduled, Completed or Cancelled.")
    count = run("UPDATE appointment SET status = %s WHERE appointment_id = %s", (status, aid), "count")
    if count == 0:
        return jsonify(error="Appointment not found"), 404
    return jsonify(message=f"Appointment marked {status}")


@app.delete("/api/appointments/<int:aid>")
def delete_appointment(aid):
    return removed(run("DELETE FROM appointment WHERE appointment_id = %s", (aid,), "count"), "Appointment")


# ---------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------
@app.get("/api/bills")
def list_bills():
    return jsonify(run("""
        SELECT b.*, p.name AS patient_name
        FROM billing b JOIN patient p ON p.patient_id = b.patient_id
        ORDER BY b.bill_id DESC
    """))


@app.get("/api/bills/<int:bill_id>")
def bill_detail(bill_id):
    row = run("""
        SELECT b.*, p.name AS patient_name, p.phone AS patient_phone,
               doc.name AS doctor_name, doc.specialization, a.appointment_date,
               r.room_number, r.room_type, r.charge_per_day
        FROM billing b
        JOIN patient p            ON p.patient_id     = b.patient_id
        LEFT JOIN appointment a   ON a.appointment_id = b.appointment_id
        LEFT JOIN doctor doc      ON doc.doctor_id    = a.doctor_id
        LEFT JOIN room r          ON r.room_id        = b.room_id
        WHERE b.bill_id = %s
    """, (bill_id,), "one")
    if not row:
        return jsonify(error="Bill not found"), 404
    return jsonify(row)


@app.post("/api/bills")
def generate_bill():
    """Total = doctor's consultation fee + (room charge/day x days) + other charges.
    The total_amount column itself is computed by PostgreSQL."""
    d = payload()
    require(d, "patient_id")
    patient_id = int(d["patient_id"])

    consultation = Decimal("0")
    appointment_id = int(d["appointment_id"]) if d.get("appointment_id") else None
    if appointment_id:
        appt = run("""
            SELECT a.patient_id, doc.consultation_fee
            FROM appointment a JOIN doctor doc ON doc.doctor_id = a.doctor_id
            WHERE a.appointment_id = %s
        """, (appointment_id,), "one")
        if not appt:
            return jsonify(error="Appointment not found"), 404
        if appt["patient_id"] != patient_id:
            raise ValueError("That appointment belongs to a different patient.")
        consultation = appt["consultation_fee"]

    days = int(d.get("days_stayed") or 0)
    room_id = int(d["room_id"]) if d.get("room_id") else None
    room_charges = Decimal("0")
    if room_id:
        room = run("SELECT charge_per_day FROM room WHERE room_id = %s", (room_id,), "one")
        if not room:
            return jsonify(error="Room not found"), 404
        room_charges = room["charge_per_day"] * days

    other = Decimal(str(d.get("other_charges") or 0))
    if days < 0 or other < 0:
        raise ValueError("Days and charges cannot be negative.")

    row = run("""
        INSERT INTO billing (patient_id, appointment_id, room_id, days_stayed,
                             consultation_fee, room_charges, other_charges)
        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *
    """, (patient_id, appointment_id, room_id, days, consultation, room_charges, other), "one")
    return jsonify(row), 201


@app.patch("/api/bills/<int:bill_id>/pay")
def pay_bill(bill_id):
    count = run("UPDATE billing SET payment_status = 'Paid' WHERE bill_id = %s", (bill_id,), "count")
    if count == 0:
        return jsonify(error="Bill not found"), 404
    return jsonify(message="Bill marked as paid")


@app.delete("/api/bills/<int:bill_id>")
def delete_bill(bill_id):
    return removed(run("DELETE FROM billing WHERE bill_id = %s", (bill_id,), "count"), "Bill")


if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
