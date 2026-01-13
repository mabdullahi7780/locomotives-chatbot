/**
 * adapterTypes.ts
 * 
 * Generic adapter interface for dashboard services.
 * The chatbot thinks in adapter terms (portable), but resolves to specific service functions.
 * 
 * This file defines:
 * 1. Generic adapter method names (from ADAPTER_SPEC.md)
 * 2. Mapping structure to translate adapter → service-specific functions
 * 3. Types for adapter results
 */

// ============================================================================
// ADAPTER METHOD NAMES (from ADAPTER_SPEC.md §6)
// ============================================================================

export const ADAPTER_METHODS = [
  // Dashboard overview
  "getDashboardSnapshot",
  
  // List operations
  "listLocomotives",
  "getLocomotive",
  "listInspectionTestCodes",
  
  // Count operations
  "getLocomotiveCount",
  "getOutOfServiceCount",
  "getNonCompliantCount",
  "getInspectionsCompletedTodayCount",
  "getDailyInspectionDueTodayCount",
  
  // Per-locomotive inspection queries
  "getLastInspectionByLocomotive",
  "getNextDueInspectionByLocomotive",
  "getNextDueInspection",
  
  // Credit queries
  "getOutOfUseCredit",
  
  // Single-loco specific queries (NEW - more focused)
  "getLocoLastInspectionDate",
  "getLocoLastInspectionInspector",
  "getLocoOutOfUseStatus",
  "getLocoEngineHours",
  "getLocoMuId",
] as const;

export type AdapterMethod = (typeof ADAPTER_METHODS)[number];

// ============================================================================
// ADAPTER INTENT DEFINITIONS
// ============================================================================

export interface AdapterIntentDefinition {
  /** Unique identifier for this adapter intent */
  id: string;
  
  /** Human-readable description (service-agnostic) */
  description: string;
  
  /** The adapter method name (from ADAPTER_SPEC.md) */
  adapterMethod: AdapterMethod;
  
  /** Whether this intent requires a locomotive reference */
  requiresLocoRef: boolean;
  
  /** Canonical example phrases for BM25 matching */
  canonicalExamples: string[];
  
  /** Tags for additional matching */
  tags: string[];
  
  /** Follow-up question if loco ref is missing */
  followUpQuestion?: string;
}

// ============================================================================
// SERVICE MAPPING TYPES
// ============================================================================

export interface ServiceFunctionMapping {
  /** The actual service function name to call */
  functionName: string;
  
  /** Arguments template (use placeholders like "$assetId") */
  argsTemplate: Record<string, unknown>;
  
  /** Fields to read from the response */
  readTheseFields: string[];
  
  /** Human-readable description of what this function does */
  description: string;
}

export interface AdapterToServiceMapping {
  /** Adapter method name */
  adapterMethod: AdapterMethod;
  
  /** Service-specific function mapping */
  serviceMapping: ServiceFunctionMapping;
  
  /** Alternative mappings (some adapter methods can map to multiple service functions) */
  alternatives?: ServiceFunctionMapping[];
}

// ============================================================================
// ADAPTER CONFIGURATION
// ============================================================================

export interface DashboardAdapterConfig {
  /** Name of the dashboard service (e.g., "LiteDashboardService") */
  serviceName: string;
  
  /** Version of the adapter mapping */
  version: string;
  
  /** All adapter-to-service mappings */
  mappings: AdapterToServiceMapping[];
  
  /** Intent definitions using adapter terminology */
  intents: AdapterIntentDefinition[];
}

// ============================================================================
// RESOLVED CALL RESULT
// ============================================================================

export interface ResolvedServiceCall {
  /** The adapter method that was matched */
  adapterMethod: AdapterMethod;
  
  /** The actual service function name */
  functionName: string;
  
  /** Resolved arguments (placeholders replaced with actual values) */
  args: Record<string, unknown>;
  
  /** Fields to read from the response */
  readTheseFields: string[];
  
  /** Human-readable reply text mentioning the actual function */
  replyText: string;
}

// ============================================================================
// ADAPTER INTERFACE
// ============================================================================

export interface IDashboardAdapter {
  /** Get the service name */
  getServiceName(): string;
  
  /** Get all adapter intents */
  getIntents(): AdapterIntentDefinition[];
  
  /** Resolve an adapter method to a service-specific call */
  resolveCall(
    adapterMethod: AdapterMethod,
    params: { assetId?: string; locoNo?: string; filters?: Record<string, unknown> }
  ): ResolvedServiceCall | null;
  
  /** Get the mapping for an adapter method */
  getMapping(adapterMethod: AdapterMethod): AdapterToServiceMapping | undefined;
  
  /** Generate reply text for a resolved call */
  generateReplyText(
    adapterMethod: AdapterMethod,
    functionName: string,
    locoNo?: string,
    assetId?: string,
    readTheseFields?: string[]
  ): string;
}
