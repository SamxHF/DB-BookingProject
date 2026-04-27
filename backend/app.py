from functools import wraps

from flask import Flask, jsonify, request
from mysql.connector import Error as MySQLError

from db import db_cursor, fetch_all, fetch_one, serialize_row


ACTIVE_RESERVATION_STATUSES = ("Reserved", "CheckedIn")

app = Flask(__name__)


class ApiError(Exception):
    def __init__(self, message, status_code=400, details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        return ("", 204)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    return response


@app.errorhandler(ApiError)
def handle_api_error(error):
    payload = {"error": error.message}
    payload.update(error.details)
    return jsonify(payload), error.status_code


@app.errorhandler(MySQLError)
def handle_mysql_error(error):
    message = getattr(error, "msg", str(error))
    errno = getattr(error, "errno", None)
    lower_message = message.lower()

    if errno in (2003, 2005, 2013, 2055):
        message = "Error: Could not connect to MySQL. Check that MySQL Server is running and the .env settings are correct."
    elif errno == 1045:
        message = "Error: MySQL login failed. Check MYSQL_USER and MYSQL_PASSWORD in .env."
    elif errno == 1049:
        message = "Error: Database was not found. Run Schema.sql and Data.sql first."
    elif errno == 1146:
        message = "Error: A required database table was not found. Run Schema.sql and Data.sql first."
    elif errno == 1062:
        if "uq_active_room_slot" in lower_message:
            message = "Error: This room is already reserved for the selected time slot."
        elif "uq_active_student_room_slot" in lower_message:
            message = "Error: This student already has the same active reservation."
        elif "email" in lower_message:
            message = "Error: A student with this email already exists."
        elif "uq_studyrooms_location" in lower_message:
            message = "Error: A room with this name already exists in this building."
        elif "uq_timeslots_period" in lower_message:
            message = "Error: This time slot already exists."
        else:
            message = "Error: A duplicate record already exists."
    elif errno == 1451:
        message = "Error: This record is still referenced by other records."
    elif errno == 1452:
        message = "Error: Invalid student, room, or time slot ID."
    elif errno in (1048, 1265, 1292, 1366, 1406, 3819):
        message = "Error: Invalid input. Please check the values and try again."
    elif "inactive" in lower_message or "reserved" in lower_message or "future" in lower_message:
        message = message
    else:
        message = "Error: A database problem occurred. Please check the input and try again."
    return jsonify({"error": message}), 400


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    return jsonify({"error": "Error: An unexpected server problem occurred. Please try again."}), 500


def require_json(*fields):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            data = request.get_json(silent=True) or {}
            missing = [field for field in fields if data.get(field) in (None, "")]
            if missing:
                raise ApiError(f"Missing required field(s): {', '.join(missing)}")
            return func(data, *args, **kwargs)

        return wrapper

    return decorator


def to_positive_int(value, label):
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(f"Error: {label} must be a valid number.")
    if number <= 0:
        raise ApiError(f"Error: {label} must be greater than zero.")
    return number


def add_filter(clauses, params, column, value, exact=False):
    if value in (None, ""):
        return
    if exact:
        clauses.append(f"{column} = %s")
        params.append(value)
    else:
        clauses.append(f"{column} LIKE %s")
        params.append(f"%{value}%")


def build_where(clauses):
    return " WHERE " + " AND ".join(clauses) if clauses else ""


def validate_student_room_slot(cursor, student_id, room_id, slot_id, for_update=False):
    suffix = " FOR UPDATE" if for_update else ""
    student_id = to_positive_int(student_id, "Student ID")
    room_id = to_positive_int(room_id, "Room ID")
    slot_id = to_positive_int(slot_id, "Slot ID")

    cursor.execute(f"SELECT * FROM Students WHERE StudentID = %s{suffix}", (student_id,))
    student = cursor.fetchone()
    if not student:
        raise ApiError("Error: Student ID does not exist.", 404)
    if student["Status"] != "Active":
        raise ApiError("Error: Student account is inactive and cannot make reservations.", 400)

    cursor.execute(
        """
        SELECT COUNT(*) AS NoShowCount
        FROM Reservations
        WHERE StudentID = %s AND Status = 'NoShow'
        """,
        (student_id,),
    )
    if cursor.fetchone()["NoShowCount"] >= 3:
        raise ApiError("Error: This student is currently restricted because of repeated no-shows.")

    cursor.execute(f"SELECT * FROM StudyRooms WHERE RoomID = %s{suffix}", (room_id,))
    room = cursor.fetchone()
    if not room:
        raise ApiError("Error: Room ID does not exist.", 404)
    if room["AvailabilityStatus"] != "Available":
        raise ApiError("Error: This study room is currently unavailable.", 400)

    cursor.execute(
        f"""
        SELECT *, TIMESTAMP(ReservationDate, StartTime) > NOW() AS IsFuture
        FROM TimeSlots
        WHERE SlotID = %s{suffix}
        """,
        (slot_id,),
    )
    slot = cursor.fetchone()
    if not slot:
        raise ApiError("Error: Slot ID does not exist.", 404)
    if not slot["IsFuture"]:
        raise ApiError("Error: Reservations can only be made for future predefined time slots.", 400)

    return student, room, slot


def create_reservation_record(student_id, room_id, slot_id):
    with db_cursor() as (connection, cursor):
        student_id = to_positive_int(student_id, "Student ID")
        room_id = to_positive_int(room_id, "Room ID")
        slot_id = to_positive_int(slot_id, "Slot ID")
        validate_student_room_slot(cursor, student_id, room_id, slot_id, for_update=True)

        cursor.execute(
            """
            SELECT ReservationID
            FROM Reservations
            WHERE StudentID = %s
              AND RoomID = %s
              AND SlotID = %s
              AND Status IN ('Reserved', 'CheckedIn')
            LIMIT 1
            FOR UPDATE
            """,
            (student_id, room_id, slot_id),
        )
        duplicate = cursor.fetchone()
        if duplicate:
            raise ApiError("Error: This student already has the same active reservation.", 409)

        cursor.execute(
            """
            SELECT ReservationID
            FROM Reservations
            WHERE RoomID = %s
              AND SlotID = %s
              AND Status IN ('Reserved', 'CheckedIn')
            LIMIT 1
            FOR UPDATE
            """,
            (room_id, slot_id),
        )
        conflict = cursor.fetchone()
        if conflict:
            raise ApiError(
                "Error: This room is already reserved for the selected time slot.",
                409,
                {"conflicting_reservation_id": conflict["ReservationID"]},
            )

        cursor.execute(
            """
            INSERT INTO Reservations (StudentID, RoomID, SlotID, Status)
            VALUES (%s, %s, %s, 'Reserved')
            """,
            (student_id, room_id, slot_id),
        )
        reservation_id = cursor.lastrowid
        connection.commit()
        return {"id": reservation_id, "message": "Reservation created successfully."}


@app.get("/api/health")
def health_check():
    database_check = fetch_one("SELECT DATABASE() AS DatabaseName")
    return jsonify({"status": "ok", "database": database_check["DatabaseName"]})


@app.get("/api/students")
def list_students():
    clauses, params = [], []
    add_filter(clauses, params, "StudentID", request.args.get("student_id"), exact=True)
    add_filter(clauses, params, "Name", request.args.get("name"))
    add_filter(clauses, params, "Email", request.args.get("email"))
    add_filter(clauses, params, "Major", request.args.get("major"))
    add_filter(clauses, params, "YearLevel", request.args.get("year_level"), exact=True)
    add_filter(clauses, params, "Status", request.args.get("status"), exact=True)
    rows = fetch_all(f"SELECT * FROM Students{build_where(clauses)} ORDER BY StudentID", params)
    return jsonify(rows)


@app.post("/api/students")
@require_json("Name", "Email", "Major", "YearLevel")
def create_student(data):
    with db_cursor(commit=True) as (_, cursor):
        cursor.execute(
            """
            INSERT INTO Students (Name, Email, Phone, Major, YearLevel, Status)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                data["Name"],
                data["Email"],
                data.get("Phone"),
                data["Major"],
                data["YearLevel"],
                data.get("Status", "Active"),
            ),
        )
        return jsonify({"message": "Student added successfully.", "StudentID": cursor.lastrowid}), 201


@app.put("/api/students/<int:student_id>")
def update_student(student_id):
    data = request.get_json(silent=True) or {}
    allowed = ["Name", "Email", "Phone", "Major", "YearLevel", "Status"]
    updates = [field for field in allowed if field in data]
    if not updates:
        raise ApiError("No valid student fields were provided.")
    assignments = ", ".join(f"{field} = %s" for field in updates)
    params = [data[field] for field in updates] + [student_id]
    with db_cursor(commit=True) as (_, cursor):
        cursor.execute(f"UPDATE Students SET {assignments} WHERE StudentID = %s", params)
        if cursor.rowcount == 0:
            raise ApiError("Error: Student ID does not exist.", 404)
    return jsonify({"message": "Student updated successfully."})


@app.delete("/api/students/<int:student_id>")
def deactivate_student(student_id):
    with db_cursor(commit=True) as (_, cursor):
        cursor.execute("UPDATE Students SET Status = 'Inactive' WHERE StudentID = %s", (student_id,))
        if cursor.rowcount == 0:
            raise ApiError("Error: Student ID does not exist.", 404)
    return jsonify({"message": "Student deactivated successfully."})


@app.get("/api/rooms")
def list_rooms():
    clauses, params = [], []
    add_filter(clauses, params, "RoomID", request.args.get("room_id"), exact=True)
    add_filter(clauses, params, "RoomName", request.args.get("room_name"))
    add_filter(clauses, params, "Building", request.args.get("building"))
    add_filter(clauses, params, "Floor", request.args.get("floor"), exact=True)
    add_filter(clauses, params, "Capacity", request.args.get("capacity"), exact=True)
    add_filter(clauses, params, "RoomType", request.args.get("room_type"), exact=True)
    add_filter(clauses, params, "AvailabilityStatus", request.args.get("availability_status"), exact=True)
    rows = fetch_all(f"SELECT * FROM StudyRooms{build_where(clauses)} ORDER BY Building, Floor, RoomName", params)
    return jsonify(rows)


@app.post("/api/rooms")
@require_json("RoomName", "Building", "Floor", "Capacity", "RoomType")
def create_room(data):
    with db_cursor(commit=True) as (_, cursor):
        cursor.execute(
            """
            INSERT INTO StudyRooms (RoomName, Building, Floor, Capacity, RoomType, AvailabilityStatus)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                data["RoomName"],
                data["Building"],
                data["Floor"],
                data["Capacity"],
                data["RoomType"],
                data.get("AvailabilityStatus", "Available"),
            ),
        )
        return jsonify({"message": "Study room added successfully.", "RoomID": cursor.lastrowid}), 201


@app.put("/api/rooms/<int:room_id>")
def update_room(room_id):
    data = request.get_json(silent=True) or {}
    allowed = ["RoomName", "Building", "Floor", "Capacity", "RoomType", "AvailabilityStatus"]
    updates = [field for field in allowed if field in data]
    if not updates:
        raise ApiError("No valid room fields were provided.")
    assignments = ", ".join(f"{field} = %s" for field in updates)
    params = [data[field] for field in updates] + [room_id]
    with db_cursor(commit=True) as (_, cursor):
        cursor.execute(f"UPDATE StudyRooms SET {assignments} WHERE RoomID = %s", params)
        if cursor.rowcount == 0:
            raise ApiError("Error: Room ID does not exist.", 404)
    return jsonify({"message": "Study room updated successfully."})


@app.delete("/api/rooms/<int:room_id>")
def remove_room(room_id):
    hard_delete = request.args.get("hard") == "true"
    with db_cursor(commit=True) as (_, cursor):
        if hard_delete:
            try:
                cursor.execute("DELETE FROM StudyRooms WHERE RoomID = %s", (room_id,))
            except MySQLError:
                cursor.execute(
                    "UPDATE StudyRooms SET AvailabilityStatus = 'Unavailable' WHERE RoomID = %s",
                    (room_id,),
                )
                return jsonify({"message": "Room is referenced by reservations, so it was marked unavailable."})
        else:
            cursor.execute(
                "UPDATE StudyRooms SET AvailabilityStatus = 'Unavailable' WHERE RoomID = %s",
                (room_id,),
            )
        if cursor.rowcount == 0:
            raise ApiError("Error: Room ID does not exist.", 404)
    return jsonify({"message": "Study room removed successfully."})


@app.get("/api/timeslots")
def list_timeslots():
    clauses, params = [], []
    add_filter(clauses, params, "SlotID", request.args.get("slot_id"), exact=True)
    add_filter(clauses, params, "ReservationDate", request.args.get("date"), exact=True)
    add_filter(clauses, params, "StartTime", request.args.get("start_time"), exact=True)
    add_filter(clauses, params, "EndTime", request.args.get("end_time"), exact=True)
    if request.args.get("future_only") == "true":
        clauses.append("TIMESTAMP(ReservationDate, StartTime) > NOW()")
    rows = fetch_all(
        f"SELECT * FROM TimeSlots{build_where(clauses)} ORDER BY ReservationDate, StartTime",
        params,
    )
    return jsonify(rows)


@app.post("/api/timeslots")
@require_json("ReservationDate", "StartTime", "EndTime")
def create_timeslot(data):
    with db_cursor(commit=True) as (_, cursor):
        cursor.execute(
            """
            INSERT INTO TimeSlots (ReservationDate, StartTime, EndTime)
            VALUES (%s, %s, %s)
            """,
            (data["ReservationDate"], data["StartTime"], data["EndTime"]),
        )
        return jsonify({"message": "Time slot added successfully.", "SlotID": cursor.lastrowid}), 201


@app.get("/api/reservations")
def list_reservations():
    clauses, params = [], []
    add_filter(clauses, params, "r.StudentID", request.args.get("student_id"), exact=True)
    add_filter(clauses, params, "r.RoomID", request.args.get("room_id"), exact=True)
    add_filter(clauses, params, "r.SlotID", request.args.get("slot_id"), exact=True)
    add_filter(clauses, params, "r.Status", request.args.get("status"), exact=True)
    add_filter(clauses, params, "ts.ReservationDate", request.args.get("date"), exact=True)
    add_filter(clauses, params, "ts.StartTime", request.args.get("start_time"), exact=True)
    add_filter(clauses, params, "ts.EndTime", request.args.get("end_time"), exact=True)

    query = request.args.get("query")
    if query:
        clauses.append("(s.Name LIKE %s OR sr.RoomName LIKE %s OR sr.Building LIKE %s)")
        params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])

    sql = f"""
        SELECT
            r.ReservationID,
            r.StudentID,
            s.Name AS StudentName,
            r.RoomID,
            sr.RoomName,
            sr.Building,
            r.SlotID,
            ts.ReservationDate,
            ts.StartTime,
            ts.EndTime,
            r.ReservationDateCreated,
            r.Status
        FROM Reservations r
        JOIN Students s ON s.StudentID = r.StudentID
        JOIN StudyRooms sr ON sr.RoomID = r.RoomID
        JOIN TimeSlots ts ON ts.SlotID = r.SlotID
        {build_where(clauses)}
        ORDER BY ts.ReservationDate DESC, ts.StartTime DESC, r.ReservationID DESC
    """
    return jsonify(fetch_all(sql, params))


@app.post("/api/reservations")
@require_json("StudentID", "RoomID", "SlotID")
def create_reservation(data):
    result = create_reservation_record(
        data["StudentID"],
        data["RoomID"],
        data["SlotID"],
    )
    return jsonify(result), 201


@app.patch("/api/reservations/<int:reservation_id>/cancel")
def cancel_reservation(reservation_id):
    with db_cursor() as (connection, cursor):
        cursor.execute(
            """
            SELECT ReservationID, RoomID, SlotID, Status
            FROM Reservations
            WHERE ReservationID = %s
            FOR UPDATE
            """,
            (reservation_id,),
        )
        reservation = cursor.fetchone()
        if not reservation:
            raise ApiError("Error: Reservation ID does not exist.", 404)
        if reservation["Status"] == "Cancelled":
            connection.commit()
            return jsonify({"message": "Reservation was already cancelled."})
        if reservation["Status"] not in ACTIVE_RESERVATION_STATUSES:
            raise ApiError("Error: Only reserved or checked-in reservations can be cancelled.")

        cursor.execute(
            "UPDATE Reservations SET Status = 'Cancelled' WHERE ReservationID = %s",
            (reservation_id,),
        )
        connection.commit()
        return jsonify({"message": "Reservation cancelled successfully."})


@app.patch("/api/reservations/<int:reservation_id>/complete")
def complete_reservation(reservation_id):
    with db_cursor() as (connection, cursor):
        cursor.execute(
            """
            SELECT ReservationID, RoomID, SlotID, Status
            FROM Reservations
            WHERE ReservationID = %s
            FOR UPDATE
            """,
            (reservation_id,),
        )
        reservation = cursor.fetchone()
        if not reservation:
            raise ApiError("Error: Reservation ID does not exist.", 404)
        if reservation["Status"] == "Completed":
            connection.commit()
            return jsonify({"message": "Reservation was already completed."})
        if reservation["Status"] not in ACTIVE_RESERVATION_STATUSES:
            raise ApiError("Error: Only reserved or checked-in reservations can be marked completed.")

        cursor.execute(
            """
            UPDATE Reservations
            SET Status = 'Completed'
            WHERE ReservationID = %s
            """,
            (reservation_id,),
        )
        connection.commit()
    return jsonify({"message": "Reservation marked as completed."})


@app.patch("/api/reservations/<int:reservation_id>/check-in")
def check_in_reservation(reservation_id):
    with db_cursor() as (connection, cursor):
        cursor.execute(
            """
            SELECT
                r.ReservationID,
                r.Status,
                TIMESTAMP(ts.ReservationDate, ts.StartTime) AS SlotStart,
                TIMESTAMP(ts.ReservationDate, ts.EndTime) AS SlotEnd
            FROM Reservations r
            JOIN TimeSlots ts ON ts.SlotID = r.SlotID
            WHERE r.ReservationID = %s
            FOR UPDATE
            """,
            (reservation_id,),
        )
        reservation = cursor.fetchone()
        if not reservation:
            raise ApiError("Error: Reservation ID does not exist.", 404)
        if reservation["Status"] == "CheckedIn":
            connection.commit()
            return jsonify({"message": "Reservation is already checked in."})
        if reservation["Status"] == "Cancelled":
            raise ApiError("Error: Cannot check in for a cancelled reservation.")
        if reservation["Status"] == "Completed":
            raise ApiError("Error: Cannot check in for a completed reservation.")
        if reservation["Status"] == "NoShow":
            raise ApiError("Error: Cannot check in for a no-show reservation.")
        if reservation["Status"] != "Reserved":
            raise ApiError("Error: Only reserved reservations can be checked in.")

        cursor.execute(
            """
            SELECT
                NOW() < %s AS IsTooEarly,
                NOW() > %s AS IsExpired
            """,
            (reservation["SlotStart"], reservation["SlotEnd"]),
        )
        timing = cursor.fetchone()
        if timing["IsTooEarly"]:
            raise ApiError("Error: Cannot check in before the reservation start time.")
        if timing["IsExpired"]:
            raise ApiError("Error: Cannot check in for an expired reservation.")

        cursor.execute(
            "UPDATE Reservations SET Status = 'CheckedIn' WHERE ReservationID = %s",
            (reservation_id,),
        )
        connection.commit()
        return jsonify({"message": "Reservation checked in successfully."})


@app.get("/api/students/<int:student_id>/schedule")
def student_schedule(student_id):
    reservations = fetch_all(
        """
        SELECT
            r.ReservationID,
            'Reservation' AS EntryType,
            r.Status,
            sr.RoomName,
            sr.Building,
            ts.ReservationDate,
            ts.StartTime,
            ts.EndTime,
            r.ReservationDateCreated AS CreatedAt
        FROM Reservations r
        JOIN StudyRooms sr ON sr.RoomID = r.RoomID
        JOIN TimeSlots ts ON ts.SlotID = r.SlotID
        WHERE r.StudentID = %s
        ORDER BY ts.ReservationDate, ts.StartTime
        """,
        (student_id,),
    )
    return jsonify(reservations)


@app.get("/api/rooms/<int:room_id>/reservations")
def room_reservations(room_id):
    return jsonify(fetch_all(
        """
        SELECT
            r.ReservationID,
            r.StudentID,
            s.Name AS StudentName,
            r.Status,
            ts.SlotID,
            ts.ReservationDate,
            ts.StartTime,
            ts.EndTime
        FROM Reservations r
        JOIN Students s ON s.StudentID = r.StudentID
        JOIN TimeSlots ts ON ts.SlotID = r.SlotID
        WHERE r.RoomID = %s
        ORDER BY ts.ReservationDate DESC, ts.StartTime DESC
        """,
        (room_id,),
    ))


@app.get("/api/reports/available-rooms")
def available_rooms_report():
    slot_id = request.args.get("slot_id")
    if not slot_id:
        raise ApiError("slot_id is required.")
    params = [slot_id]
    clauses = ["sr.AvailabilityStatus = 'Available'"]
    if request.args.get("date"):
        clauses.append("ts.ReservationDate = %s")
        params.append(request.args.get("date"))

    sql = f"""
        SELECT sr.*, ts.ReservationDate, ts.StartTime, ts.EndTime
        FROM StudyRooms sr
        JOIN TimeSlots ts ON ts.SlotID = %s
        WHERE {" AND ".join(clauses)}
          AND NOT EXISTS (
              SELECT 1
              FROM Reservations r
              WHERE r.RoomID = sr.RoomID
                AND r.SlotID = ts.SlotID
                AND r.Status IN ('Reserved', 'CheckedIn')
          )
        ORDER BY sr.Capacity, sr.Building, sr.RoomName
    """
    return jsonify(fetch_all(sql, params))


@app.get("/api/reports/students-for-room-slot")
def students_for_room_slot_report():
    room_id = request.args.get("room_id")
    slot_id = request.args.get("slot_id")
    if not room_id or not slot_id:
        raise ApiError("room_id and slot_id are required.")
    return jsonify(fetch_all(
        """
        SELECT
            s.StudentID,
            s.Name,
            s.Email,
            r.Status,
            r.ReservationID,
            ts.ReservationDate,
            ts.StartTime,
            ts.EndTime
        FROM Reservations r
        JOIN Students s ON s.StudentID = r.StudentID
        JOIN TimeSlots ts ON ts.SlotID = r.SlotID
        WHERE r.RoomID = %s AND r.SlotID = %s
        ORDER BY r.ReservationID
        """,
        (room_id, slot_id),
    ))


@app.get("/api/recommendations/rooms")
def recommend_rooms():
    slot_id = request.args.get("slot_id")
    if not slot_id:
        raise ApiError("slot_id is required.")
    required_capacity = request.args.get("capacity") or 1
    room_type = request.args.get("room_type")
    sort = request.args.get("sort", "capacity")

    params = [slot_id, required_capacity]
    clauses = ["sr.AvailabilityStatus = 'Available'", "sr.Capacity >= %s"]
    if request.args.get("date"):
        clauses.append("ts.ReservationDate = %s")
        params.append(request.args.get("date"))
    if room_type:
        clauses.append("sr.RoomType = %s")
        params.append(room_type)

    order_by = {
        "capacity": "sr.Capacity, sr.Building, sr.RoomName",
        "building": "sr.Building, sr.Capacity, sr.RoomName",
        "type": "sr.RoomType, sr.Capacity, sr.RoomName",
    }.get(sort, "sr.Capacity, sr.Building, sr.RoomName")

    sql = f"""
        SELECT
            sr.RoomID,
            sr.RoomName,
            sr.Building,
            sr.Floor,
            sr.Capacity,
            sr.RoomType,
            ts.ReservationDate,
            ts.StartTime,
            ts.EndTime
        FROM StudyRooms sr
        JOIN TimeSlots ts ON ts.SlotID = %s
        WHERE {" AND ".join(clauses)}
          AND NOT EXISTS (
              SELECT 1
              FROM Reservations r
              WHERE r.RoomID = sr.RoomID
                AND r.SlotID = ts.SlotID
                AND r.Status IN ('Reserved', 'CheckedIn')
          )
        ORDER BY {order_by}
    """
    return jsonify(fetch_all(sql, params))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True, use_reloader=False)
