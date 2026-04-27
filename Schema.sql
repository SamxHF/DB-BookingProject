DROP DATABASE IF EXISTS `DB Project`;
CREATE DATABASE `DB Project`;
USE `DB Project`;

CREATE TABLE Students (
    StudentID INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Email VARCHAR(120) NOT NULL UNIQUE,
    Phone VARCHAR(20),
    Major VARCHAR(80) NOT NULL,
    YearLevel INT NOT NULL,
    Status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    CONSTRAINT chk_students_year_level CHECK (YearLevel BETWEEN 1 AND 5)
);

CREATE TABLE StudyRooms (
    RoomID INT AUTO_INCREMENT PRIMARY KEY,
    RoomName VARCHAR(80) NOT NULL,
    Building VARCHAR(80) NOT NULL,
    Floor INT NOT NULL,
    Capacity INT NOT NULL,
    RoomType ENUM('Individual', 'Group') NOT NULL,
    AvailabilityStatus ENUM('Available', 'Unavailable') NOT NULL DEFAULT 'Available',
    CONSTRAINT uq_studyrooms_location UNIQUE (RoomName, Building),
    CONSTRAINT chk_studyrooms_floor CHECK (Floor >= 0),
    CONSTRAINT chk_studyrooms_capacity CHECK (Capacity > 0)
);

CREATE TABLE TimeSlots (
    SlotID INT AUTO_INCREMENT PRIMARY KEY,
    ReservationDate DATE NOT NULL,
    StartTime TIME NOT NULL,
    EndTime TIME NOT NULL,
    CONSTRAINT uq_timeslots_period UNIQUE (ReservationDate, StartTime, EndTime),
    CONSTRAINT chk_timeslots_time_order CHECK (EndTime > StartTime)
);

CREATE TABLE Reservations (
    ReservationID INT AUTO_INCREMENT PRIMARY KEY,
    StudentID INT NOT NULL,
    RoomID INT NOT NULL,
    SlotID INT NOT NULL,
    ReservationDateCreated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Status ENUM('Reserved', 'CheckedIn', 'Cancelled', 'Completed', 'NoShow') NOT NULL DEFAULT 'Reserved',

    ActiveStudentID INT GENERATED ALWAYS AS (
        CASE WHEN Status IN ('Reserved', 'CheckedIn') THEN StudentID ELSE NULL END
    ) STORED,
    ActiveRoomID INT GENERATED ALWAYS AS (
        CASE WHEN Status IN ('Reserved', 'CheckedIn') THEN RoomID ELSE NULL END
    ) STORED,
    ActiveSlotID INT GENERATED ALWAYS AS (
        CASE WHEN Status IN ('Reserved', 'CheckedIn') THEN SlotID ELSE NULL END
    ) STORED,

    CONSTRAINT fk_reservations_student
        FOREIGN KEY (StudentID) REFERENCES Students(StudentID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_reservations_room
        FOREIGN KEY (RoomID) REFERENCES StudyRooms(RoomID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_reservations_slot
        FOREIGN KEY (SlotID) REFERENCES TimeSlots(SlotID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT uq_active_room_slot UNIQUE (ActiveRoomID, ActiveSlotID),
    CONSTRAINT uq_active_student_room_slot UNIQUE (ActiveStudentID, ActiveRoomID, ActiveSlotID)
);

CREATE TABLE Waitlist (
    WaitlistID INT AUTO_INCREMENT PRIMARY KEY,
    StudentID INT NOT NULL,
    RoomID INT NOT NULL,
    SlotID INT NOT NULL,
    WaitlistDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_waitlist_student
        FOREIGN KEY (StudentID) REFERENCES Students(StudentID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_waitlist_room
        FOREIGN KEY (RoomID) REFERENCES StudyRooms(RoomID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_waitlist_slot
        FOREIGN KEY (SlotID) REFERENCES TimeSlots(SlotID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT uq_waitlist_student_room_slot UNIQUE (StudentID, RoomID, SlotID)
);

CREATE INDEX idx_students_name ON Students(Name);
CREATE INDEX idx_students_major ON Students(Major);
CREATE INDEX idx_students_status ON Students(Status);
CREATE INDEX idx_studyrooms_capacity ON StudyRooms(Capacity);
CREATE INDEX idx_studyrooms_type ON StudyRooms(RoomType);
CREATE INDEX idx_timeslots_date_time ON TimeSlots(ReservationDate, StartTime, EndTime);
CREATE INDEX idx_reservations_status ON Reservations(Status);
CREATE INDEX idx_waitlist_room_slot ON Waitlist(RoomID, SlotID, WaitlistID);

DELIMITER $$

CREATE TRIGGER trg_reservations_before_insert
BEFORE INSERT ON Reservations
FOR EACH ROW
BEGIN
    DECLARE student_status VARCHAR(20);
    DECLARE room_status VARCHAR(20);
    DECLARE slot_start DATETIME;

    IF NEW.Status IN ('Reserved', 'CheckedIn') THEN
        SELECT Status
        INTO student_status
        FROM Students
        WHERE StudentID = NEW.StudentID;

        IF student_status <> 'Active' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Error: Student account is inactive and cannot make reservations.';
        END IF;

        SELECT AvailabilityStatus
        INTO room_status
        FROM StudyRooms
        WHERE RoomID = NEW.RoomID;

        IF room_status <> 'Available' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Error: This study room is currently unavailable.';
        END IF;

        SELECT TIMESTAMP(ReservationDate, StartTime)
        INTO slot_start
        FROM TimeSlots
        WHERE SlotID = NEW.SlotID;

        IF slot_start <= NOW() THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Error: Reservations can only be made for future predefined time slots.';
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_reservations_before_update
BEFORE UPDATE ON Reservations
FOR EACH ROW
BEGIN
    DECLARE student_status VARCHAR(20);
    DECLARE room_status VARCHAR(20);
    DECLARE slot_start DATETIME;

    IF NEW.Status IN ('Reserved', 'CheckedIn') THEN
        SELECT Status
        INTO student_status
        FROM Students
        WHERE StudentID = NEW.StudentID;

        IF student_status <> 'Active' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Error: Student account is inactive and cannot make reservations.';
        END IF;

        SELECT AvailabilityStatus
        INTO room_status
        FROM StudyRooms
        WHERE RoomID = NEW.RoomID;

        IF room_status <> 'Available' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Error: This study room is currently unavailable.';
        END IF;

        SELECT TIMESTAMP(ReservationDate, StartTime)
        INTO slot_start
        FROM TimeSlots
        WHERE SlotID = NEW.SlotID;

        IF slot_start <= NOW() THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Error: Reservations can only be made for future predefined time slots.';
        END IF;
    END IF;
END$$

DELIMITER ;
