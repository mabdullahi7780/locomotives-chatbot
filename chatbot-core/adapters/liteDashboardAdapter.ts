/**
 * liteDashboardAdapter.ts
 * 
 * Maps adapter methods to LiteDashboardService functions.
 */

console.log("✅ liteDashboardAdapter.ts LOADED - version 2.0");

import type {
  AdapterMethod,
  AdapterIntentDefinition,
  AdapterToServiceMapping,
  DashboardAdapterConfig,
  IDashboardAdapter,
  ResolvedServiceCall,
} from "./adapterTypes";

// ============================================================================
// LITE DASHBOARD ADAPTER CONFIGURATION
// ============================================================================

const LITE_DASHBOARD_CONFIG: DashboardAdapterConfig = {
  serviceName: "LiteDashboardService",
  version: "1.0.0",
  
  mappings: [
    {
      adapterMethod: "getDashboardSnapshot",
      serviceMapping: {
        functionName: "getDashBoardData",
        argsTemplate: {},
        readTheseFields: ["value.summary"],
        description: "Fetch the dashboard summary KPIs",
      },
    },
    {
      adapterMethod: "listLocomotives",
      serviceMapping: {
        functionName: "getAllLocomotives",
        argsTemplate: {},
        readTheseFields: ["$"],
        description: "List all locomotives",
      },
    },
    {
      adapterMethod: "getLocomotive",
      serviceMapping: {
        functionName: "getDashBoardData",
        argsTemplate: {},
        readTheseFields: ["value.assetData.<assetId>"],
        description: "Find a locomotive by assetId",
      },
    },
    {
      adapterMethod: "listInspectionTestCodes",
      serviceMapping: {
        functionName: "getAllTestCodes",
        argsTemplate: {},
        readTheseFields: ["$"],
        description: "Get all enabled inspection test codes",
      },
    },
    {
      adapterMethod: "getLocomotiveCount",
      serviceMapping: {
        functionName: "getAllLocomotivesCount",
        argsTemplate: {},
        readTheseFields: ["$"],
        description: "Get total count of locomotives",
      },
    },
    {
      adapterMethod: "getOutOfServiceCount",
      serviceMapping: {
        functionName: "getAllOutOfServiceLocomotivesCount",
        argsTemplate: {},
        readTheseFields: ["$"],
        description: "Get count of out-of-service locomotives",
      },
    },
    {
      adapterMethod: "getNonCompliantCount",
      serviceMapping: {
        functionName: "getAllNonCompliantLocomotives",
        argsTemplate: {},
        readTheseFields: ["$"],
        description: "Get count of non-compliant locomotives",
      },
    },
    {
      adapterMethod: "getInspectionsCompletedTodayCount",
      serviceMapping: {
        functionName: "getAllInspectionsCompletedTodayCount",
        argsTemplate: {},
        readTheseFields: ["$"],
        description: "Get count of inspections completed today",
      },
    },
    {
      adapterMethod: "getDailyInspectionDueTodayCount",
      serviceMapping: {
        functionName: "getAllDailyInspectionLocomotivesCount",
        argsTemplate: {},
        readTheseFields: ["$"],
        description: "Get count of locomotives due for daily inspection today",
      },
    },
    {
      adapterMethod: "getLastInspectionByLocomotive",
      serviceMapping: {
        functionName: "getAllLocomotiveLastInspectionDate",
        argsTemplate: {},
        readTheseFields: ["<assetId>.date"],
        description: "Get last inspection dates for all locomotives",
      },
    },
    {
      adapterMethod: "getNextDueInspectionByLocomotive",
      serviceMapping: {
        functionName: "getAllLocomotiveDueInspectionDate",
        argsTemplate: {},
        readTheseFields: ["<assetId>.nextExpiryDate"],
        description: "Get next due inspection dates for all locomotives",
      },
    },
    {
      adapterMethod: "getNextDueInspection",
      serviceMapping: {
        functionName: "getLocoNextDueLocoInspection",
        argsTemplate: { assetId: "$assetId" },
        readTheseFields: ["nextExpiryDate"],
        description: "Get next due inspection for a specific locomotive",
      },
    },
    {
      adapterMethod: "getOutOfUseCredit",
      serviceMapping: {
        functionName: "getLocoOutOfUseCredit",
        argsTemplate: { assetId: "$assetId" },
        readTheseFields: ["credit"],
        description: "Get out-of-use credit for a specific locomotive",
      },
    },
    // Single-loco specific queries
    {
      adapterMethod: "getLocoLastInspectionDate",
      serviceMapping: {
        functionName: "getDashBoardData",
        argsTemplate: {},
        readTheseFields: ["value.assetData.<assetId>.LastInspec.date"],
        description: "Get last inspection date for a specific locomotive",
      },
    },
    {
      adapterMethod: "getLocoLastInspectionInspector",
      serviceMapping: {
        functionName: "getDashBoardData",
        argsTemplate: {},
        readTheseFields: ["value.assetData.<assetId>.LastInspec.user.name"],
        description: "Get inspector name for last inspection",
      },
    },
    {
      adapterMethod: "getLocoOutOfUseStatus",
      serviceMapping: {
        functionName: "getDashBoardData",
        argsTemplate: {},
        readTheseFields: ["value.assetData.<assetId>.assetStates.outOfUse"],
        description: "Check if locomotive is out of use",
      },
    },
    {
      adapterMethod: "getLocoEngineHours",
      serviceMapping: {
        functionName: "getDashBoardData",
        argsTemplate: {},
        readTheseFields: ["value.assetData.<assetId>.assetStates.engineHour"],
        description: "Get engine hours for a locomotive",
      },
    },
    {
      adapterMethod: "getLocoMuId",
      serviceMapping: {
        functionName: "getDashBoardData",
        argsTemplate: {},
        readTheseFields: ["value.assetData.<assetId>.muId"],
        description: "Get MU ID for a locomotive",
      },
    },
  ],

  intents: [
    {
      id: "ADAPTER_DASHBOARD_OVERVIEW",
      description: "Fetch the dashboard summary KPIs",
      adapterMethod: "getDashboardSnapshot",
      requiresLocoRef: false,
      canonicalExamples: ["show me the dashboard", "give me an overview", "dashboard summary"],
      tags: ["dashboard", "overview", "summary"],
    },
    {
      id: "ADAPTER_FLEET_SIZE",
      description: "Get total count of locomotives",
      adapterMethod: "getLocomotiveCount",
      requiresLocoRef: false,
      canonicalExamples: ["how many locomotives are there", "total locomotives", "fleet size"],
      tags: ["count", "total", "fleet"],
    },
    {
      id: "ADAPTER_OUT_OF_SERVICE_COUNT",
      description: "Get count of out-of-service locomotives",
      adapterMethod: "getOutOfServiceCount",
      requiresLocoRef: false,
      canonicalExamples: ["how many locomotives are out of service", "out of service count"],
      tags: ["oos", "out-of-service", "count"],
    },
    {
      id: "ADAPTER_NON_COMPLIANT_COUNT",
      description: "Get count of non-compliant locomotives",
      adapterMethod: "getNonCompliantCount",
      requiresLocoRef: false,
      canonicalExamples: ["how many are non compliant", "non compliant count"],
      tags: ["non-compliant", "compliance", "count"],
    },
    {
      id: "ADAPTER_LOCO_LAST_INSPECTION_DATE",
      description: "Get when a locomotive was last inspected",
      adapterMethod: "getLocoLastInspectionDate",
      requiresLocoRef: true,
      canonicalExamples: ["when was the last inspection", "last inspection date", "when was locomotive last inspected"],
      tags: ["inspection", "last", "date", "when"],
      followUpQuestion: "Which locomotive's last inspection date would you like to see?",
    },
    {
      id: "ADAPTER_LOCO_LAST_INSPECTION_INSPECTOR",
      description: "Get who performed the last inspection",
      adapterMethod: "getLocoLastInspectionInspector",
      requiresLocoRef: true,
      canonicalExamples: ["who did the last inspection", "who performed the inspection", "inspector name"],
      tags: ["inspection", "inspector", "who", "name"],
      followUpQuestion: "Which locomotive's inspector would you like to see?",
    },
    {
      id: "ADAPTER_LOCO_NEXT_INSPECTION",
      description: "Get next due inspection for a specific locomotive",
      adapterMethod: "getNextDueInspection",
      requiresLocoRef: true,
      canonicalExamples: ["when is the next inspection due", "next inspection date"],
      tags: ["inspection", "next", "due"],
      followUpQuestion: "Which locomotive's next inspection would you like to see?",
    },
    {
      id: "ADAPTER_OUT_OF_USE_CREDIT",
      description: "Get out-of-use credit for a locomotive",
      adapterMethod: "getOutOfUseCredit",
      requiresLocoRef: true,
      canonicalExamples: ["what is the out of use credit", "oou credit"],
      tags: ["credit", "out-of-use", "oou"],
      followUpQuestion: "Which locomotive's out-of-use credit would you like to see?",
    },
    {
      id: "ADAPTER_FIND_LOCOMOTIVE",
      description: "Find a specific locomotive",
      adapterMethod: "getLocomotive",
      requiresLocoRef: true,
      canonicalExamples: ["find locomotive", "show locomotive", "get details for loco"],
      tags: ["find", "lookup", "details"],
      followUpQuestion: "Which locomotive number or assetId would you like me to look up?",
    },
    {
      id: "ADAPTER_LIST_ALL_LOCOS",
      description: "List all locomotives",
      adapterMethod: "listLocomotives",
      requiresLocoRef: false,
      canonicalExamples: ["list all locomotives", "show all locos", "fleet list"],
      tags: ["list", "all", "fleet"],
    },
    {
      id: "ADAPTER_TEST_CODES",
      description: "List available inspection test codes",
      adapterMethod: "listInspectionTestCodes",
      requiresLocoRef: false,
      canonicalExamples: ["what test codes are available", "list test codes"],
      tags: ["test", "codes", "inspection"],
    },
  ],
};

// ============================================================================
// LITE DASHBOARD ADAPTER CLASS
// ============================================================================

export class LiteDashboardAdapter implements IDashboardAdapter {
  private readonly config: DashboardAdapterConfig;
  private readonly mappingIndex: Map<AdapterMethod, AdapterToServiceMapping>;

  constructor() {
    this.config = LITE_DASHBOARD_CONFIG;
    this.mappingIndex = new Map();
    
    for (const mapping of this.config.mappings) {
      this.mappingIndex.set(mapping.adapterMethod, mapping);
    }
  }

  getServiceName(): string {
    return this.config.serviceName;
  }

  getIntents(): AdapterIntentDefinition[] {
    return this.config.intents;
  }

  getMapping(adapterMethod: AdapterMethod): AdapterToServiceMapping | undefined {
    return this.mappingIndex.get(adapterMethod);
  }

  resolveCall(
    adapterMethod: AdapterMethod,
    params: { assetId?: string; locoNo?: string; filters?: Record<string, unknown> }
  ): ResolvedServiceCall | null {
    console.log(`[DEBUG] resolveCall called: method=${adapterMethod}, assetId=${params.assetId}, locoNo=${params.locoNo}`);
    
    const mapping = this.mappingIndex.get(adapterMethod);
    if (!mapping) return null;

    const { functionName, argsTemplate, readTheseFields } = mapping.serviceMapping;

    // Resolve placeholders in args
    const resolvedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(argsTemplate)) {
      if (value === "$assetId") {
        if (!params.assetId) {
          return null; // Can't resolve without assetId
        }
        resolvedArgs[key] = params.assetId;
      } else if (value === "$locoNo") {
        if (!params.locoNo) {
          return null;
        }
        resolvedArgs[key] = params.locoNo;
      } else {
        resolvedArgs[key] = value;
      }
    }

    // ✅ FIX: Replace <assetId> placeholder in readTheseFields with actual assetId
    const resolvedFields = readTheseFields.map((field) => {
      if (params.assetId && field.includes("<assetId>")) {
        return field.replace(/<assetId>/g, params.assetId);
      }
      return field;
    });

    // ✅ FIX: Generate proper reply text with locoNo → assetId mapping
    const replyText = this.generateReplyText(
      adapterMethod,
      functionName,
      params.locoNo,
      params.assetId,
      resolvedFields
    );

    return {
      adapterMethod,
      functionName,
      args: resolvedArgs,
      readTheseFields: resolvedFields,
      replyText,
    };
  }

  generateReplyText(
    adapterMethod: AdapterMethod,
    functionName: string,
    locoNo?: string,
    assetId?: string,
    readTheseFields?: string[]
  ): string {
    const parts: string[] = [];

    // Base action text
    const actionTexts: Record<string, string> = {
      getDashboardSnapshot: "get the dashboard summary",
      listLocomotives: "list locomotives",
      getLocomotive: "find the locomotive details",
      listInspectionTestCodes: "get inspection test codes",
      getLocomotiveCount: "get the total locomotive count",
      getOutOfServiceCount: "get the out-of-service count",
      getNonCompliantCount: "get the non-compliant count",
      getInspectionsCompletedTodayCount: "get today's completed inspections count",
      getDailyInspectionDueTodayCount: "get the daily inspection due count",
      getLastInspectionByLocomotive: "get last inspection dates for all locomotives",
      getNextDueInspectionByLocomotive: "get next due inspections for all locomotives",
      getNextDueInspection: "get the next due inspection date",
      getOutOfUseCredit: "get the out-of-use credit",
      getLocoLastInspectionDate: "get the last inspection date",
      getLocoLastInspectionInspector: "get the inspector name",
      getLocoOutOfUseStatus: "check the out-of-service status",
      getLocoEngineHours: "get the engine hours",
      getLocoMuId: "get the MU ID",
    };

    const action = actionTexts[adapterMethod] || "get that information";
    parts.push(`To ${action}, run \`${functionName}()\`.`);

    // Add locomotive mapping info
    if (locoNo && assetId) {
      parts.push(`\n\n🔗 Locomotive ${locoNo} → assetId: \`${assetId}\``);
    } else if (assetId && !locoNo) {
      parts.push(`\n\n🔗 Using assetId: \`${assetId}\``);
    }

    // Add field to read (only first/most relevant field)
    if (readTheseFields && readTheseFields.length > 0) {
      parts.push(`\n\n📋 Read: \`${readTheseFields[0]}\``);
    }

    return parts.join("");
  }

  getIntentDescriptions(): Record<string, string> {
    const descriptions: Record<string, string> = {};
    for (const intent of this.config.intents) {
      descriptions[intent.id] = intent.description;
    }
    return descriptions;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let adapterInstance: LiteDashboardAdapter | null = null;

export function getLiteDashboardAdapter(): LiteDashboardAdapter {
  if (!adapterInstance) {
    adapterInstance = new LiteDashboardAdapter();
  }
  return adapterInstance;
}

export function getAdapterIntentById(
  intentId: string
): AdapterIntentDefinition | undefined {
  const adapter = getLiteDashboardAdapter();
  return adapter.getIntents().find((i) => i.id === intentId);
}
