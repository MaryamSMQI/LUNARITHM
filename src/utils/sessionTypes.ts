import {
  MissingDataPolicy,
  MissionConstraints,
  MissionPriorities,
  RankingBasis,
} from '../types/lunar';

export const USER_ROLES = [
  'University student',
  'University researcher / educator',
  'Space company / lander company',
  'Space agency',
  'Other',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfileSession {
  name: string;
  email: string;
  role: UserRole;
  organization: string;
}

export interface SavedAnalysisRecord {
  id: string;
  title: string;
  missionProfileId: string;
  missionProfileName: string;
  winningSiteId: string | null;
  winningSiteName: string;
  selectedSiteId: string;
  landingIsoLocal: string;
  windowHours: number;
  priorities: MissionPriorities;
  constraints: MissionConstraints;
  rankingBasis: RankingBasis;
  missingDataPolicy: MissingDataPolicy;
  relayBoostPct: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export function buildShareStateHashUrl(state: {
  landingIsoLocal: string;
  windowHours: number;
  priorities: MissionPriorities;
  constraints: MissionConstraints;
}): string {
  const json = JSON.stringify(state);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const baseHref = window.location.href.split('#')[0];
  return `${baseHref}#/?state=${encoded}`;
}
