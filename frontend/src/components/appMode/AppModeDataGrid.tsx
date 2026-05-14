import type { ReactNode } from 'react';
import type { CategorizedFields } from '../../utils/fieldCategorization';
import { DataCell } from './DataCell';
import { DataField } from './DataField';
import { IncidentMap } from './IncidentMap';

interface Props {
  categorized: CategorizedFields;
  claimType: string | null;
  location: string | null;
}

const ICON_POLICY: ReactNode = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h6" /></svg>;
const ICON_DATE: ReactNode = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>;
const ICON_CONTACT: ReactNode = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
const ICON_VEHICLE: ReactNode = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14v-5l-2-5H7L5 12v5z" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></svg>;
const ICON_DETAILS: ReactNode = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 13h6M9 17h4" /></svg>;
const ICON_LOCATION: ReactNode = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>;

export function AppModeDataGrid({ categorized, claimType, location }: Props) {
  const showPolicy = categorized.policyFields.length > 0 || claimType;
  const showLocation = categorized.locationFields.length > 0 && location;

  return (
    <div className="app-mode__data-grid">
      {showPolicy && (
        <DataCell title="Policy Info" icon={ICON_POLICY}>
          {claimType && <div className="data-cell__chip">{claimType} claim</div>}
          {categorized.policyFields.map((f) => <DataField key={f.id} field={f} />)}
        </DataCell>
      )}

      {categorized.dateFields.length > 0 && (
        <DataCell title="Incident Date" icon={ICON_DATE}>
          {categorized.dateFields.map((f) => (
            <div key={f.id} className="data-cell__date-display">
              <span className="data-cell__date-value">{f.value}</span>
            </div>
          ))}
        </DataCell>
      )}

      {categorized.contactFields.length > 0 && (
        <DataCell title="Contact" icon={ICON_CONTACT}>
          {categorized.contactFields.map((f) => <DataField key={f.id} field={f} />)}
        </DataCell>
      )}

      {categorized.vehicleFields.length > 0 && (
        <DataCell title="Vehicle" icon={ICON_VEHICLE}>
          {categorized.vehicleFields.map((f) => <DataField key={f.id} field={f} />)}
        </DataCell>
      )}

      {categorized.descriptionFields.length > 0 && (
        <DataCell title="Details" icon={ICON_DETAILS}>
          {categorized.descriptionFields.map((f) => <DataField key={f.id} field={f} multiline />)}
        </DataCell>
      )}

      {showLocation && (
        <DataCell title="Location" icon={ICON_LOCATION} className="data-cell--wide">
          <div className="data-cell__location-value">{location}</div>
          <div className="data-cell__map-wrap">
            <IncidentMap location={location} />
          </div>
        </DataCell>
      )}
    </div>
  );
}
