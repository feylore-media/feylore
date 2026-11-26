export interface WikidataEntity {
  id: string;
  type?: string;
  labels?: Record<string, { language: string; value: string }>;
  descriptions?: Record<string, { language: string; value: string }>;
  aliases?: Record<string, Array<{ language: string; value: string }>>;
  sitelinks?: Record<string, { site: string; title: string }>;
  claims?: Record<string, WikidataStatement[]>;
}

export interface WikidataStatement {
  mainsnak: { snaktype: string; property?: string; datavalue?: WikidataDatavalue };
  rank?: string;
}

export interface WikidataDatavalue {
  type?: string;
  value:
    | { "entity-type"?: string; id?: string }
    | { time?: string; precision?: number }
    | string
    | number;
}

export interface WikidataEntityResponse {
  entities?: Record<string, WikidataEntity>;
  success?: number;
}

export interface WikidataSearchItem {
  id: string;
  label?: string;
  description?: string;
  match?: { type?: string; text?: string };
}

export interface WikidataSearchResponse {
  search?: WikidataSearchItem[];
}