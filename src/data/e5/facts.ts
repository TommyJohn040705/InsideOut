/**
 * Verified Engineering 5 facts from official University of Waterloo pages.
 * Only what the sources state. Used by the offline assistant and sent to the AI assistant as ground truth.
 */
export interface BuildingFact {
  id: string;
  text: string;
  floor?: number;
  sourceTitle: string;
  sourceUrl: string;
  /** set when sources disagree */
  conflict?: string;
}

const ACCESS = 'https://uwaterloo.ca/accessibility/getting-around/building-accessibility/engineering-5-e5';
const SDC = 'https://uwaterloo.ca/sedra-student-design-centre/facilities';

export const E5_FACTS: BuildingFact[] = [
  { id: 'food-none-inside', text: 'There is no cafe or food outlet listed inside E5.', sourceTitle: 'UW Accessibility: Engineering 5', sourceUrl: ACCESS },
  { id: 'vending-6', text: 'Vending machines are on the sixth floor of E5.', floor: 6, sourceTitle: 'UW Accessibility: Engineering 5', sourceUrl: ACCESS },
  { id: 'plaza-food', text: 'E5 is next to University Plaza, which has several food options.', sourceTitle: 'UW Accessibility: Engineering 5', sourceUrl: ACCESS },
  { id: 'main-entrance', text: 'The main entrance faces Davis Centre (DC), is ramped, and opens onto the second floor.', floor: 2, sourceTitle: 'UW Accessibility: Engineering 5', sourceUrl: ACCESS },
  { id: 'elevators-se', text: 'Elevators are on the southeast side of every floor.', sourceTitle: 'UW Accessibility: Engineering 5', sourceUrl: ACCESS },
  { id: 'washrooms-se', text: 'Every floor has a washroom with an accessible stall on the southeast side.', sourceTitle: 'UW Accessibility: Engineering 5', sourceUrl: ACCESS },
  {
    id: 'e3-overpass', text: 'There is an overpass to Engineering 3 (E3).', sourceTitle: 'UW Accessibility: Engineering 5', sourceUrl: ACCESS,
    conflict: 'The official page lists the E3 overpass on the third floor in one section and the fifth floor in another. Check on site before relying on it.',
  },
  { id: 'esms', text: 'The Engineering Student Machine Shop is in E5 1101.', floor: 1, sourceTitle: 'Sedra Student Design Centre: Facilities', sourceUrl: SDC },
  { id: 'rpc', text: 'The Rapid Prototyping Centre (3D printing and laser cutting) is in E5 2002.', floor: 2, sourceTitle: 'Sedra Student Design Centre: Facilities', sourceUrl: SDC },
  { id: 'sdc-rooms', text: 'The Sedra Student Design Centre has a 60-seat classroom (E5 2004) and a 12-seat conference room (E5 2103).', floor: 2, sourceTitle: 'Sedra Student Design Centre: Facilities', sourceUrl: SDC },
  { id: 'sdc-workbays', text: 'The Sedra Student Design Centre has eleven work bays on the first and second floors.', sourceTitle: 'Sedra Student Design Centre: Facilities', sourceUrl: SDC },
];

export const factText = (f: BuildingFact) => (f.conflict ? `${f.text} (${f.conflict})` : f.text);
