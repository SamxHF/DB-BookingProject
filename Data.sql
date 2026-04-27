USE `DB Project`;

INSERT INTO Students (StudentID, Name, Email, Phone, Major, YearLevel, Status) VALUES
(1, 'Aisha Al Mansoori', 'aisha.almansoori@ku.ac.ae', '+971501112233', 'Computer Science', 3, 'Active'),
(2, 'Omar Haddad', 'omar.haddad@ku.ac.ae', '+971502223344', 'Electrical Engineering', 2, 'Active'),
(3, 'Layla Farooq', 'layla.farooq@ku.ac.ae', '+971503334455', 'Cybersecurity', 4, 'Active'),
(4, 'Yousef Khan', 'yousef.khan@ku.ac.ae', '+971504445566', 'Mechanical Engineering', 1, 'Active'),
(5, 'Mariam Saeed', 'mariam.saeed@ku.ac.ae', '+971505556677', 'Data Science', 3, 'Active'),
(6, 'Daniel Martins', 'daniel.martins@ku.ac.ae', '+971506667788', 'Computer Engineering', 2, 'Active'),
(7, 'Noura Salem', 'noura.salem@ku.ac.ae', '+971507778899', 'Artificial Intelligence', 4, 'Active'),
(8, 'Hamad Al Nuaimi', 'hamad.alnuaimi@ku.ac.ae', '+971508889900', 'Computer Science', 5, 'Inactive');

INSERT INTO StudyRooms (RoomID, RoomName, Building, Floor, Capacity, RoomType, AvailabilityStatus) VALUES
(1, 'SR-101', 'Main Library', 1, 2, 'Individual', 'Available'),
(2, 'SR-102', 'Main Library', 1, 4, 'Group', 'Available'),
(3, 'SR-210', 'Engineering Building', 2, 6, 'Group', 'Available'),
(4, 'SR-305', 'Innovation Center', 3, 8, 'Group', 'Available'),
(5, 'Quiet Pod A', 'Main Library', 2, 1, 'Individual', 'Available'),
(6, 'SR-410', 'Science Building', 4, 10, 'Group', 'Available');

INSERT INTO TimeSlots (SlotID, ReservationDate, StartTime, EndTime) VALUES
(1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00:00', '10:00:00'),
(2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', '11:00:00'),
(3, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '11:00:00', '12:00:00'),
(4, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '09:00:00', '10:00:00'),
(5, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00:00', '11:00:00'),
(6, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '14:00:00', '15:00:00'),
(7, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '09:00:00', '10:00:00'),
(8, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '15:00:00', '16:00:00'),
(9, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '13:00:00', '14:00:00'),
(10, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '16:00:00', '17:30:00');

INSERT INTO Reservations (ReservationID, StudentID, RoomID, SlotID, ReservationDateCreated, Status) VALUES
(1, 1, 1, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), 'Reserved'),
(2, 2, 2, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), 'Reserved'),
(3, 1, 3, 2, DATE_SUB(NOW(), INTERVAL 2 DAY), 'Reserved'),
(4, 3, 4, 3, DATE_SUB(NOW(), INTERVAL 2 DAY), 'Reserved'),
(5, 4, 5, 4, DATE_SUB(NOW(), INTERVAL 1 DAY), 'CheckedIn'),
(6, 5, 6, 5, DATE_SUB(NOW(), INTERVAL 1 DAY), 'Reserved'),
(7, 2, 1, 9, DATE_SUB(NOW(), INTERVAL 5 DAY), 'Completed'),
(8, 6, 2, 3, DATE_SUB(NOW(), INTERVAL 4 DAY), 'Cancelled'),
(9, 7, 2, 3, DATE_SUB(NOW(), INTERVAL 1 DAY), 'Reserved'),
(10, 3, 5, 10, DATE_SUB(NOW(), INTERVAL 6 DAY), 'Completed'),
(11, 5, 3, 9, DATE_SUB(NOW(), INTERVAL 2 DAY), 'NoShow'),
(12, 6, 4, 8, DATE_SUB(NOW(), INTERVAL 1 DAY), 'Reserved');
