import { FloorPlanData } from '../types/navigation';
import { E5_FLOORS } from './e5/e5DataLoader';

/**
 * Buildings the app starts with. Only Engineering 5 (E5): real floor plans,
 * traced maps and verified room data. Buildings added with Scan or Upload are added at run time.
 */
export const SAMPLE_FLOOR_PLANS: FloorPlanData[] = [...E5_FLOORS];
