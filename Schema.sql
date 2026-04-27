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
        ON DELETE RESTRICT
);
