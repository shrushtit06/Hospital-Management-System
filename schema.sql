-- =====================================================================
--  Hospital Management System - PostgreSQL schema + sample data
-- =====================================================================

DROP VIEW IF EXISTS doctor_schedule;
DROP TABLE IF EXISTS billing, appointment, patient, room, doctor, department CASCADE;
DROP FUNCTION IF EXISTS sync_room_availability();

-- ---------------------------------------------------------------------
-- 1. DEPARTMENT
-- ---------------------------------------------------------------------
CREATE TABLE department (
    dept_id     SERIAL PRIMARY KEY,
    dept_name   VARCHAR(80) NOT NULL UNIQUE,
    location    VARCHAR(80)
);

-- ---------------------------------------------------------------------
-- 2. DOCTOR  (many doctors belong to one department)
-- ---------------------------------------------------------------------
CREATE TABLE doctor (
    doctor_id        SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    specialization   VARCHAR(100) NOT NULL,
    phone            VARCHAR(15),
    email            VARCHAR(100) UNIQUE,
    consultation_fee NUMERIC(10,2) NOT NULL DEFAULT 500 CHECK (consultation_fee >= 0),
    dept_id          INT NOT NULL REFERENCES department(dept_id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- 3. ROOM
-- ---------------------------------------------------------------------
CREATE TABLE room (
    room_id         SERIAL PRIMARY KEY,
    room_number     VARCHAR(10) NOT NULL UNIQUE,
    room_type       VARCHAR(20) NOT NULL
                    CHECK (room_type IN ('General Ward', 'Private', 'ICU', 'Operation Theatre')),
    charge_per_day  NUMERIC(10,2) NOT NULL CHECK (charge_per_day >= 0),
    is_available    BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- 4. PATIENT  (room_id is filled only while the patient is admitted)
-- ---------------------------------------------------------------------
CREATE TABLE patient (
    patient_id     SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    age            INT CHECK (age BETWEEN 0 AND 120),
    gender         VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    phone          VARCHAR(15),
    address        TEXT,
    blood_group    VARCHAR(3) CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    registered_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    room_id        INT REFERENCES room(room_id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- 5. APPOINTMENT  (patient <-> doctor, many-to-many resolved here)
-- ---------------------------------------------------------------------
CREATE TABLE appointment (
    appointment_id    SERIAL PRIMARY KEY,
    patient_id        INT NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    doctor_id         INT NOT NULL REFERENCES doctor(doctor_id)   ON DELETE RESTRICT,
    appointment_date  DATE NOT NULL,
    appointment_time  TIME NOT NULL,
    reason            TEXT,
    status            VARCHAR(15) NOT NULL DEFAULT 'Scheduled'
                      CHECK (status IN ('Scheduled', 'Completed', 'Cancelled'))
);

-- A doctor cannot be double-booked (cancelled slots can be reused)
CREATE UNIQUE INDEX uq_doctor_slot
    ON appointment (doctor_id, appointment_date, appointment_time)
    WHERE status <> 'Cancelled';

CREATE INDEX idx_appointment_patient ON appointment (patient_id);
CREATE INDEX idx_appointment_doctor_date ON appointment (doctor_id, appointment_date);

-- ---------------------------------------------------------------------
-- 6. BILLING  (total is calculated by the database itself)
-- ---------------------------------------------------------------------
CREATE TABLE billing (
    bill_id          SERIAL PRIMARY KEY,
    patient_id       INT NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    appointment_id   INT REFERENCES appointment(appointment_id) ON DELETE SET NULL,
    room_id          INT REFERENCES room(room_id) ON DELETE SET NULL,
    days_stayed      INT NOT NULL DEFAULT 0 CHECK (days_stayed >= 0),
    consultation_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (consultation_fee >= 0),
    room_charges     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (room_charges >= 0),
    other_charges    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
    total_amount     NUMERIC(10,2) GENERATED ALWAYS AS
                     (consultation_fee + room_charges + other_charges) STORED,
    payment_status   VARCHAR(10) NOT NULL DEFAULT 'Pending'
                     CHECK (payment_status IN ('Pending', 'Paid')),
    bill_date        DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ---------------------------------------------------------------------
-- VIEW: doctor schedule (used by the Schedule page and Appointments page)
-- ---------------------------------------------------------------------
CREATE VIEW doctor_schedule AS
SELECT  a.appointment_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        d.doctor_id,
        d.name           AS doctor_name,
        d.specialization,
        p.patient_id,
        p.name           AS patient_name,
        p.phone          AS patient_phone
FROM    appointment a
JOIN    doctor  d ON d.doctor_id  = a.doctor_id
JOIN    patient p ON p.patient_id = a.patient_id;

-- ---------------------------------------------------------------------
-- TRIGGER: keep room.is_available in sync with patient admissions
--   * admitting a patient marks the room occupied (error if already taken)
--   * discharging / moving / deleting a patient frees the old room
-- ---------------------------------------------------------------------
CREATE FUNCTION sync_room_availability() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.room_id IS NOT NULL THEN
            IF NOT COALESCE((SELECT is_available FROM room WHERE room_id = NEW.room_id), FALSE) THEN
                RAISE EXCEPTION 'Room is already occupied or does not exist';
            END IF;
            UPDATE room SET is_available = FALSE WHERE room_id = NEW.room_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.room_id IS NOT NULL THEN
            UPDATE room SET is_available = TRUE WHERE room_id = OLD.room_id;
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE
    IF NEW.room_id IS DISTINCT FROM OLD.room_id THEN
        IF NEW.room_id IS NOT NULL THEN
            IF NOT COALESCE((SELECT is_available FROM room WHERE room_id = NEW.room_id), FALSE) THEN
                RAISE EXCEPTION 'Room is already occupied or does not exist';
            END IF;
            UPDATE room SET is_available = FALSE WHERE room_id = NEW.room_id;
        END IF;
        IF OLD.room_id IS NOT NULL THEN
            UPDATE room SET is_available = TRUE WHERE room_id = OLD.room_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patient_room
BEFORE INSERT OR UPDATE OF room_id OR DELETE ON patient
FOR EACH ROW EXECUTE FUNCTION sync_room_availability();

-- =====================================================================
--  SAMPLE DATA
-- =====================================================================
INSERT INTO department (dept_name, location) VALUES
    ('Cardiology',       'Block A, Floor 2'),
    ('Neurology',        'Block A, Floor 3'),
    ('Orthopedics',      'Block B, Floor 1'),
    ('Pediatrics',       'Block C, Floor 1'),
    ('General Medicine', 'Block B, Ground Floor');

INSERT INTO doctor (name, specialization, phone, email, consultation_fee, dept_id) VALUES
    ('Dr. Anil Sharma',   'Cardiologist',       '9820011111', 'anil.sharma@medicare.com',   800, 1),
    ('Dr. Priya Nair',    'Neurologist',        '9820022222', 'priya.nair@medicare.com',    900, 2),
    ('Dr. Rahul Verma',   'Orthopedic Surgeon', '9820033333', 'rahul.verma@medicare.com',   700, 3),
    ('Dr. Sneha Kulkarni','Pediatrician',       '9820044444', 'sneha.kulkarni@medicare.com',500, 4),
    ('Dr. Imran Khan',    'General Physician',  '9820055555', 'imran.khan@medicare.com',    400, 5),
    ('Dr. Meera Iyer',    'Cardiologist',       '9820066666', 'meera.iyer@medicare.com',    850, 1);

INSERT INTO room (room_number, room_type, charge_per_day) VALUES
    ('101', 'General Ward', 800),
    ('102', 'General Ward', 800),
    ('201', 'Private',      2500),
    ('202', 'Private',      2500),
    ('301', 'ICU',          6000),
    ('302', 'ICU',          6000);

-- Two patients are admitted (the trigger marks their rooms as occupied)
INSERT INTO patient (name, age, gender, phone, address, blood_group, room_id) VALUES
    ('Aarav Patel',      45, 'Male',   '9930011111', 'Andheri West, Mumbai',  'B+',  (SELECT room_id FROM room WHERE room_number = '102')),
    ('Kavita Joshi',     52, 'Female', '9930022222', 'Thane, Maharashtra',    'O+',  (SELECT room_id FROM room WHERE room_number = '301')),
    ('Rohan Mehta',      29, 'Male',   '9930033333', 'Borivali East, Mumbai', 'A+',  NULL),
    ('Sunita Deshmukh',  61, 'Female', '9930044444', 'Dadar, Mumbai',         'AB+', NULL),
    ('Vikram Singh',     38, 'Male',   '9930055555', 'Navi Mumbai',           'O-',  NULL),
    ('Ananya Rao',        6, 'Female', '9930066666', 'Powai, Mumbai',         'B-',  NULL);

INSERT INTO appointment (patient_id, doctor_id, appointment_date, appointment_time, reason, status) VALUES
    (1, 1, CURRENT_DATE,     '10:00', 'Chest pain and palpitations', 'Scheduled'),
    (2, 1, CURRENT_DATE,     '10:30', 'Routine heart check-up',      'Scheduled'),
    (3, 2, CURRENT_DATE,     '11:00', 'Recurring migraine',          'Scheduled'),
    (4, 3, CURRENT_DATE + 1, '09:30', 'Knee pain',                   'Scheduled'),
    (5, 5, CURRENT_DATE + 2, '14:00', 'Fever and cold',              'Scheduled'),
    (6, 4, CURRENT_DATE - 3, '12:00', 'Child vaccination',           'Completed'),
    (1, 5, CURRENT_DATE - 5, '16:00', 'General check-up',            'Completed');

-- total_amount is generated automatically
INSERT INTO billing (patient_id, appointment_id, room_id, days_stayed, consultation_fee, room_charges, other_charges, payment_status) VALUES
    (6, 6, NULL, 0, 500, 0,    150, 'Paid'),
    (1, 7, (SELECT room_id FROM room WHERE room_number = '102'), 3, 400, 2400, 350, 'Pending');
