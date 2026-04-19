/**
 * Quick-start catalog shown to users who haven't added any maintenance
 * items yet. Keeping these in a separate file so interval defaults can be
 * tuned without touching the page component.
 */

export interface MaintenanceSeed {
  title: string;
  intervalDays: number;
  intervalLabel: string; // human-readable
  hint?: string;         // small helper text shown under the name
}

export const MAINTENANCE_SEEDS: MaintenanceSeed[] = [
  {
    title: 'Fridge water filter',
    intervalDays: 180,
    intervalLabel: 'Every 6 months',
    hint: 'Typical manufacturer recommendation',
  },
  {
    title: 'Fridge ice filter',
    intervalDays: 180,
    intervalLabel: 'Every 6 months',
    hint: 'Only if your fridge has a separate ice filter',
  },
  {
    title: 'Whole house water filter',
    intervalDays: 180,
    intervalLabel: 'Every 6 months',
  },
  {
    title: 'AC filter',
    intervalDays: 90,
    intervalLabel: 'Every 3 months',
    hint: 'Bump to 30 days for households with pets',
  },
  {
    title: 'Grass cutting',
    intervalDays: 14,
    intervalLabel: 'Every 2 weeks',
    hint: 'During the mowing season',
  },
  {
    title: 'Car maintenance',
    intervalDays: 180,
    intervalLabel: 'Every 6 months',
    hint: 'Covers oil + tire rotation; split into separate items later if you want',
  },
];
