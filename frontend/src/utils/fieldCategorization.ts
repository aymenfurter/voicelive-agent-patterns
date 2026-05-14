import type { FieldState } from '../types';

const DATE_PATTERNS = ['date', 'when', 'time_of'];
const CONTACT_PATTERNS = ['phone', 'name', 'claimant', 'contact', 'email'];
const VEHICLE_PATTERNS = ['vehicle', 'car', 'make', 'model'];
const LOCATION_PATTERNS = ['location', 'address', 'where', 'city', 'intersection'];
const POLICY_PATTERNS = ['policy', 'claim_type'];

function matchesAny(id: string, patterns: string[]): boolean {
  const lower = id.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

export interface CategorizedFields {
  dateFields: FieldState[];
  contactFields: FieldState[];
  vehicleFields: FieldState[];
  locationFields: FieldState[];
  policyFields: FieldState[];
  descriptionFields: FieldState[];
}

export function categorizeFields(fields: FieldState[]): CategorizedFields {
  const answered = fields.filter((f) => f.value);
  const out: CategorizedFields = {
    dateFields: [], contactFields: [], vehicleFields: [],
    locationFields: [], policyFields: [], descriptionFields: [],
  };

  for (const f of answered) {
    if (matchesAny(f.id, DATE_PATTERNS)) out.dateFields.push(f);
    else if (matchesAny(f.id, CONTACT_PATTERNS)) out.contactFields.push(f);
    else if (matchesAny(f.id, VEHICLE_PATTERNS)) out.vehicleFields.push(f);
    else if (matchesAny(f.id, LOCATION_PATTERNS)) out.locationFields.push(f);
    else if (matchesAny(f.id, POLICY_PATTERNS)) out.policyFields.push(f);
    else out.descriptionFields.push(f);
  }

  return out;
}
