/**
 * University of Waterloo Engineering 5 (E5) Staff Onboarding & Workplace Companion Data
 * Tailored for Sessional Instructors, Contract Staff, and New Employees.
 */

export type StaffRole = 'instructor' | 'contract' | 'staff';

export interface RoleConfig {
  id: StaffRole;
  label: string;
  badge: string;
  subtitle: string;
  description: string;
  accentColor: string;
  iconName: string;
  recommendedHighlights: string[];
}

export const STAFF_ROLES: Record<StaffRole, RoleConfig> = {
  instructor: {
    id: 'instructor',
    label: 'Sessional Instructor',
    badge: 'Teaching & Academics',
    subtitle: 'Classrooms, AV podiums, mailrooms, and student support',
    description: 'Everything you need to step into the classroom confidently: lecture hall tech, microphone loans, syllabus printing, exam drop-off, and urgent AV hotlines.',
    accentColor: 'from-amber-500 to-orange-600',
    iconName: 'GraduationCap',
    recommendedHighlights: [
      'Locate assigned lecture halls (E5 3101, 3102, 2004)',
      'Test Crestron AV podium & HDMI display inputs',
      'Find departmental mailrooms for syllabi & assignment hand-in',
      'Bookmark the Classroom Tech Hotline (ext. 44357)',
    ],
  },
  contract: {
    id: 'contract',
    label: 'Contract Staff',
    badge: 'Facilities & Operations',
    subtitle: 'Building access, after-hours protocols, facilities, and workspaces',
    description: 'Crucial logistical info for project-based and operational personnel: after-hours WatCard swipe points, key pickup, loading bays, tool cribs, and staff lounges.',
    accentColor: 'from-emerald-500 to-teal-700',
    iconName: 'Wrench',
    recommendedHighlights: [
      'Learn after-hours building lock schedules & swipe doors',
      'Locate Key Control & Departmental Admin offices',
      'Find staff breakrooms, microwaves, and water stations',
      'Discover loading dock and workshop roll-up bays',
    ],
  },
  staff: {
    id: 'staff',
    label: 'New Employee',
    badge: 'General Onboarding',
    subtitle: 'WatCard, printing, department offices, transit, and health & safety',
    description: 'Your complete first-weeks companion: campus ID pickup, uPrint printer stations, pedestrian indoor bridges to E3 & E7, emergency AEDs, and commute options.',
    accentColor: 'from-blue-600 to-indigo-700',
    iconName: 'Briefcase',
    recommendedHighlights: [
      'Pick up & activate WatCard at the Student Life Centre',
      'Set up uPrint card-tap printing near Gear Lab (2108)',
      'Explore indoor winter bridge connections to E7 and E3',
      'Locate nearest emergency AED and First Aid stations',
    ],
  },
};

export interface OnboardingTask {
  id: string;
  role: StaffRole | 'all';
  title: string;
  category: 'access' | 'teaching' | 'workplace' | 'safety' | 'transit';
  priority: 'day1' | 'week1' | 'month1';
  locationName: string;
  roomId?: string;
  floor: number;
  description: string;
  proTip: string;
  contact?: string;
  actionLabel?: string;
  externalUrl?: { title: string; url: string };
}

export const ONBOARDING_TASKS: OnboardingTask[] = [
  // --- DAY 1: INSTRUCTOR ---
  {
    id: 'task-inst-1',
    role: 'instructor',
    title: 'Visit your assigned lecture hall & test the podium',
    category: 'teaching',
    priority: 'day1',
    locationName: 'Department Lecture Hall E5 3101 / 3102',
    roomId: 'e5-3101',
    floor: 3,
    description: 'Check the Crestron touch screen, connect your laptop via HDMI/USB-C, and test projector brightness before your first lecture.',
    proTip: 'Podiums require no password, but if the touch screen is dark, tap it twice. The wireless lavalier mic is inside the drawer.',
    contact: 'IST Classroom AV Support: ext. 44357 (speed-dial on podium phone)',
    externalUrl: { title: 'UWaterloo Classroom Podiums Guide', url: 'https://uwaterloo.ca/information-systems-technology/services/classroom-technology-services' },
  },
  {
    id: 'task-inst-2',
    role: 'instructor',
    title: 'Locate the Departmental Mailroom & Copy Center',
    category: 'workplace',
    priority: 'day1',
    locationName: 'MME Department Mailroom (Level 3)',
    roomId: 'e5-3101',
    floor: 3,
    description: 'Find your faculty mailbox for student assignment drop-offs, inter-departmental letters, and syllabus printing pickup.',
    proTip: 'High-volume syllabus printing is handled via W Print (Central Stores). For urgent exams, departmental staff will program your WatCard for copy room access.',
    contact: 'MME Department Office: e5mme@uwaterloo.ca (ext. 33341)',
  },
  {
    id: 'task-inst-3',
    role: 'instructor',
    title: 'Check the 60-seat breakout classroom (E5 2004)',
    category: 'teaching',
    priority: 'day1',
    locationName: 'SDC Classroom E5 2004',
    roomId: 'e5-2004',
    floor: 2,
    description: 'Frequently booked for tutorial sections, midterm quizzes, and capstone design team presentations.',
    proTip: 'Equipped with movable tables and dual whiteboards. Whiteboard dry-erase markers are stocked in the SDC Operations Hub (1002).',
  },
  {
    id: 'task-inst-4',
    role: 'instructor',
    title: 'Review Classroom Issue Reporting & AV Hotline',
    category: 'teaching',
    priority: 'week1',
    locationName: 'Lecture Concourse E5 Level 3',
    roomId: 'e5-3102',
    floor: 3,
    description: 'Know what to do if a projector bulb fails or sound cuts out mid-lecture.',
    proTip: 'Classroom tech staff are stationed across Ring Road in DC; dispatch time to E5 is usually under 5 minutes during class hours.',
    contact: 'Emergency AV dispatch: 519-888-4567 ext. 44357',
  },

  // --- DAY 1: CONTRACT STAFF ---
  {
    id: 'task-cont-1',
    role: 'contract',
    title: 'Check after-hours entrance & WatCard swipe readers',
    category: 'access',
    priority: 'day1',
    locationName: 'Level 2 Main Campus Entrance (facing DC)',
    roomId: 'e5-2811',
    floor: 2,
    description: 'Exterior doors to E5 lock promptly at 19:00 on weekdays and all day on weekends. Familiarize yourself with the badge reader.',
    proTip: 'If your WatCard does not beep green at the reader, contact your department administrator to have E5 perimeter access added in the CCURE security system.',
    contact: 'UW Security Systems & Access: security.access@uwaterloo.ca',
  },
  {
    id: 'task-cont-2',
    role: 'contract',
    title: 'Locate Key Control & Facility Supervisor Office',
    category: 'access',
    priority: 'day1',
    locationName: 'SDC Operations Hub E5 1002 / Plant Ops',
    roomId: 'e5-1002',
    floor: 1,
    description: 'Pick up authorization for laboratory keys, tool crib tags, or equipment locker padlocks.',
    proTip: 'Physical metal master keys are issued at the Key Control desk in General Services Complex (GSC). You will need a signed Key Request Form.',
    contact: 'Key Control (GSC): ext. 33765 (keys@uwaterloo.ca)',
  },
  {
    id: 'task-cont-3',
    role: 'contract',
    title: 'Find Staff Breakroom, Microwave & Filtered Water',
    category: 'workplace',
    priority: 'day1',
    locationName: 'Level 3 Collaborative Commons & Kitchenette',
    roomId: 'e5-3812A',
    floor: 3,
    description: 'Refrigerators, microwaves, kettle, and filtered water refill fountain for staff breaks.',
    proTip: 'There are no food outlets inside E5. University Plaza across the tracks has dozens of lunch options (pitas, noodles, burgers, bubble tea).',
  },
  {
    id: 'task-cont-4',
    role: 'contract',
    title: 'Inspect Loading Dock & Vehicle Roll-Up Bay',
    category: 'workplace',
    priority: 'week1',
    locationName: 'East Vehicle Testing Bay & Concourse (1102 / 1816)',
    roomId: 'e5-1102',
    floor: 1,
    description: 'For freight deliveries, heavy machinery delivery, and equipment roll-ins.',
    proTip: 'Delivery trucks access via the East ring spur off Phillip St. Temporary 20-minute loading permits available through Plant Operations.',
  },

  // --- DAY 1: NEW EMPLOYEE ---
  {
    id: 'task-emp-1',
    role: 'staff',
    title: 'Obtain your WatCard (Campus ID & Access Card)',
    category: 'access',
    priority: 'day1',
    locationName: 'WatCard Office (Student Life Centre - SLC)',
    floor: 2,
    description: 'Your WatCard is your official employee ID, library card, after-hours building key, and uPrint payment card.',
    proTip: 'Bring one government-issued photo ID. You can submit your photo online in advance to skip the queue at the SLC counter.',
    contact: 'WatCard Office: ext. 35483 (watcard@uwaterloo.ca)',
    externalUrl: { title: 'UWaterloo WatCard Services', url: 'https://uwaterloo.ca/watcard/' },
  },
  {
    id: 'task-emp-2',
    role: 'staff',
    title: 'Set up uPrint card-tap printing at Gear Lab',
    category: 'workplace',
    priority: 'day1',
    locationName: 'Gear Computer Lab E5 2108',
    roomId: 'e5-2108',
    floor: 2,
    description: 'High-speed multifunction printers/copiers. Print from any device to the cloud queue and release with your WatCard.',
    proTip: 'Install the PaperCut Mobility Print client on your laptop or phone. Department accounts can be linked to your WatCard for free billing.',
    contact: 'IST Service Desk: helpdesk@uwaterloo.ca (ext. 44357)',
    externalUrl: { title: 'UWaterloo uPrint Setup', url: 'https://uwaterloo.ca/information-systems-technology/services/uprint' },
  },
  {
    id: 'task-emp-3',
    role: 'staff',
    title: 'Explore indoor bridge links to E3 & E7 (Winter proofing!)',
    category: 'transit',
    priority: 'day1',
    locationName: 'Level 1 E7 Concourse & Level 3 E3 Overpass',
    roomId: 'e5-1808',
    floor: 1,
    description: 'Walk across the engineering complex without putting on a winter coat.',
    proTip: 'Level 1 North corridor (1808) leads directly into E7 atrium and food vendors. Level 3 corridor (3818) connects across Ring Road to E3.',
  },
  {
    id: 'task-emp-4',
    role: 'staff',
    title: 'Locate Emergency AED & First Aid on Level 2',
    category: 'safety',
    priority: 'day1',
    locationName: 'Level 2 Main Lobby (outside 2811)',
    roomId: 'e5-2811',
    floor: 2,
    description: 'Automated External Defibrillator (AED) and wall-mounted first aid emergency kit.',
    proTip: 'In an emergency, dial 22222 on any campus phone (or 519-888-4911 on your mobile) to reach Waterloo Campus Police dispatch immediately.',
    contact: 'UW Safety Office: ext. 33587 | UW Police Emergency: ext. 22222',
  },
  {
    id: 'task-emp-5',
    role: 'staff',
    title: 'Commuter Check: ION LRT Station & Staff Parking',
    category: 'transit',
    priority: 'week1',
    locationName: 'South Plaza facing Ring Road',
    roomId: 'e5-2811',
    floor: 2,
    description: 'University of Waterloo ION LRT train station is a 3-minute walk south of the E5 main entrance.',
    proTip: 'Staff parking permits for Lots B, C, and Q are managed by Sustainable Transportation in GSC. Enclosed bike cage is situated between E5 and E7.',
    contact: 'UW Parking Services: parking@uwaterloo.ca (ext. 33100)',
    externalUrl: { title: 'UWaterloo Parking & Transit', url: 'https://uwaterloo.ca/parking/' },
  },
  {
    id: 'task-emp-6',
    role: 'staff',
    title: 'Dean of Engineering Executive Suite & Boardroom',
    category: 'workplace',
    priority: 'month1',
    locationName: 'Level 5 Executive Suite E5 5101',
    roomId: 'e5-5101',
    floor: 5,
    description: 'Offices for the Dean, Associate Deans (Research, Graduate, Undergraduate), and Faculty Council.',
    proTip: 'Quiet floor with reception desk at room 5101 for faculty administrative inquiries and executive meetings.',
  },
];

export interface ClassroomTechSpec {
  roomId: string;
  roomNumber: string;
  name: string;
  floor: number;
  capacity: number;
  podiumModel: string;
  displaySetup: string;
  audioSetup: string;
  computerSpecs: string;
  connectivity: string[];
  lectureCapture: boolean;
  docCamera: boolean;
  whiteboards: string;
  wheelchairAccessible: boolean;
  avHotline: string;
  notes: string;
}

export const CLASSROOM_SPECS: Record<string, ClassroomTechSpec> = {
  'e5-3101': {
    roomId: 'e5-3101',
    roomNumber: '3101',
    name: 'Department Lecture Hall E5 3101',
    floor: 3,
    capacity: 114,
    podiumModel: 'Crestron 10-inch Color Touch Panel (Standard Waterloo Design)',
    displaySetup: 'Dual high-lumen 1080p laser projectors with independent source switching',
    audioSetup: 'Podium gooseneck microphone + wireless lapel bodypack in podium drawer; ceiling room mics',
    computerSpecs: 'Built-in Windows 11 PC (waterloo.ca domain login) + high-speed wired gigabit internet',
    connectivity: ['HDMI', 'USB-C (video & 65W charging)', 'Crestron AirMedia (wireless)', '3.5mm Aux Audio'],
    lectureCapture: true,
    docCamera: true,
    whiteboards: 'Triple sliding porcelain magnetic chalkboards with dedicated down-lighting',
    wheelchairAccessible: true,
    avHotline: 'Classroom Tech: ext. 44357 (direct dial on podium phone)',
    notes: 'Power outlets at every student desk row. Assistive listening FM system installed.',
  },
  'e5-3102': {
    roomId: 'e5-3102',
    roomNumber: '3102',
    name: 'Department Lecture Hall E5 3102',
    floor: 3,
    capacity: 118,
    podiumModel: 'Crestron 10-inch Touch Panel with motorized height-adjustable podium',
    displaySetup: 'Dual high-definition laser projectors with wide-angle throw',
    audioSetup: 'Podium gooseneck microphone + rechargeable wireless beltpack with lapel mic',
    computerSpecs: 'Built-in Windows 11 teaching workstation with dual monitor preview',
    connectivity: ['HDMI', 'USB-C DisplayPort Alt Mode', 'Crestron AirMedia', 'VGA legacy'],
    lectureCapture: true,
    docCamera: true,
    whiteboards: 'Full-wall sliding whiteboards (use low-odor dry erase markers only)',
    wheelchairAccessible: true,
    avHotline: 'Classroom Tech: ext. 44357',
    notes: 'Wheelchair stations with power access located on the front entrance level.',
  },
  'e5-2004': {
    roomId: 'e5-2004',
    roomNumber: '2004',
    name: 'Sedra Student Design Centre Classroom E5 2004',
    floor: 2,
    capacity: 60,
    podiumModel: 'Wall-mounted Crestron Push-Button Control & HDMI Wallbox',
    displaySetup: 'Single ceiling-mounted 4K laser projector onto motorized screen',
    audioSetup: 'Integrated ceiling speakers; wired podium handheld microphone',
    computerSpecs: 'Bring Your Own Device (BYOD) via HDMI / USB-C connection',
    connectivity: ['HDMI', 'USB-C', 'AirMedia'],
    lectureCapture: false,
    docCamera: false,
    whiteboards: 'Dual dry-erase magnetic whiteboards on front and side walls',
    wheelchairAccessible: true,
    avHotline: 'SDC Operations: ext. 31002 | IST AV: ext. 44357',
    notes: 'Movable seminar tables can be arranged in pods or rows. Popular for team critiques.',
  },
  'e5-3052': {
    roomId: 'e5-3052',
    roomNumber: '3052',
    name: 'Seminar & Presentation Room E5 3052',
    floor: 3,
    capacity: 20,
    podiumModel: 'Extron Touch Panel with Webex / Teams Room Bar',
    displaySetup: 'Dual 75-inch commercial 4K LED monitors for presentations and remote video participants',
    audioSetup: 'Ceiling array boundary microphone with acoustic echo cancellation',
    computerSpecs: 'Dedicated Microsoft Teams Room PC + BYOD HDMI cable',
    connectivity: ['HDMI', 'USB-C', 'Wireless Casting'],
    lectureCapture: true,
    docCamera: false,
    whiteboards: 'Glass dry-erase wall board',
    wheelchairAccessible: true,
    avHotline: 'IST Video Conferencing: ext. 44357',
    notes: 'Ideal for graduate defense, departmental committee meetings, and hybrid staff calls.',
  },
  'e5-6005': {
    roomId: 'e5-6005',
    roomNumber: '6005',
    name: 'Systems Design Teaching Laboratory E5 6005',
    floor: 6,
    capacity: 48,
    podiumModel: 'Instructor Bench Crestron Switcher with overhead digital camera',
    displaySetup: 'Dual 85-inch interactive displays with digital ink stylus capability',
    audioSetup: 'Ceiling PA system with wireless headset for lab demonstrations',
    computerSpecs: 'Dedicated lab host PC connected to university CAD/MATLAB license server',
    connectivity: ['HDMI', 'USB-C', 'Ethernet'],
    lectureCapture: false,
    docCamera: true,
    whiteboards: 'Full wall whiteboard across North perimeter',
    wheelchairAccessible: true,
    avHotline: 'SYDE IT Support: ext. 33284',
    notes: 'Emergency eye-wash and shower station located in adjacent service corridor.',
  },
};

export interface EmergencyPoint {
  id: string;
  floor: number;
  type: 'aed' | 'first-aid' | 'eyewash' | 'exit' | 'phone';
  name: string;
  description: string;
  coords: { x: number; y: number };
  closestRoomNumber?: string;
}

export const EMERGENCY_POINTS: EmergencyPoint[] = [
  // Floor 1
  {
    id: 'em-1-aed',
    floor: 1,
    type: 'aed',
    name: 'Level 1 AED Defibrillator',
    description: 'Mounted outside SDC Operations Hub 1002 in the main assembly corridor',
    coords: { x: 57.4, y: 53.0 },
    closestRoomNumber: '1002',
  },
  {
    id: 'em-1-fa',
    floor: 1,
    type: 'first-aid',
    name: 'Machine Shop First Aid Station',
    description: 'Full trauma first aid kit with burn dressing inside Machine Shop supervisor bay',
    coords: { x: 67.7, y: 72.0 },
    closestRoomNumber: '1101E',
  },
  {
    id: 'em-1-eye',
    floor: 1,
    type: 'eyewash',
    name: 'Emergency Eyewash & Safety Shower',
    description: 'Pull-chain safety drench shower & eyewash in Machine Shop welding bay',
    coords: { x: 78.0, y: 24.0 },
    closestRoomNumber: '1101C',
  },
  {
    id: 'em-1-exit-w',
    floor: 1,
    type: 'exit',
    name: 'West Ground Emergency Fire Exit',
    description: 'Direct ground-level egress to west courtyard (Room 1818)',
    coords: { x: 9.5, y: 55.0 },
    closestRoomNumber: '1818',
  },
  {
    id: 'em-1-exit-s',
    floor: 1,
    type: 'exit',
    name: 'South Emergency Fire Exit',
    description: 'Ground exit toward Ring Road (Room 1810)',
    coords: { x: 62.0, y: 72.0 },
    closestRoomNumber: '1810',
  },

  // Floor 2
  {
    id: 'em-2-aed',
    floor: 2,
    type: 'aed',
    name: 'Level 2 Main Lobby AED',
    description: 'Mounted in the Main Atrium beside the security notice board (Entrance 2811)',
    coords: { x: 58.5, y: 53.0 },
    closestRoomNumber: '2811',
  },
  {
    id: 'em-2-fa',
    floor: 2,
    type: 'first-aid',
    name: 'Gear Lab First Aid Kit',
    description: 'Mounted at technician check-in desk inside Gear Computer Lab (2108)',
    coords: { x: 77.0, y: 58.0 },
    closestRoomNumber: '2108',
  },

  // Floor 3
  {
    id: 'em-3-aed',
    floor: 3,
    type: 'aed',
    name: 'Level 3 Lecture Concourse AED',
    description: 'Centered between Department Lecture Halls 3101 and 3102 opposite southeast elevators',
    coords: { x: 63.5, y: 48.0 },
    closestRoomNumber: '3101',
  },
  {
    id: 'em-3-fa',
    floor: 3,
    type: 'first-aid',
    name: 'MME Department Office First Aid Kit',
    description: 'Staff first aid kit and CPR mask in Department administration suite',
    coords: { x: 52.0, y: 45.0 },
    closestRoomNumber: '3052',
  },

  // Floor 5
  {
    id: 'em-5-aed',
    floor: 5,
    type: 'aed',
    name: 'Level 5 Dean Suite AED',
    description: 'Outside Faculty of Engineering Boardroom & Dean reception (5101)',
    coords: { x: 64.0, y: 45.0 },
    closestRoomNumber: '5101',
  },

  // Floor 6
  {
    id: 'em-6-eye',
    floor: 6,
    type: 'eyewash',
    name: 'Teaching Lab Eyewash Station',
    description: 'Mounted at entrance to Systems Design Teaching Lab 6005',
    coords: { x: 61.0, y: 38.0 },
    closestRoomNumber: '6005',
  },
];

export interface KeyContact {
  id: string;
  department: string;
  role: string;
  ext: string;
  phone: string;
  email: string;
  office: string;
  hours: string;
  urgentServices: string;
}

export const WATERLOO_KEY_CONTACTS: KeyContact[] = [
  {
    id: 'police',
    department: 'Waterloo Campus Police',
    role: 'Emergency Dispatch & 24/7 Security',
    ext: '22222',
    phone: '519-888-4911',
    email: 'police@uwaterloo.ca',
    office: 'Commissary Building (COM)',
    hours: '24 hours / 7 days',
    urgentServices: 'Medical emergency, suspicious activity, security escort (SafeWalk), emergency door unlock.',
  },
  {
    id: 'ist-av',
    department: 'IST Classroom Technology & AV Support',
    role: 'Podium & Classroom Equipment Hotline',
    ext: '44357',
    phone: '519-888-4567 ext. 44357',
    email: 'it-servicedesk@uwaterloo.ca',
    office: 'Davis Centre (DC) 2608',
    hours: '08:00 – 21:00 M–Th, 08:00 – 17:00 Fri',
    urgentServices: 'In-class podium failure, projector dead, lapel mic batteries, HDMI adapter loans.',
  },
  {
    id: 'plant-ops',
    department: 'Plant Operations (Facilities & Maintenance)',
    role: 'Spills, Heating/Cooling & Building Repairs',
    ext: '33793',
    phone: '519-888-4567 ext. 33793',
    email: 'plantops@uwaterloo.ca',
    office: 'General Services Complex (GSC)',
    hours: '24/7 emergency dispatch',
    urgentServices: 'Water leaks, broken locks, elevator outages, custodial cleanup, temperature adjustment.',
  },
  {
    id: 'key-control',
    department: 'Key Control Office',
    role: 'Physical Metal Keys & Padlocks',
    ext: '33765',
    phone: '519-888-4567 ext. 33765',
    email: 'keys@uwaterloo.ca',
    office: 'General Services Complex (GSC) 1105',
    hours: '08:30 – 16:30 Mon–Fri',
    urgentServices: 'Office keys, lab access keys, master key requisitions, lock rekeying.',
  },
  {
    id: 'watcard',
    department: 'WatCard Office',
    role: 'Employee ID & Electronic Access Cards',
    ext: '35483',
    phone: '519-888-4567 ext. 35483',
    email: 'watcard@uwaterloo.ca',
    office: 'Student Life Centre (SLC) 0112',
    hours: '09:00 – 16:30 Mon–Fri',
    urgentServices: 'New employee card issue, replacement lost cards, uPrint card activation.',
  },
  {
    id: 'mme-dept',
    department: 'Mechanical & Mechatronics Engineering (MME)',
    role: 'Departmental Administrator & Mailroom Hub',
    ext: '33341',
    phone: '519-888-4567 ext. 33341',
    email: 'e5mme@uwaterloo.ca',
    office: 'E5 Level 3 (Central Admin Suite)',
    hours: '08:30 – 16:30 Mon–Fri',
    urgentServices: 'Syllabus printing, office assignments, mailboxes, departmental meeting room bookings.',
  },
  {
    id: 'sdc-ops',
    department: 'Sedra Student Design Centre Operations',
    role: 'Shop Training & Project Bay Access',
    ext: '31002',
    phone: '519-888-4567 ext. 31002',
    email: 'sdc@uwaterloo.ca',
    office: 'E5 1002 (Level 1 Hub)',
    hours: '08:30 – 16:30 Mon–Fri (Bays open 24/7 for authorized teams)',
    urgentServices: 'Safety goggles, battery recycling, loading bay rollup access, workshop certifications.',
  },
];

export interface Day1TourStop {
  id: string;
  name: string;
  roomId: string;
  floor: number;
  title: string;
  whyVisit: string;
  checkHint: string;
}

export const DAY1_TOURS: Record<StaffRole, Day1TourStop[]> = {
  instructor: [
    {
      id: 'tour-inst-1',
      name: 'Main Campus Entrance & Atrium',
      roomId: 'e5-2811',
      floor: 2,
      title: 'Entrance & Barrier-Free Access',
      whyVisit: 'Primary entrance from Davis Centre and Ring Road with ramped walkway and after-hours card swipe.',
      checkHint: 'Notice the AED on the lobby wall and accessibility push-buttons.',
    },
    {
      id: 'tour-inst-2',
      name: 'SDC Classroom E5 2004',
      roomId: 'e5-2004',
      floor: 2,
      title: '60-Seat Breakout Classroom',
      whyVisit: 'Movable desks for active-learning tutorials and design critiques.',
      checkHint: 'Locate the wall-mounted HDMI connection plate and whiteboard marker tray.',
    },
    {
      id: 'tour-inst-3',
      name: 'Department Lecture Hall E5 3101',
      roomId: 'e5-3101',
      floor: 3,
      title: 'Tiered 114-Seat Multimedia Hall',
      whyVisit: 'Primary engineering teaching venue with dual laser projectors and document camera.',
      checkHint: 'Find the Crestron touch panel on the podium and test the gooseneck mic.',
    },
    {
      id: 'tour-inst-4',
      name: 'Level 3 Staff Lounge & Kitchenette',
      roomId: 'e5-3812A',
      floor: 3,
      title: 'Staff Lounge & Collaboration Commons',
      whyVisit: 'Microwave, refrigerator, kettle, and quiet seating between lectures.',
      checkHint: 'Check the water filtration fountain beside the southeast washrooms.',
    },
    {
      id: 'tour-inst-5',
      name: 'Engineering 3 (E3) Pedestrian Bridge',
      roomId: 'e5-3818',
      floor: 3,
      title: 'Indoor Winter Bridge Link to E3',
      whyVisit: 'Enclosed walkway spanning Ring Road to reach classrooms in E3, CPH, and DWE without going outdoors.',
      checkHint: 'Takes you straight across to E3 Level 3 without stepping into rain or snow.',
    },
  ],
  contract: [
    {
      id: 'tour-cont-1',
      name: 'Main Campus Entrance 2811',
      roomId: 'e5-2811',
      floor: 2,
      title: 'After-Hours Swipe Entry',
      whyVisit: 'Main perimeter entry point active 24/7 with authorized WatCard fob access.',
      checkHint: 'Ensure your WatCard activates the green LED indicator on the wall badge reader.',
    },
    {
      id: 'tour-cont-2',
      name: 'SDC Operations Hub & Safety Desk',
      roomId: 'e5-1002',
      floor: 1,
      title: 'Operations Desk & Equipment Check-Out',
      whyVisit: 'Central hub for safety gear, facility supervisor sign-offs, and team authorizations.',
      checkHint: 'Level 1 AED is mounted directly beside this office.',
    },
    {
      id: 'tour-cont-3',
      name: 'Engineering Student Machine Shop',
      roomId: 'e5-1101',
      floor: 1,
      title: 'Heavy Machine Shop & Tool Crib',
      whyVisit: 'CNC mills, manual lathes, metrology, and certified hot-work booths.',
      checkHint: 'Review eye-protection boundary line on the floor.',
    },
    {
      id: 'tour-cont-4',
      name: 'East Vehicle Bay & Roll-Up Ramp',
      roomId: 'e5-1102',
      floor: 1,
      title: 'Loading Bay & Roll-Up Doors',
      whyVisit: 'Freight loading dock, heavy equipment intake, and recycling dumpsters.',
      checkHint: 'Look for the vehicle loading spur and clear emergency exit path (1816).',
    },
    {
      id: 'tour-cont-5',
      name: 'North Ground Link to E7 Atrium',
      roomId: 'e5-1808',
      floor: 1,
      title: 'Indoor Link to Engineering 7',
      whyVisit: 'Direct connection to E7 atrium, food stalls, and outdoor courtyard.',
      checkHint: 'Fastest route to E7 food and second-level transit concourse.',
    },
  ],
  staff: [
    {
      id: 'tour-emp-1',
      name: 'Main Campus Entrance 2811',
      roomId: 'e5-2811',
      floor: 2,
      title: 'Main Lobby & Welcome Point',
      whyVisit: 'Primary entrance facing Davis Centre, bus loops, and Ring Road.',
      checkHint: 'Note the AED defibrillator and barrier-free automatic door push plates.',
    },
    {
      id: 'tour-emp-2',
      name: 'Gear Computer Lab 2108',
      roomId: 'e5-2108',
      floor: 2,
      title: 'uPrint Station & 50+ Workstations',
      whyVisit: 'Main public printing, scanning, and engineering computing hub.',
      checkHint: 'Tap your WatCard on the multi-function printer console to release print jobs.',
    },
    {
      id: 'tour-emp-3',
      name: 'Rapid Prototyping Centre (RPC)',
      roomId: 'e5-2002',
      floor: 2,
      title: 'Additive 3D Printing & Laser Center',
      whyVisit: 'Commercial rapid prototyping and student fabrication resources.',
      checkHint: 'Check the project intake showcase in the glass corridor.',
    },
    {
      id: 'tour-emp-4',
      name: 'Level 3 Collaborative Commons',
      roomId: 'e5-3812A',
      floor: 3,
      title: 'Staff Lounge & Kitchenette',
      whyVisit: 'Microwave, hot/cold filtered water dispenser, and comfortable break seating.',
      checkHint: 'All-gender accessible washrooms are across the hallway.',
    },
    {
      id: 'tour-emp-5',
      name: 'Dean of Engineering Suite 5101',
      roomId: 'e5-5101',
      floor: 5,
      title: 'Faculty Executive Offices',
      whyVisit: 'Dean, Associate Deans, and Faculty Council boardroom.',
      checkHint: 'Take the southeast elevator bank directly up to Level 5.',
    },
  ],
};
