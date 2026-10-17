# Hospital-Management-System
A full-stack Hospital Management System built with Flask, PostgreSQL, HTML, CSS, and JavaScript to manage patients, doctors, appointments, rooms, billing, and hospital analytics.
# MediCare — Hospital Management System

A full-stack Hospital Management System developed as a **Database Management Systems (DBMS) mini project**. MediCare provides a simple web-based interface for managing hospital operations, including patient records, doctors, appointments, room availability, billing, and dashboard analytics.

The project demonstrates how a frontend, Python backend, and relational database work together to manage hospital information efficiently.

## Features

- **Dashboard:** View patient and doctor counts, today's appointments, available rooms, total revenue, and pending payments.
- **Patient Management:** Register and search patients, view their records, manage admissions, and discharge patients.
- **Doctor Management:** Add and manage doctors with their specializations and department details.
- **Department Management:** Organize doctors according to hospital departments.
- **Appointment Management:** Book, complete, and cancel appointments while preventing double-booking of doctors.
- **Doctor Schedule:** View appointment schedules for individual doctors and dates.
- **Room Management:** Track room availability and manage patient room allocation.
- **Billing System:** Generate bills, calculate total charges, track payment status, and print invoices.
- **Database Integrity:** Use constraints, relationships, indexes, views, and triggers to maintain consistent data.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Python, Flask REST API |
| Database | PostgreSQL |
| Database Management | pgAdmin |
| Database Connectivity | psycopg2 |
| Version Control | Git and GitHub |

## Project Architecture

The application follows a simple three-layer architecture:

1. **Frontend:** HTML, CSS, and JavaScript provide the user interface.
2. **Backend:** Python Flask processes requests and communicates with the database through API endpoints.
3. **Database:** PostgreSQL stores and manages hospital records using relational tables, constraints, views, and triggers.

**Flow:** Frontend → Flask REST API → PostgreSQL Database

## Database Design

The project uses six main tables:

| Table | Purpose |
|---|---|
| `department` | Stores hospital department details |
| `doctor` | Stores doctor information and department assignments |
| `patient` | Stores patient information and admission details |
| `appointment` | Stores patient appointments and their status |
| `room` | Stores room types, charges, and availability |
| `billing` | Stores billing details and payment status |

Additional database objects include:

- **Primary and foreign keys** to maintain relationships between tables.
- **CHECK, UNIQUE, NOT NULL, and DEFAULT constraints** to validate data.
- **Indexes** to support efficient queries and prevent doctors from being double-booked.
- **View:** `doctor_schedule` combines appointment, doctor, and patient information.
- **Trigger and PL/pgSQL function:** Automatically update room availability when patients are admitted, discharged, or moved.
- **Generated column:** Calculates the total bill amount from the individual charges.

The database design demonstrates relational database concepts and normalization up to Third Normal Form (3NF).

## Project Structure

```text
hospital-management/
├── app.py
├── schema.sql
├── queries.sql
├── requirements.txt
├── README.md
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

- `app.py` — Flask backend and REST API endpoints.
- `schema.sql` — Database tables, relationships, constraints, view, trigger, and sample data.
- `queries.sql` — Example SQL queries for demonstrations and viva preparation.
- `requirements.txt` — Python dependencies.
- `static/index.html` — Application interface.
- `static/style.css` — Frontend styling.
- `static/app.js` — Frontend interactions and API communication.

## Installation and Setup

### Prerequisites

Install the following before running the application:

- Python 3.10 or newer
- PostgreSQL 12 or newer
- pgAdmin
- A modern web browser

### Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
cd YOUR-REPOSITORY
```

Replace the repository URL with your actual GitHub repository URL.

### Step 2: Create the Database

1. Open pgAdmin and connect to your PostgreSQL server.
2. Right-click **Databases → Create → Database**.
3. Name the database `hospital_db`.
4. Open the Query Tool for `hospital_db`.
5. Open `schema.sql` and execute the script.

The script creates the required tables, view, trigger, and sample records.

### Step 3: Configure Database Credentials

The Flask application reads its database configuration from environment variables, with defaults defined in `app.py`.

For Windows Command Prompt, set your actual PostgreSQL credentials:

```bat
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=hospital_db
set DB_USER=postgres
set DB_PASSWORD=YOUR_POSTGRES_PASSWORD
```

Use your own PostgreSQL password. Do not commit real passwords or other credentials to GitHub.

### Step 4: Create a Virtual Environment

```bash
python -m venv venv
```

Activate it on Windows:

```bat
venv\Scripts\activate
```

### Step 5: Install Dependencies

```bash
python -m pip install -r requirements.txt
```

### Step 6: Run the Application

```bash
python app.py
```

Open the following address in your browser:

**http://127.0.0.1:5000**

Ensure that PostgreSQL is running and the database has been initialized before launching the application.

## Sample SQL Queries

The `queries.sql` file contains examples of important DBMS concepts, including:

- JOIN operations
- Aggregate functions and GROUP BY
- HAVING clauses
- Subqueries
- Views
- Room availability queries
- Trigger demonstrations

These queries can be executed in pgAdmin's Query Tool.

## Learning Outcomes

Through this project, we explored:

- Designing a relational database for a real-world application.
- Establishing relationships using primary and foreign keys.
- Implementing CRUD operations through a Flask backend.
- Connecting a web frontend to a PostgreSQL database.
- Using SQL joins, aggregate functions, subqueries, and views.
- Maintaining data consistency using constraints and triggers.
- Building a dashboard to present useful operational information.

## Future Enhancements

- User authentication and role-based access for administrators, doctors, and receptionists.
- Search filters and advanced reporting.
- Appointment reminders and notifications.
- Improved security and audit logging.
- Deployment to a cloud hosting platform.

## Disclaimer

This project is intended for educational and demonstration purposes. The included sample records are illustrative and should not be used as real patient data.

## Author

**Shrushti Trivedi**

---

*Developed as a DBMS mini project to demonstrate full-stack development and relational database management in the healthcare domain.*
