import type { FloorNavPlan } from '../shared/gemini';

// Sample buildings from the FloorNav AI Studio prototype (Helix office, Mercy hospital,
// Skyline airport). Converted to InsideOut buildings in floorNavBuildings.ts.

// Sample 1: Helix Innovation Hub (Floor 2) - Matches the clean architectural light UI
const helixOfficeSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 780" width="100%" height="100%">
  <!-- Soft Architectural Canvas Background -->
  <rect width="750" height="780" fill="#e4eae4"/>
  
  <!-- Outer Floor Boundary -->
  <rect x="25" y="25" width="700" height="730" rx="12" fill="#e4eae4" stroke="#cdd7cd" stroke-width="2"/>

  <!-- ROOMS: TOP ROW -->
  <!-- Engineering Pod A -->
  <g id="eng-pod-a">
    <rect x="40" y="40" width="310" height="180" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="56" y="66" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Engineering Pod A</text>
  </g>

  <!-- Boardroom Atlas -->
  <g id="boardroom-atlas">
    <rect x="380" y="40" width="180" height="180" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="396" y="66" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Boardroom Atlas</text>
  </g>

  <!-- WC (Restrooms) -->
  <g id="wc-north">
    <rect x="580" y="40" width="130" height="180" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="596" y="66" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">WC</text>
  </g>

  <!-- ROOMS: MIDDLE ROW -->
  <!-- Focus Pods -->
  <g id="focus-pods">
    <rect x="40" y="250" width="145" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="56" y="276" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Focus Pods</text>
  </g>

  <!-- UX Studio -->
  <g id="ux-studio">
    <rect x="205" y="250" width="145" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="221" y="276" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">UX Studio</text>
  </g>

  <!-- Server -->
  <g id="server">
    <rect x="380" y="250" width="105" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="396" y="276" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Server</text>
  </g>

  <!-- Lifts (Elevators) -->
  <g id="lifts">
    <rect x="505" y="250" width="105" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="521" y="276" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Lifts</text>
  </g>

  <!-- ROOMS: BOTTOM ROW -->
  <!-- Bistro -->
  <g id="bistro">
    <rect x="40" y="410" width="310" height="170" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="56" y="436" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Bistro</text>
  </g>

  <!-- Training Room -->
  <g id="training">
    <rect x="380" y="410" width="330" height="170" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="396" y="436" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Training</text>
  </g>

  <!-- Lobby & Reception (Bottom Center) -->
  <g id="lobby">
    <rect x="235" y="610" width="280" height="120" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
    <text x="251" y="636" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#334155">Lobby</text>
  </g>
</svg>
`)}`
;

// Sample 2: Hospital & Medical Pavilion
const hospitalSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 780" width="100%" height="100%">
  <rect width="750" height="780" fill="#e2e8e4"/>
  <rect x="25" y="25" width="700" height="730" rx="12" fill="#e2e8e4" stroke="#c5d2c8" stroke-width="2"/>

  <!-- Imaging & MRI -->
  <rect x="40" y="40" width="310" height="180" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="56" y="66" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Diagnostic Imaging & MRI</text>

  <!-- Emergency & Triage -->
  <rect x="380" y="40" width="330" height="180" rx="6" fill="#ffffff" stroke="#fca5a5" stroke-width="1.8"/>
  <text x="396" y="66" font-family="sans-serif" font-size="12" font-weight="600" fill="#dc2626">Emergency & Triage</text>

  <!-- Pharmacy -->
  <rect x="40" y="250" width="145" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="56" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Pharmacy</text>

  <!-- Lab -->
  <rect x="205" y="250" width="145" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="221" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Specimen Lab</text>

  <!-- Elevators -->
  <rect x="380" y="250" width="105" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="396" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Lifts</text>

  <!-- Pediatric Clinic -->
  <rect x="505" y="250" width="205" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="521" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Pediatric Clinic</text>

  <!-- Wellness Bistro -->
  <rect x="40" y="410" width="310" height="170" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="56" y="436" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Wellness Cafeteria</text>

  <!-- Outpatient Suites -->
  <rect x="380" y="410" width="330" height="170" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="396" y="436" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Outpatient Suites</text>

  <!-- Main Admission Lobby -->
  <rect x="235" y="610" width="280" height="120" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="251" y="636" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Main Admission Lobby</text>
</svg>
`)}`
;

// Sample 3: Airport Concourse
const airportSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 780" width="100%" height="100%">
  <rect width="750" height="780" fill="#e0e6ec"/>
  <rect x="25" y="25" width="700" height="730" rx="12" fill="#e0e6ec" stroke="#c0ccda" stroke-width="2"/>

  <!-- Gates B1-B3 -->
  <rect x="40" y="40" width="310" height="180" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="56" y="66" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Gates B1 · B3</text>

  <!-- Airline Club Lounge -->
  <rect x="380" y="40" width="180" height="180" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="396" y="66" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Skyline Club</text>

  <!-- Restrooms WC -->
  <rect x="580" y="40" width="130" height="180" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="596" y="66" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">WC</text>

  <!-- Coffee & Cafe -->
  <rect x="40" y="250" width="145" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="56" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Espresso Bar</text>

  <!-- News & Gifts -->
  <rect x="205" y="250" width="145" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="221" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Duty Free</text>

  <!-- Lifts -->
  <rect x="380" y="250" width="105" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="396" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Lifts</text>

  <!-- Charging Lounge -->
  <rect x="505" y="250" width="105" height="130" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="521" y="276" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Charging Hub</text>

  <!-- Food Court -->
  <rect x="40" y="410" width="310" height="170" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="56" y="436" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Bistro & Dining</text>

  <!-- Gates B2-B4 -->
  <rect x="380" y="410" width="330" height="170" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="396" y="436" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Gates B2 · B4 · B6</text>

  <!-- Security Checkpoint -->
  <rect x="235" y="610" width="280" height="120" rx="6" fill="#ffffff" stroke="#c2ccc2" stroke-width="1.8"/>
  <text x="251" y="636" font-family="sans-serif" font-size="12" font-weight="600" fill="#334155">Security & Check-in</text>
</svg>
`)}`
;

export const FLOORNAV_SAMPLES: Array<FloorNavPlan & { source?: string }> = [
  {
    id: 'sample-office-2',
    title: 'Helix Innovation Hub',
    buildingType: 'Floor 2 · Corporate technology office',
    summary: 'Multi-wing modern engineering center with open collaboration pods, focus booths, executive boardroom, bistro kitchen, and accessible restrooms.',
    scaleNote: 'Scale: 1% width ≈ 0.65 meters (total 65m x 45m)',
    imageUrl: helixOfficeSvg,
    source: 'sample',
    defaultStartId: 'poi-reception',
    rooms: [
      {
        id: 'poi-reception',
        name: 'Main Reception & Lobby',
        roomNumber: 'Lobby',
        category: 'entrance',
        coords: { x: 50, y: 86.5 },
        bounds: { x: 31.3, y: 78.2, width: 37.3, height: 15.4 },
        description: 'Floor 2 entrance gate, guest check-in desk, and digital directory.',
        accessible: true,
      },
      {
        id: 'poi-boardroom',
        name: 'Boardroom Atlas',
        roomNumber: 'Room 202 · Conference',
        category: 'conference',
        coords: { x: 62.7, y: 16.7 },
        bounds: { x: 50.7, y: 5.1, width: 24.0, height: 23.1 },
        description: '16-person executive boardroom with dual 4K video conferencing.',
        accessible: true,
      },
      {
        id: 'poi-eng-pod',
        name: 'Engineering Pod A',
        roomNumber: 'Room 201 · Team Lab',
        category: 'office',
        coords: { x: 26.0, y: 16.7 },
        bounds: { x: 5.3, y: 5.1, width: 41.3, height: 23.1 },
        description: '24 sit-stand desks, hardware test rigs, whiteboard walls.',
        accessible: true,
      },
      {
        id: 'poi-board-meeting',
        name: 'Board Meeting Pod',
        roomNumber: 'Room 210 · Conference',
        category: 'conference',
        coords: { x: 62.7, y: 22.0 },
        bounds: { x: 50.7, y: 5.1, width: 24.0, height: 23.1 },
        description: 'Private 8-seat executive breakout meeting room.',
        accessible: true,
      },
      {
        id: 'poi-breakout-lounge',
        name: 'Breakout Lounge',
        roomNumber: 'Room 214 · Lounge',
        category: 'office',
        coords: { x: 37.3, y: 40.0 },
        bounds: { x: 27.3, y: 32.1, width: 19.3, height: 16.7 },
        description: 'Casual soft-seating collaboration area with coffee bar.',
        accessible: true,
      },
      {
        id: 'poi-restrooms-n',
        name: 'North Restrooms',
        roomNumber: 'W-203 · Restroom',
        category: 'restroom',
        coords: { x: 86.0, y: 16.7 },
        bounds: { x: 77.3, y: 5.1, width: 17.3, height: 23.1 },
        description: 'ADA compliant, all-gender stalls, baby changing station.',
        accessible: true,
      },
      {
        id: 'poi-focus-booths',
        name: 'Focus Pods',
        roomNumber: 'Pods 204 · Quiet Booths',
        category: 'office',
        coords: { x: 15.0, y: 40.0 },
        bounds: { x: 5.3, y: 32.1, width: 19.3, height: 16.7 },
        description: 'Acoustically isolated single-occupancy video phone booths.',
        accessible: true,
      },
      {
        id: 'poi-ux-studio',
        name: 'UX Studio',
        roomNumber: 'Room 205 · Design Lab',
        category: 'office',
        coords: { x: 37.0, y: 40.0 },
        bounds: { x: 27.3, y: 32.1, width: 19.3, height: 16.7 },
        description: 'User research testing lab and design sprint war room.',
        accessible: true,
      },
      {
        id: 'poi-server',
        name: 'Server',
        roomNumber: 'Room 206 · IT Hub',
        category: 'utility',
        coords: { x: 57.7, y: 40.0 },
        bounds: { x: 50.7, y: 32.1, width: 14.0, height: 16.7 },
        description: 'Network racks, on-site IT helpdesk, security hardware.',
        accessible: false,
      },
      {
        id: 'poi-elevators',
        name: 'Lifts',
        roomNumber: 'Elevators 1-3 & Stairs',
        category: 'elevator',
        coords: { x: 74.3, y: 40.0 },
        bounds: { x: 67.3, y: 32.1, width: 14.0, height: 16.7 },
        description: 'High-speed passenger elevators connecting all levels and stairs.',
        accessible: true,
      },
      {
        id: 'poi-kitchen',
        name: 'Bistro Kitchen',
        roomNumber: 'Room 208 · Dining',
        category: 'dining',
        coords: { x: 26.0, y: 64.0 },
        bounds: { x: 5.3, y: 52.6, width: 41.3, height: 21.8 },
        description: 'Coffee Bar, snacks, cold brew taps, dining tables.',
        accessible: true,
      },
      {
        id: 'poi-training',
        name: 'Training',
        roomNumber: 'Room 212 · Workshop',
        category: 'office',
        coords: { x: 72.0, y: 64.0 },
        bounds: { x: 50.7, y: 52.6, width: 44.0, height: 21.8 },
        description: 'Large flexible workshop room with East emergency exit access.',
        accessible: true,
      },
    ],
    hallways: [
      { id: 'h-lobby-door', coords: { x: 50, y: 78 }, connectedTo: ['poi-reception', 'h-central-s'] },
      { id: 'h-central-s', coords: { x: 50, y: 64 }, connectedTo: ['h-lobby-door', 'h-central-mid', 'poi-kitchen', 'poi-training'] },
      { id: 'h-central-mid', coords: { x: 50, y: 40 }, connectedTo: ['h-central-s', 'h-central-n', 'poi-ux-studio', 'poi-server'] },
      { id: 'h-central-n', coords: { x: 50, y: 28 }, connectedTo: ['h-central-mid', 'h-turn-boardroom', 'h-cross-west'] },
      { id: 'h-cross-west', coords: { x: 26, y: 28 }, connectedTo: ['h-central-n', 'poi-eng-pod', 'poi-focus-booths'] },
      { id: 'h-turn-boardroom', coords: { x: 62.7, y: 28 }, connectedTo: ['h-central-n', 'poi-boardroom', 'poi-board-meeting', 'h-cross-east'] },
      { id: 'h-cross-east', coords: { x: 86.0, y: 28 }, connectedTo: ['h-turn-boardroom', 'poi-restrooms-n', 'poi-elevators'] },
    ],
  },
  {
    id: 'sample-hospital-1',
    title: 'Mercy Medical Pavilion',
    buildingType: 'Floor 1 · Regional Hospital & Care Center',
    summary: 'Full-service medical center with emergency triage, radiology imaging, outpatient pharmacy, specimen lab, pediatric clinic, and elevators.',
    scaleNote: 'Scale: 1% width ≈ 0.8 meters (total 80m x 55m)',
    imageUrl: hospitalSvg,
    source: 'sample',
    defaultStartId: 'poi-hosp-main',
    rooms: [
      {
        id: 'poi-hosp-main',
        name: 'Main Admission Lobby',
        roomNumber: 'Pavilion Lobby',
        category: 'entrance',
        coords: { x: 50, y: 86.5 },
        bounds: { x: 31.3, y: 78.2, width: 37.3, height: 15.4 },
        description: 'Information desk, wheelchair loan depot, inpatient registration.',
        accessible: true,
      },
      {
        id: 'poi-hosp-er',
        name: 'Emergency & Triage',
        roomNumber: 'Trauma Wing',
        category: 'medical',
        coords: { x: 72.0, y: 16.7 },
        bounds: { x: 50.7, y: 5.1, width: 44.0, height: 23.1 },
        description: '24/7 urgent trauma care, fast-track triage, resuscitation bays.',
        accessible: true,
      },
      {
        id: 'poi-hosp-rad',
        name: 'Diagnostic Imaging & MRI',
        roomNumber: 'Suite 110',
        category: 'medical',
        coords: { x: 26.0, y: 16.7 },
        bounds: { x: 5.3, y: 5.1, width: 41.3, height: 23.1 },
        description: 'High-field MRI scanner, CT scan, digital X-Ray.',
        accessible: true,
      },
      {
        id: 'poi-hosp-pharm',
        name: 'Pharmacy',
        roomNumber: 'Rx Center',
        category: 'store',
        coords: { x: 15.0, y: 40.0 },
        bounds: { x: 5.3, y: 32.1, width: 19.3, height: 16.7 },
        description: 'Prescription dispensing, clinical pharmacist consultation.',
        accessible: true,
      },
      {
        id: 'poi-hosp-lab',
        name: 'Specimen Lab',
        roomNumber: 'Lab 105',
        category: 'medical',
        coords: { x: 37.0, y: 40.0 },
        bounds: { x: 27.3, y: 32.1, width: 19.3, height: 16.7 },
        description: 'Blood draw, pathology intake, rapid diagnostic tests.',
        accessible: true,
      },
      {
        id: 'poi-hosp-elev',
        name: 'Lifts',
        roomNumber: 'Tower Core',
        category: 'elevator',
        coords: { x: 57.7, y: 40.0 },
        bounds: { x: 50.7, y: 32.1, width: 14.0, height: 16.7 },
        description: 'Bed-sized elevators to upper surgical towers.',
        accessible: true,
      },
      {
        id: 'poi-hosp-ped',
        name: 'Pediatric Clinic',
        roomNumber: 'Clinic 120',
        category: 'medical',
        coords: { x: 74.3, y: 40.0 },
        bounds: { x: 67.3, y: 32.1, width: 27.3, height: 16.7 },
        description: 'Child-friendly examination rooms and pediatric triage.',
        accessible: true,
      },
      {
        id: 'poi-hosp-cafe',
        name: 'Wellness Cafeteria',
        roomNumber: 'Garden Bistro',
        category: 'dining',
        coords: { x: 26.0, y: 64.0 },
        bounds: { x: 5.3, y: 52.6, width: 41.3, height: 21.8 },
        description: 'Hot entrees, vegetarian salad bar, outdoor healing terrace.',
        accessible: true,
      },
    ],
    hallways: [
      { id: 'hh-admit', coords: { x: 50, y: 78 }, connectedTo: ['poi-hosp-main', 'hh-cross-s'] },
      { id: 'hh-cross-s', coords: { x: 50, y: 64 }, connectedTo: ['hh-admit', 'hh-spine-mid', 'poi-hosp-cafe'] },
      { id: 'hh-spine-mid', coords: { x: 50, y: 40 }, connectedTo: ['hh-cross-s', 'hh-spine-n', 'poi-hosp-pharm', 'poi-hosp-lab', 'poi-hosp-elev', 'poi-hosp-ped'] },
      { id: 'hh-spine-n', coords: { x: 50, y: 28 }, connectedTo: ['hh-spine-mid', 'poi-hosp-rad', 'poi-hosp-er'] },
    ],
  },
  {
    id: 'sample-airport-1',
    title: 'Skyline Terminal B',
    buildingType: 'Concourse B · International Departures',
    summary: 'Linear airport concourse with central security checkpoint, moving walkways, airline lounge, gates B1-B6, duty free shopping, and dining.',
    scaleNote: 'Scale: 1% width ≈ 1.5 meters (total 150m x 80m)',
    imageUrl: airportSvg,
    source: 'sample',
    defaultStartId: 'poi-air-tsa',
    rooms: [
      {
        id: 'poi-air-tsa',
        name: 'Security & Check-in',
        roomNumber: 'TSA Security',
        category: 'entrance',
        coords: { x: 50, y: 86.5 },
        bounds: { x: 31.3, y: 78.2, width: 37.3, height: 15.4 },
        description: 'Automated screening lanes, verified traveler entry.',
        accessible: true,
      },
      {
        id: 'poi-air-b1b3',
        name: 'Gates B1 · B3',
        roomNumber: 'Gate B1-B3',
        category: 'gate',
        coords: { x: 26.0, y: 16.7 },
        bounds: { x: 5.3, y: 5.1, width: 41.3, height: 23.1 },
        description: 'Priority boarding lanes, power outlets at all seats.',
        accessible: true,
      },
      {
        id: 'poi-air-lounge',
        name: 'Skyline Club',
        roomNumber: 'VIP Lounge',
        category: 'dining',
        coords: { x: 62.7, y: 16.7 },
        bounds: { x: 50.7, y: 5.1, width: 24.0, height: 23.1 },
        description: 'Quiet work pods, premium buffet, complimentary beverages.',
        accessible: true,
      },
      {
        id: 'poi-air-wc',
        name: 'WC',
        roomNumber: 'Restrooms',
        category: 'restroom',
        coords: { x: 86.0, y: 16.7 },
        bounds: { x: 77.3, y: 5.1, width: 17.3, height: 23.1 },
        description: 'All-gender and ADA accessible family restrooms.',
        accessible: true,
      },
      {
        id: 'poi-air-coffee',
        name: 'Espresso Bar',
        roomNumber: 'Cafe',
        category: 'dining',
        coords: { x: 15.0, y: 40.0 },
        bounds: { x: 5.3, y: 32.1, width: 19.3, height: 16.7 },
        description: 'Artisan espresso, pastries, grab & go sandwiches.',
        accessible: true,
      },
      {
        id: 'poi-air-dutyfree',
        name: 'Duty Free',
        roomNumber: 'Shops B',
        category: 'store',
        coords: { x: 37.0, y: 40.0 },
        bounds: { x: 27.3, y: 32.1, width: 19.3, height: 16.7 },
        description: 'Cosmetics, electronics, travel accessories.',
        accessible: true,
      },
      {
        id: 'poi-air-b2b6',
        name: 'Gates B2 · B4 · B6',
        roomNumber: 'Gate B2-B6',
        category: 'gate',
        coords: { x: 72.0, y: 64.0 },
        bounds: { x: 50.7, y: 52.6, width: 44.0, height: 21.8 },
        description: 'International widebody aircraft departure gates.',
        accessible: true,
      },
      {
        id: 'poi-air-dining',
        name: 'Bistro & Dining',
        roomNumber: 'Food Court',
        category: 'dining',
        coords: { x: 26.0, y: 64.0 },
        bounds: { x: 5.3, y: 52.6, width: 41.3, height: 21.8 },
        description: 'Full food court with diverse dining options.',
        accessible: true,
      },
    ],
    hallways: [
      { id: 'ah-tsa', coords: { x: 50, y: 78 }, connectedTo: ['poi-air-tsa', 'ah-mid-s'] },
      { id: 'ah-mid-s', coords: { x: 50, y: 64 }, connectedTo: ['ah-tsa', 'ah-mid-c', 'poi-air-dining', 'poi-air-b2b6'] },
      { id: 'ah-mid-c', coords: { x: 50, y: 40 }, connectedTo: ['ah-mid-s', 'ah-mid-n', 'poi-air-coffee', 'poi-air-dutyfree'] },
      { id: 'ah-mid-n', coords: { x: 50, y: 28 }, connectedTo: ['ah-mid-c', 'poi-air-b1b3', 'poi-air-lounge', 'poi-air-wc'] },
    ],
  },
];
