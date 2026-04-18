export interface Entry {
  id: string;
  name?: string;
  regret: string;
  proud: string;
  dream: string;
  contentHash: string;
}

export interface EmpathRead {
  emotionalCore: string;
  tension: string;
  throughline: string;
}

export interface PoetDraft {
  poeticLine: string;
  alternates: string[];
}

export interface ArtistDraft {
  symbols: string[];
  composition: string;
  palette: string[];
  motion: string;
}

export interface PhilosopherGuidance {
  fractureLocation: string;
  goldTreatment: string;
  whatIsHonored: string;
}

export interface CouncilWhispers {
  empath: string;
  poet: string;
  artist: string;
  philosopher: string;
  curator: string;
}

export interface CuratorOutput {
  svg: string;
  palette: string[];
  poeticLine: string;
  themes: string[];
  councilWhispers: CouncilWhispers;
}

export interface Tile {
  id: string;
  name?: string;
  regret: string;
  proud: string;
  dream: string;
  contentHash: string;
  palette: string[];
  poeticLine: string;
  themes: string[];
  councilWhispers: CouncilWhispers;
  svgPath: string;
  createdAt: string;
}

export interface Deliberation {
  tileId: string;
  entry: Entry;
  empath: EmpathRead;
  poet: PoetDraft;
  artist: ArtistDraft;
  philosopher: PhilosopherGuidance;
  curator: CuratorOutput;
  timingMs: {
    empath: number;
    advisors: number;
    curator: number;
    total: number;
  };
}

export interface Connection {
  tileA: string;
  tileB: string;
  line: string;
  reasoning: string;
}

export interface ConnectionCandidate extends Connection {
  survived: boolean;
  critique?: string;
}
