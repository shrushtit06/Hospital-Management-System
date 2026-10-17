-- =====================================================================
--  Sample queries for demo / viva (run in pgAdmin Query Tool)
-- =====================================================================

-- 1. JOIN: doctors with their department
SELECT d.name AS doctor, d.specialization, dep.dept_name
FROM doctor d
JOIN department dep ON dep.dept_id = d.dept_id
ORDER BY dep.dept_name;

-- 2. VIEW: today's schedule for every doctor
SELECT doctor_name, appointment_time, patient_name, reason, status
FROM doctor_schedule
WHERE appointment_date = CURRENT_DATE
ORDER BY doctor_name, appointment_time;

-- 3. Patients currently admitted, with room details
SELECT p.name, r.room_number, r.room_type, r.charge_per_day
FROM patient p
JOIN room r ON r.room_id = p.room_id;

-- 4. Aggregate + GROUP BY: appointments per doctor
SELECT d.name, COUNT(a.appointment_id) AS total_appointments
FROM doctor d
LEFT JOIN appointment a ON a.doctor_id = d.doctor_id
GROUP BY d.doctor_id, d.name
ORDER BY total_appointments DESC;

-- 5. HAVING: doctors with more than one scheduled appointment
SELECT d.name, COUNT(*) AS scheduled
FROM appointment a
JOIN doctor d ON d.doctor_id = a.doctor_id
WHERE a.status = 'Scheduled'
GROUP BY d.name
HAVING COUNT(*) > 1;

-- 6. Subquery: patients who have an unpaid bill
SELECT name, phone
FROM patient
WHERE patient_id IN (SELECT patient_id FROM billing WHERE payment_status = 'Pending');

-- 7. Revenue by department (multi-table join)
SELECT dep.dept_name, SUM(b.total_amount) AS revenue
FROM billing b
JOIN appointment a ON a.appointment_id = b.appointment_id
JOIN doctor d      ON d.doctor_id      = a.doctor_id
JOIN department dep ON dep.dept_id     = d.dept_id
GROUP BY dep.dept_name
ORDER BY revenue DESC;

-- 8. Free rooms by type
SELECT room_type, COUNT(*) AS free_rooms
FROM room
WHERE is_available
GROUP BY room_type;

-- 9. Trigger demo: admit a patient to an occupied room (this should FAIL)
-- UPDATE patient SET room_id = (SELECT room_id FROM room WHERE room_number = '102') WHERE patient_id = 3;

-- 10. Trigger demo: discharge a patient (room 102 becomes available again)
-- UPDATE patient SET room_id = NULL WHERE patient_id = 1;
-- SELECT room_number, is_available FROM room WHERE room_number = '102';
