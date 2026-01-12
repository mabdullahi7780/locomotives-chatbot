export type Confidence = "low" | "medium" | "high";
export type RawMatchKind = "assetId" | "locoNo" | "name";
export interface RawMatch {
    kind: RawMatchKind;
    text: string;
    start: number;
    end: number;
}
export interface LocoQuery {
    input: string;
    assetIds: string[];
    locoNos: string[];
    names: string[];
    assetId?: string;
    locoNo?: string;
    name?: string;
    rawMatches: RawMatch[];
    confidence: Confidence;
}
export declare function extractLocoQuery(input: string): LocoQuery;
