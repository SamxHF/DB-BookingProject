import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  ListChecks,
  RefreshCw,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { del, get, patch, post, put } from './api.js';

const tabs = [
  { id: 'students', label: 'Students', icon: Users },
  { id: 'rooms', label: 'Rooms', icon: DoorOpen },
  { id: 'slots', label: 'Time Slots', icon: CalendarClock },
  { id: 'reservations', label: 'Reservations', icon: ClipboardList },
  { id: 'reports', label: 'Reports', icon: BookOpen },
  { id: 'advanced', label: 'Advanced', icon: ListChecks },
];

const studentColumns = ['StudentID', 'Name', 'Email', 'Phone', 'Major', 'YearLevel', 'Status'];
const roomColumns = ['RoomID', 'RoomName', 'Building', 'Floor', 'Capacity', 'RoomType', 'AvailabilityStatus'];
const slotColumns = ['SlotID', 'ReservationDate', 'StartTime', 'EndTime'];
const reservationColumns = [
  'ReservationID',
  'StudentName',
  'RoomName',
  'Building',
  'SlotID',
  'ReservationDate',
  'StartTime',
  'EndTime',
  'Status',
];
const waitlistColumns = [
  'WaitlistID',
  'StudentName',
  'RoomName',
  'SlotID',
  'ReservationDate',
  'StartTime',
  'EndTime',
  'WaitlistDate',
];

const emptyStudent = {
  Name: '',
  Email: '',
  Phone: '',
  Major: '',
  YearLevel: '',
  Status: 'Active',
};

const emptyRoom = {
  RoomName: '',
  Building: '',
  Floor: '',
  Capacity: '',
  RoomType: 'Group',
  AvailabilityStatus: 'Available',
};

const emptySlot = {
  ReservationDate: '',
  StartTime: '',
  EndTime: '',
};

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const result = search.toString();
  return result ? `?${result}` : '';
}

function compactPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

function setField(setter, key, value) {
  setter((current) => ({ ...current, [key]: value }));
}

function StatusBadge({ value }) {
  const className = `status status-${String(value).toLowerCase()}`;
  return <span className={className}>{value}</span>;
}

function Panel({ title, icon: Icon, children, actions }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          {Icon && <Icon size={18} />}
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, type = 'text', placeholder = '' }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />;
}

function SelectInput({ value, onChange, children }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>;
}

function DataTable({ columns, rows, emptyText = 'No records found.' }) {
  if (!rows?.length) {
    return <div className="empty">{emptyText}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.ReservationID || row.StudentID || row.RoomID || row.SlotID || row.WaitlistID || index}>
              {columns.map((column) => (
                <td key={column}>{column === 'Status' ? <StatusBadge value={row[column]} /> : row[column] ?? '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  return (
    <button className={`notice ${notice.type}`} onClick={onDismiss} type="button">
      {notice.message}
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('students');
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [slots, setSlots] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [waitlist, setWaitlist] = useState([]);

  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [studentEdit, setStudentEdit] = useState({ StudentID: '', Email: '', Phone: '', Major: '', YearLevel: '', Status: '' });
  const [studentSearch, setStudentSearch] = useState({ student_id: '', name: '', email: '', major: '', year_level: '', status: '' });

  const [roomForm, setRoomForm] = useState(emptyRoom);
  const [roomEdit, setRoomEdit] = useState({
    RoomID: '',
    Building: '',
    Floor: '',
    Capacity: '',
    RoomType: '',
    AvailabilityStatus: '',
  });
  const [roomSearch, setRoomSearch] = useState({
    room_id: '',
    room_name: '',
    building: '',
    floor: '',
    capacity: '',
    room_type: '',
  });

  const [slotForm, setSlotForm] = useState(emptySlot);
  const [slotSearch, setSlotSearch] = useState({ date: '', start_time: '', end_time: '', future_only: 'false' });

  const [reservationForm, setReservationForm] = useState({ StudentID: '', RoomID: '', SlotID: '', join_waitlist: false });
  const [reservationSearch, setReservationSearch] = useState({
    student_id: '',
    room_id: '',
    date: '',
    slot_id: '',
    status: '',
  });
  const [reservationActionId, setReservationActionId] = useState('');

  const [studentScheduleId, setStudentScheduleId] = useState('');
  const [scheduleRows, setScheduleRows] = useState([]);
  const [availableQuery, setAvailableQuery] = useState({ date: '', slot_id: '' });
  const [availableRooms, setAvailableRooms] = useState([]);
  const [roomSlotQuery, setRoomSlotQuery] = useState({ room_id: '', slot_id: '' });
  const [roomSlotStudents, setRoomSlotStudents] = useState([]);

  const [recommendQuery, setRecommendQuery] = useState({
    date: '',
    slot_id: '',
    capacity: '',
    room_type: '',
    sort: 'capacity',
  });
  const [recommendations, setRecommendations] = useState([]);
  const [waitlistForm, setWaitlistForm] = useState({ StudentID: '', RoomID: '', SlotID: '' });

  const metrics = useMemo(
    () => [
      { label: 'Students', value: students.length },
      { label: 'Rooms', value: rooms.length },
      { label: 'Slots', value: slots.length },
      { label: 'Reservations', value: reservations.length },
      { label: 'Waitlist', value: waitlist.length },
    ],
    [students, rooms, slots, reservations, waitlist],
  );

  function showSuccess(message) {
    setNotice({ type: 'success', message });
  }

  function showError(error) {
    setNotice({ type: 'error', message: error.message || 'Something went wrong.' });
  }

  async function run(action, successMessage) {
    setLoading(true);
    try {
      const result = await action();
      if (successMessage) showSuccess(successMessage);
      return result;
    } catch (error) {
      showError(error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    await run(async () => {
      const [studentRows, roomRows, slotRows, reservationRows, waitlistRows] = await Promise.all([
        get('/students'),
        get('/rooms'),
        get('/timeslots'),
        get('/reservations'),
        get('/waitlist'),
      ]);
      setStudents(studentRows);
      setRooms(roomRows);
      setSlots(slotRows);
      setReservations(reservationRows);
      setWaitlist(waitlistRows);
    });
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addStudent(event) {
    event.preventDefault();
    const result = await run(() => post('/students', compactPayload(studentForm)));
    if (result) {
      setStudentForm(emptyStudent);
      showSuccess(result.message);
      loadAll();
    }
  }

  async function updateStudent(event) {
    event.preventDefault();
    const { StudentID, ...payload } = studentEdit;
    const result = await run(() => put(`/students/${StudentID}`, compactPayload(payload)));
    if (result) {
      showSuccess(result.message);
      loadAll();
    }
  }

  async function deactivateStudent() {
    if (!studentEdit.StudentID) return showError(new Error('Enter a Student ID first.'));
    const result = await run(() => del(`/students/${studentEdit.StudentID}`));
    if (result) {
      showSuccess(result.message);
      loadAll();
    }
  }

  async function searchStudents(event) {
    event.preventDefault();
    const rows = await run(() => get(`/students${queryString(studentSearch)}`));
    if (rows) setStudents(rows);
  }

  async function addRoom(event) {
    event.preventDefault();
    const result = await run(() => post('/rooms', compactPayload(roomForm)));
    if (result) {
      setRoomForm(emptyRoom);
      showSuccess(result.message);
      loadAll();
    }
  }

  async function updateRoom(event) {
    event.preventDefault();
    const { RoomID, ...payload } = roomEdit;
    const result = await run(() => put(`/rooms/${RoomID}`, compactPayload(payload)));
    if (result) {
      showSuccess(result.message);
      loadAll();
    }
  }

  async function removeRoom() {
    if (!roomEdit.RoomID) return showError(new Error('Enter a Room ID first.'));
    const result = await run(() => del(`/rooms/${roomEdit.RoomID}`));
    if (result) {
      showSuccess(result.message);
      loadAll();
    }
  }

  async function searchRooms(event) {
    event.preventDefault();
    const rows = await run(() => get(`/rooms${queryString(roomSearch)}`));
    if (rows) setRooms(rows);
  }

  async function addSlot(event) {
    event.preventDefault();
    const result = await run(() => post('/timeslots', compactPayload(slotForm)));
    if (result) {
      setSlotForm(emptySlot);
      showSuccess(result.message);
      loadAll();
    }
  }

  async function searchSlots(event) {
    event.preventDefault();
    const rows = await run(() => get(`/timeslots${queryString(slotSearch)}`));
    if (rows) setSlots(rows);
  }

  async function reserveRoom(event) {
    event.preventDefault();
    const result = await run(() => post('/reservations', compactPayload(reservationForm)));
    if (result) {
      showSuccess(result.message);
      setReservationForm({ StudentID: '', RoomID: '', SlotID: '', join_waitlist: false });
      loadAll();
    }
  }

  async function cancelReservation() {
    if (!reservationActionId) return showError(new Error('Enter a Reservation ID first.'));
    const result = await run(() => patch(`/reservations/${reservationActionId}/cancel`));
    if (result) {
      const promotion = result.promoted ? ` Promoted ${result.promoted.StudentName}.` : '';
      showSuccess(`${result.message}${promotion}`);
      loadAll();
    }
  }

  async function checkInReservation() {
    if (!reservationActionId) return showError(new Error('Enter a Reservation ID first.'));
    const result = await run(() => patch(`/reservations/${reservationActionId}/check-in`));
    if (result) {
      showSuccess(result.message);
      loadAll();
    }
  }

  async function completeReservation() {
    if (!reservationActionId) return showError(new Error('Enter a Reservation ID first.'));
    const result = await run(() => patch(`/reservations/${reservationActionId}/complete`));
    if (result) {
      const cleared = result.cleared_waitlist_count ? ` Cleared ${result.cleared_waitlist_count} waitlist entry/entries.` : '';
      showSuccess(`${result.message}${cleared}`);
      loadAll();
    }
  }

  async function searchReservations(event) {
    event.preventDefault();
    const rows = await run(() => get(`/reservations${queryString(reservationSearch)}`));
    if (rows) setReservations(rows);
  }

  async function loadSchedule(event) {
    event.preventDefault();
    const rows = await run(() => get(`/students/${studentScheduleId}/schedule`));
    if (rows) setScheduleRows(rows);
  }

  async function loadAvailableRooms(event) {
    event.preventDefault();
    const rows = await run(() => get(`/reports/available-rooms${queryString(availableQuery)}`));
    if (rows) setAvailableRooms(rows);
  }

  async function loadRoomSlotStudents(event) {
    event.preventDefault();
    const rows = await run(() => get(`/reports/students-for-room-slot${queryString(roomSlotQuery)}`));
    if (rows) setRoomSlotStudents(rows);
  }

  async function loadRecommendations(event) {
    event.preventDefault();
    const rows = await run(() => get(`/recommendations/rooms${queryString(recommendQuery)}`));
    if (rows) setRecommendations(rows);
  }

  async function joinWaitlist(event) {
    event.preventDefault();
    const result = await run(() => post('/waitlist', compactPayload(waitlistForm)));
    if (result) {
      showSuccess(result.message);
      setWaitlistForm({ StudentID: '', RoomID: '', SlotID: '' });
      loadAll();
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">COSC444 Database Systems</p>
          <h1>Campus Study Room Reservation System</h1>
        </div>
        <button className="icon-button" type="button" onClick={loadAll} disabled={loading} title="Refresh data">
          <RefreshCw size={18} />
        </button>
      </header>

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <div className="metrics">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <nav className="tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={activeTab === id ? 'tab active' : 'tab'}
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'students' && (
          <div className="grid two">
            <Panel title="Add Student" icon={UserPlus}>
              <form className="form-grid" onSubmit={addStudent}>
                <Field label="Name">
                  <TextInput value={studentForm.Name} onChange={(value) => setField(setStudentForm, 'Name', value)} />
                </Field>
                <Field label="Email">
                  <TextInput value={studentForm.Email} onChange={(value) => setField(setStudentForm, 'Email', value)} />
                </Field>
                <Field label="Phone">
                  <TextInput value={studentForm.Phone} onChange={(value) => setField(setStudentForm, 'Phone', value)} />
                </Field>
                <Field label="Major">
                  <TextInput value={studentForm.Major} onChange={(value) => setField(setStudentForm, 'Major', value)} />
                </Field>
                <Field label="Year">
                  <TextInput
                    type="number"
                    value={studentForm.YearLevel}
                    onChange={(value) => setField(setStudentForm, 'YearLevel', value)}
                  />
                </Field>
                <Field label="Status">
                  <SelectInput value={studentForm.Status} onChange={(value) => setField(setStudentForm, 'Status', value)}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </SelectInput>
                </Field>
                <button className="primary span-two" type="submit">Add Student</button>
              </form>
            </Panel>

            <Panel title="Update Or Deactivate" icon={Users}>
              <form className="form-grid" onSubmit={updateStudent}>
                <Field label="Student ID">
                  <TextInput
                    type="number"
                    value={studentEdit.StudentID}
                    onChange={(value) => setField(setStudentEdit, 'StudentID', value)}
                  />
                </Field>
                <Field label="Email">
                  <TextInput value={studentEdit.Email} onChange={(value) => setField(setStudentEdit, 'Email', value)} />
                </Field>
                <Field label="Phone">
                  <TextInput value={studentEdit.Phone} onChange={(value) => setField(setStudentEdit, 'Phone', value)} />
                </Field>
                <Field label="Major">
                  <TextInput value={studentEdit.Major} onChange={(value) => setField(setStudentEdit, 'Major', value)} />
                </Field>
                <Field label="Year">
                  <TextInput
                    type="number"
                    value={studentEdit.YearLevel}
                    onChange={(value) => setField(setStudentEdit, 'YearLevel', value)}
                  />
                </Field>
                <Field label="Status">
                  <SelectInput value={studentEdit.Status} onChange={(value) => setField(setStudentEdit, 'Status', value)}>
                    <option value="">No change</option>
                    <option>Active</option>
                    <option>Inactive</option>
                  </SelectInput>
                </Field>
                <button className="primary" type="submit">Update</button>
                <button className="danger" type="button" onClick={deactivateStudent}>Deactivate</button>
              </form>
            </Panel>

            <Panel title="Search Students" icon={Search}>
              <form className="form-grid six" onSubmit={searchStudents}>
                <Field label="ID">
                  <TextInput value={studentSearch.student_id} onChange={(value) => setField(setStudentSearch, 'student_id', value)} />
                </Field>
                <Field label="Name">
                  <TextInput value={studentSearch.name} onChange={(value) => setField(setStudentSearch, 'name', value)} />
                </Field>
                <Field label="Email">
                  <TextInput value={studentSearch.email} onChange={(value) => setField(setStudentSearch, 'email', value)} />
                </Field>
                <Field label="Major">
                  <TextInput value={studentSearch.major} onChange={(value) => setField(setStudentSearch, 'major', value)} />
                </Field>
                <Field label="Year">
                  <TextInput value={studentSearch.year_level} onChange={(value) => setField(setStudentSearch, 'year_level', value)} />
                </Field>
                <Field label="Status">
                  <SelectInput value={studentSearch.status} onChange={(value) => setField(setStudentSearch, 'status', value)}>
                    <option value="">Any</option>
                    <option>Active</option>
                    <option>Inactive</option>
                  </SelectInput>
                </Field>
                <button className="primary span-two" type="submit">Search</button>
              </form>
              <DataTable columns={studentColumns} rows={students} />
            </Panel>
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="grid two">
            <Panel title="Add Study Room" icon={DoorOpen}>
              <form className="form-grid" onSubmit={addRoom}>
                <Field label="Room Name">
                  <TextInput value={roomForm.RoomName} onChange={(value) => setField(setRoomForm, 'RoomName', value)} />
                </Field>
                <Field label="Building">
                  <TextInput value={roomForm.Building} onChange={(value) => setField(setRoomForm, 'Building', value)} />
                </Field>
                <Field label="Floor">
                  <TextInput type="number" value={roomForm.Floor} onChange={(value) => setField(setRoomForm, 'Floor', value)} />
                </Field>
                <Field label="Capacity">
                  <TextInput type="number" value={roomForm.Capacity} onChange={(value) => setField(setRoomForm, 'Capacity', value)} />
                </Field>
                <Field label="Type">
                  <SelectInput value={roomForm.RoomType} onChange={(value) => setField(setRoomForm, 'RoomType', value)}>
                    <option>Group</option>
                    <option>Individual</option>
                  </SelectInput>
                </Field>
                <Field label="Availability">
                  <SelectInput
                    value={roomForm.AvailabilityStatus}
                    onChange={(value) => setField(setRoomForm, 'AvailabilityStatus', value)}
                  >
                    <option>Available</option>
                    <option>Unavailable</option>
                  </SelectInput>
                </Field>
                <button className="primary span-two" type="submit">Add Room</button>
              </form>
            </Panel>

            <Panel title="Update Or Remove" icon={DoorOpen}>
              <form className="form-grid" onSubmit={updateRoom}>
                <Field label="Room ID">
                  <TextInput type="number" value={roomEdit.RoomID} onChange={(value) => setField(setRoomEdit, 'RoomID', value)} />
                </Field>
                <Field label="Building">
                  <TextInput value={roomEdit.Building} onChange={(value) => setField(setRoomEdit, 'Building', value)} />
                </Field>
                <Field label="Floor">
                  <TextInput type="number" value={roomEdit.Floor} onChange={(value) => setField(setRoomEdit, 'Floor', value)} />
                </Field>
                <Field label="Capacity">
                  <TextInput type="number" value={roomEdit.Capacity} onChange={(value) => setField(setRoomEdit, 'Capacity', value)} />
                </Field>
                <Field label="Type">
                  <SelectInput value={roomEdit.RoomType} onChange={(value) => setField(setRoomEdit, 'RoomType', value)}>
                    <option value="">No change</option>
                    <option>Group</option>
                    <option>Individual</option>
                  </SelectInput>
                </Field>
                <Field label="Availability">
                  <SelectInput
                    value={roomEdit.AvailabilityStatus}
                    onChange={(value) => setField(setRoomEdit, 'AvailabilityStatus', value)}
                  >
                    <option value="">No change</option>
                    <option>Available</option>
                    <option>Unavailable</option>
                  </SelectInput>
                </Field>
                <button className="primary" type="submit">Update</button>
                <button className="danger" type="button" onClick={removeRoom}>Mark Unavailable</button>
              </form>
            </Panel>

            <Panel title="Search Rooms" icon={Search}>
              <form className="form-grid six" onSubmit={searchRooms}>
                <Field label="ID">
                  <TextInput value={roomSearch.room_id} onChange={(value) => setField(setRoomSearch, 'room_id', value)} />
                </Field>
                <Field label="Name">
                  <TextInput value={roomSearch.room_name} onChange={(value) => setField(setRoomSearch, 'room_name', value)} />
                </Field>
                <Field label="Building">
                  <TextInput value={roomSearch.building} onChange={(value) => setField(setRoomSearch, 'building', value)} />
                </Field>
                <Field label="Floor">
                  <TextInput value={roomSearch.floor} onChange={(value) => setField(setRoomSearch, 'floor', value)} />
                </Field>
                <Field label="Capacity">
                  <TextInput value={roomSearch.capacity} onChange={(value) => setField(setRoomSearch, 'capacity', value)} />
                </Field>
                <Field label="Type">
                  <SelectInput value={roomSearch.room_type} onChange={(value) => setField(setRoomSearch, 'room_type', value)}>
                    <option value="">Any</option>
                    <option>Group</option>
                    <option>Individual</option>
                  </SelectInput>
                </Field>
                <button className="primary span-two" type="submit">Search</button>
              </form>
              <DataTable columns={roomColumns} rows={rooms} />
            </Panel>
          </div>
        )}

        {activeTab === 'slots' && (
          <div className="grid two">
            <Panel title="Add Time Slot" icon={CalendarClock}>
              <form className="form-grid" onSubmit={addSlot}>
                <Field label="Date">
                  <TextInput
                    type="date"
                    value={slotForm.ReservationDate}
                    onChange={(value) => setField(setSlotForm, 'ReservationDate', value)}
                  />
                </Field>
                <Field label="Start">
                  <TextInput type="time" value={slotForm.StartTime} onChange={(value) => setField(setSlotForm, 'StartTime', value)} />
                </Field>
                <Field label="End">
                  <TextInput type="time" value={slotForm.EndTime} onChange={(value) => setField(setSlotForm, 'EndTime', value)} />
                </Field>
                <button className="primary span-two" type="submit">Add Slot</button>
              </form>
            </Panel>

            <Panel title="Search Time Slots" icon={Search}>
              <form className="form-grid" onSubmit={searchSlots}>
                <Field label="Date">
                  <TextInput type="date" value={slotSearch.date} onChange={(value) => setField(setSlotSearch, 'date', value)} />
                </Field>
                <Field label="Start">
                  <TextInput type="time" value={slotSearch.start_time} onChange={(value) => setField(setSlotSearch, 'start_time', value)} />
                </Field>
                <Field label="End">
                  <TextInput type="time" value={slotSearch.end_time} onChange={(value) => setField(setSlotSearch, 'end_time', value)} />
                </Field>
                <Field label="Future">
                  <SelectInput value={slotSearch.future_only} onChange={(value) => setField(setSlotSearch, 'future_only', value)}>
                    <option value="false">All</option>
                    <option value="true">Future only</option>
                  </SelectInput>
                </Field>
                <button className="primary span-two" type="submit">Search</button>
              </form>
            </Panel>

            <Panel title="Time Slots" icon={CalendarClock}>
              <DataTable columns={slotColumns} rows={slots} />
            </Panel>
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="grid two">
            <Panel title="Reserve A Room" icon={CheckCircle2}>
              <form className="form-grid" onSubmit={reserveRoom}>
                <Field label="Student ID">
                  <TextInput
                    type="number"
                    value={reservationForm.StudentID}
                    onChange={(value) => setField(setReservationForm, 'StudentID', value)}
                  />
                </Field>
                <Field label="Room ID">
                  <TextInput
                    type="number"
                    value={reservationForm.RoomID}
                    onChange={(value) => setField(setReservationForm, 'RoomID', value)}
                  />
                </Field>
                <Field label="Slot ID">
                  <TextInput
                    type="number"
                    value={reservationForm.SlotID}
                    onChange={(value) => setField(setReservationForm, 'SlotID', value)}
                  />
                </Field>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={reservationForm.join_waitlist}
                    onChange={(event) => setField(setReservationForm, 'join_waitlist', event.target.checked)}
                  />
                  <span>Join waitlist if booked</span>
                </label>
                <button className="primary span-two" type="submit">Reserve</button>
              </form>
            </Panel>

            <Panel title="Reservation Actions" icon={ClipboardList}>
              <div className="form-grid">
                <Field label="Reservation ID">
                  <TextInput type="number" value={reservationActionId} onChange={setReservationActionId} />
                </Field>
                <button className="ghost" type="button" onClick={checkInReservation}>Check In</button>
                <button className="danger" type="button" onClick={cancelReservation}>Cancel</button>
                <button className="primary" type="button" onClick={completeReservation}>Complete</button>
              </div>
            </Panel>

            <Panel title="Search Reservations" icon={Search}>
              <form className="form-grid six" onSubmit={searchReservations}>
                <Field label="Student">
                  <TextInput value={reservationSearch.student_id} onChange={(value) => setField(setReservationSearch, 'student_id', value)} />
                </Field>
                <Field label="Room">
                  <TextInput value={reservationSearch.room_id} onChange={(value) => setField(setReservationSearch, 'room_id', value)} />
                </Field>
                <Field label="Date">
                  <TextInput type="date" value={reservationSearch.date} onChange={(value) => setField(setReservationSearch, 'date', value)} />
                </Field>
                <Field label="Slot">
                  <TextInput value={reservationSearch.slot_id} onChange={(value) => setField(setReservationSearch, 'slot_id', value)} />
                </Field>
                <Field label="Status">
                  <SelectInput value={reservationSearch.status} onChange={(value) => setField(setReservationSearch, 'status', value)}>
                    <option value="">Any</option>
                    <option>Reserved</option>
                    <option>CheckedIn</option>
                    <option>Cancelled</option>
                    <option>Completed</option>
                    <option>NoShow</option>
                  </SelectInput>
                </Field>
                <button className="primary" type="submit">Search</button>
              </form>
              <DataTable columns={reservationColumns} rows={reservations} />
            </Panel>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="grid two">
            <Panel title="Student Schedule" icon={Users}>
              <form className="form-grid" onSubmit={loadSchedule}>
                <Field label="Student ID">
                  <TextInput type="number" value={studentScheduleId} onChange={setStudentScheduleId} />
                </Field>
                <button className="primary" type="submit">View Schedule</button>
              </form>
              <DataTable
                columns={['EntryType', 'Status', 'RoomName', 'Building', 'ReservationDate', 'StartTime', 'EndTime', 'CreatedAt']}
                rows={scheduleRows}
              />
            </Panel>

            <Panel title="Available Rooms" icon={DoorOpen}>
              <form className="form-grid" onSubmit={loadAvailableRooms}>
                <Field label="Date">
                  <TextInput type="date" value={availableQuery.date} onChange={(value) => setField(setAvailableQuery, 'date', value)} />
                </Field>
                <Field label="Slot ID">
                  <TextInput type="number" value={availableQuery.slot_id} onChange={(value) => setField(setAvailableQuery, 'slot_id', value)} />
                </Field>
                <button className="primary span-two" type="submit">Find Rooms</button>
              </form>
              <DataTable columns={[...roomColumns, 'ReservationDate', 'StartTime', 'EndTime']} rows={availableRooms} />
            </Panel>

            <Panel title="Students For Room And Slot" icon={Users}>
              <form className="form-grid" onSubmit={loadRoomSlotStudents}>
                <Field label="Room ID">
                  <TextInput type="number" value={roomSlotQuery.room_id} onChange={(value) => setField(setRoomSlotQuery, 'room_id', value)} />
                </Field>
                <Field label="Slot ID">
                  <TextInput type="number" value={roomSlotQuery.slot_id} onChange={(value) => setField(setRoomSlotQuery, 'slot_id', value)} />
                </Field>
                <button className="primary span-two" type="submit">View Students</button>
              </form>
              <DataTable
                columns={['StudentID', 'Name', 'Email', 'ReservationID', 'Status', 'ReservationDate', 'StartTime', 'EndTime']}
                rows={roomSlotStudents}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="grid two">
            <Panel title="Room Recommendation" icon={Search}>
              <form className="form-grid" onSubmit={loadRecommendations}>
                <Field label="Date">
                  <TextInput type="date" value={recommendQuery.date} onChange={(value) => setField(setRecommendQuery, 'date', value)} />
                </Field>
                <Field label="Slot ID">
                  <TextInput type="number" value={recommendQuery.slot_id} onChange={(value) => setField(setRecommendQuery, 'slot_id', value)} />
                </Field>
                <Field label="Capacity">
                  <TextInput type="number" value={recommendQuery.capacity} onChange={(value) => setField(setRecommendQuery, 'capacity', value)} />
                </Field>
                <Field label="Type">
                  <SelectInput value={recommendQuery.room_type} onChange={(value) => setField(setRecommendQuery, 'room_type', value)}>
                    <option value="">Any</option>
                    <option>Group</option>
                    <option>Individual</option>
                  </SelectInput>
                </Field>
                <Field label="Sort">
                  <SelectInput value={recommendQuery.sort} onChange={(value) => setField(setRecommendQuery, 'sort', value)}>
                    <option value="capacity">Capacity</option>
                    <option value="building">Building</option>
                    <option value="type">Type</option>
                  </SelectInput>
                </Field>
                <button className="primary" type="submit">Recommend</button>
              </form>
              <DataTable columns={['RoomID', 'RoomName', 'Building', 'Floor', 'Capacity', 'RoomType', 'ReservationDate', 'StartTime', 'EndTime']} rows={recommendations} />
            </Panel>

            <Panel title="Join Waitlist" icon={ListChecks}>
              <form className="form-grid" onSubmit={joinWaitlist}>
                <Field label="Student ID">
                  <TextInput type="number" value={waitlistForm.StudentID} onChange={(value) => setField(setWaitlistForm, 'StudentID', value)} />
                </Field>
                <Field label="Room ID">
                  <TextInput type="number" value={waitlistForm.RoomID} onChange={(value) => setField(setWaitlistForm, 'RoomID', value)} />
                </Field>
                <Field label="Slot ID">
                  <TextInput type="number" value={waitlistForm.SlotID} onChange={(value) => setField(setWaitlistForm, 'SlotID', value)} />
                </Field>
                <button className="primary span-two" type="submit">Join Waitlist</button>
              </form>
            </Panel>

            <Panel title="Waitlist Queue" icon={ListChecks}>
              <DataTable columns={waitlistColumns} rows={waitlist} />
            </Panel>
          </div>
        )}
      </main>
    </div>
  );
}
