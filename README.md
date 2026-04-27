# Campus Study Room Reservation System

Full-stack database project for COSC444. The backend is a Flask REST API connected to MySQL, and the frontend is a React/Vite dashboard.

## Features

- Student management: add, update, search, and deactivate students.
- Study room management: add, update, search, and mark rooms unavailable.
- Time slot management: add, list, and search predefined slots.
- Reservation management: reserve rooms, cancel reservations, mark reservations completed, and view reservation history.
- Check-in handling: check in valid reservations during their time slot and reject early, cancelled, completed, no-show, or expired reservations with clear messages.
- Reporting: available rooms for a slot, reservations by student/room/date/status, and students who reserved a specific room-slot.
- Advanced feature 1: room availability recommendation by date, slot, capacity, room type, and sort order.
- Advanced feature 2: waitlist with automatic promotion when a reservation is cancelled, and waitlist cleanup when a reservation is completed.

## Project Structure

```text
.
├── Schema.sql
├── Data.sql
├── requirements.txt
├── backend/
│   ├── app.py
│   ├── db.py
│   └── requirements.txt
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── main.jsx
│       └── styles.css
├── .env
└── .env.example
```

## Database Setup

1. Open MySQL Workbench.
2. Connect to your local MySQL server.
3. Run `Schema.sql`.
4. Run `Data.sql`.

The schema name is:

```sql
`DB Project`
```

The backticks are needed because the schema name contains a space.

## Environment Setup

Copy `.env.example` to `.env` if needed, then update your MySQL password:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE="DB Project"
MYSQL_USER=root
MYSQL_PASSWORD="your_mysql_password_here"
```

`.env` is ignored by git so your password is not committed.

## Backend Setup

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python backend/app.py
```

The Flask API runs at:

```text
http://127.0.0.1:5001
```

Quick health check:

```bash
curl http://127.0.0.1:5001/api/health
```

## Frontend Setup

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The React app runs at:

```text
http://127.0.0.1:5173
```

The Vite dev server proxies `/api` requests to Flask on port `5001`.

## Demo Flow

1. Add a new student from the Students tab.
2. Create a reservation using an active student, available room, and future time slot.
3. Try reserving the same room and slot again to show double-booking prevention.
4. Use "Join waitlist if booked" to add a student to the waitlist.
5. Cancel the original reservation to show automatic waitlist promotion.
6. Complete a reservation to show that stale waitlist entries for that room-slot are cleared.
7. Use Reports to show student schedules, available rooms, and room-slot reservations.
8. Use Advanced to show room recommendations and the waitlist queue.

## Error Handling Covered

The backend converts common MySQL and input failures into user-friendly API messages, including:

- MySQL connection failure, missing database, missing tables, and login failure.
- Foreign key violations from invalid student, room, or time slot IDs.
- Duplicate reservations, duplicate waitlist entries, duplicate student emails, and duplicate room/slot records.
- Attempts to reserve with inactive students, unavailable rooms, already-booked rooms, duplicate reservations, invalid IDs, or past/expired slots.
- Attempts to check in early, cancelled, completed, no-show, or expired reservations.
- Students with 3 or more `NoShow` reservations are blocked from new reservations with a repeated no-show restriction message.
