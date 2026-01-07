/**
 * intentCatalog.ts
 *
 * Intent -> recommended LiteDashboardService calls + which fields to read.
 * Grounded in:
 * - FUNCTION_CATALOG.json (function names + read/write safety)
 * - liteDashboardService.js getDashBoardData() shape (value.summary + value.assetData map)
 *
 * Placeholders:
 * - "$assetId" / "$locoId" / "$testCode" / etc. inside args are templates your app should substitute.
 * - "<assetId>" inside readTheseFields is a placeholder segment for map lookups (value.assetData is Record<assetId, locoObj>).
 *
 * Routing support:
 * - triggerPhrases: simple lexical triggers for Step 7 rule-based routing (BM25/keyword match).
 * - exampleQuestions: representative user phrasings for tests + prompt examples.
 */

export const FUNCTION_NAMES = [
  "getAllLocomotives",
  "getAllTestCodes",
  "getAllLocomotivesCount",
  "getAllOutOfServiceLocomotivesCount",
  "getAllNonCompliantLocomotives",
  "getAllInspectionsCompletedTodayCount",
  "getAllDailyInspectionLocomotivesCount",
  "getAllLocomotiveLastInspectionDate",
  "getAllLocomotiveDueInspectionDate",
  "getLocoOutOfUseCredit",
  "updateDashBoardLocoState",
  "updateLocoOutOfUseCredit",
  "getLocoNextDueLocoInspection",
  "updateDashBoardLocoInspection",
  "getLocoMUId",
  "updateDashBoardLocoMUId",
  "getDashBoardData",
  "dashBoardDataBuildUp",
] as const;

export type FunctionName = (typeof FUNCTION_NAMES)[number];

export type SafetyMode = "safe" | "maintenance_only";

/**
 * Entities the router/extractor may produce.
 * Keep this list tight to reduce hallucinated fields.
 */
export const REQUIRED_ENTITIES = [
  "assetId",
  "confirmWrite",
  "date",
  "endDate",
  "locoId",
  "locoNo",
  "locos",
  "name",
  "startDate",
  "testCode",
  "thresholdHours",
  "title",
  "unitId",
  "userObject",
] as const;

export type RequiredEntity = (typeof REQUIRED_ENTITIES)[number];

export type RecommendedCall = {
  function: FunctionName;
  args: Record<string, unknown>;
};

export type IntentSpec = {
  /** Human-readable intent description */
  description: string;

  /** True if answering typically requires narrowing to a specific locomotive */
  requiresLoco: boolean;

  /** Entities that must be available before recommending calls */
  requiredEntities: RequiredEntity[];

  /** One or more service calls the app can execute */
  recommendedCalls: RecommendedCall[];

  /** Human-readable return type summary */
  returns: string;

  /** Paths to read from the returned payload(s) */
  readTheseFields: string[];

  /** Follow-up prompt if required entities are missing/ambiguous */
  followUpQuestion?: string;

  /** Safe advisor mode vs maintenance-only (blocked by default) */
  safety: SafetyMode;

  /** Optional extra notes for implementers (filters, PII/redaction notes, etc.) */
  notes?: string;

  /** Lexical triggers for rule-based routing */
  triggerPhrases: string[];

  /** Example user phrasings for tests & eval */
  exampleQuestions: string[];
};

const defineIntents = <T extends Record<string, IntentSpec>>(t: T) => t;

/**
 * Canonical intent catalog.
 * Your chatbot should ONLY recommend calls that appear here.
 */
export const INTENT_CATALOG = defineIntents({
  DASHBOARD_OVERVIEW: {
    description:
      "Fetch the full dashboard payload (summary KPIs + per-locomotive map).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns:
      "getDashBoardData -> { status:number, value:{ summary:{...}, assetData: Record<assetId,locoObj> } }",
    readTheseFields: ["status", "value.summary", "value.assetData"],
    safety: "safe",
    triggerPhrases: [
      "dashboard",
      "overview",
      "kpi",
      "summary",
      "show dashboard",
      "home",
    ],
    exampleQuestions: [
      "Show me the dashboard overview.",
      "What are today's KPIs?",
      "Give me the summary stats.",
    ],
  },
  FLEET_SIZE_TOTAL: {
    description: "Total number of locomotives (count).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllLocomotivesCount",
        args: {},
      },
    ],
    returns: "getAllLocomotivesCount -> number",
    readTheseFields: ["$"],
    safety: "safe",
    triggerPhrases: [
      "how many locomotives",
      "fleet size",
      "total locomotives",
      "total units",
    ],
    exampleQuestions: [
      "How many locomotives are in the fleet?",
      "Total number of locomotives?",
    ],
  },
  FLEET_SIZE_TOTAL_FROM_DASHBOARD: {
    description: "Total number of locomotives from dashboard summary.",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.summary.noOfLocomotives"],
    safety: "safe",
    triggerPhrases: [
      "noOfLocomotives",
      "dashboard fleet count",
      "fleet count (summary)",
    ],
    exampleQuestions: ["What's the fleet count in the dashboard summary?"],
  },
  OUT_OF_SERVICE_COUNT: {
    description: "Count of locomotives currently out of service.",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllOutOfServiceLocomotivesCount",
        args: {},
      },
    ],
    returns: "getAllOutOfServiceLocomotivesCount -> number",
    readTheseFields: ["$"],
    safety: "safe",
    triggerPhrases: [
      "out of service count",
      "out of use count",
      "how many are out",
      "oos count",
    ],
    exampleQuestions: [
      "How many locomotives are out of service?",
      "Out of service count?",
    ],
  },
  OUT_OF_SERVICE_COUNT_FROM_DASHBOARD: {
    description: "Out-of-service count from dashboard summary.",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.summary.locomotivesOutOfService"],
    safety: "safe",
    triggerPhrases: ["dashboard out of service", "locomotivesOutOfService"],
    exampleQuestions: ["What's the out-of-service KPI on the dashboard?"],
  },
  NON_COMPLIANT_COUNT: {
    description:
      "Count of non-compliant locomotives (function returns a count).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllNonCompliantLocomotives",
        args: {},
      },
    ],
    returns: "getAllNonCompliantLocomotives -> number (count)",
    readTheseFields: ["$"],
    safety: "safe",
    triggerPhrases: [
      "non compliant count",
      "noncompliant count",
      "how many non compliant",
      "compliance issues count",
    ],
    exampleQuestions: [
      "How many locomotives are non-compliant?",
      "Non-compliant count?",
    ],
  },
  NON_COMPLIANT_COUNT_FROM_DASHBOARD: {
    description: "Non-compliant count from dashboard summary.",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.summary.nonCompliantLocomotives"],
    safety: "safe",
    triggerPhrases: ["dashboard non compliant", "nonCompliantLocomotives"],
    exampleQuestions: ["What's the non-compliant KPI on the dashboard?"],
  },
  COMPLIANT_COUNT: {
    description: "Count of compliant locomotives from dashboard summary.",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.summary.compliantLocomotives"],
    safety: "safe",
    triggerPhrases: [
      "compliant count",
      "how many compliant",
      "compliant locomotives",
    ],
    exampleQuestions: [
      "How many locomotives are compliant?",
      "Compliant count?",
    ],
  },
  DAILY_INSPECTIONS_COMPLETED_KPI: {
    description:
      "Count of locomotives with daily inspections completed (dashboard summary).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.summary.locomotiveDailyInspections"],
    safety: "safe",
    triggerPhrases: [
      "daily inspections completed",
      "daily inspections done",
      "locomotiveDailyInspections",
    ],
    exampleQuestions: [
      "How many daily inspections are completed?",
      "Daily inspections completed KPI?",
    ],
  },
  DAILY_INSPECTIONS_DUE_KPI: {
    description:
      "Count of locomotives due for daily inspection (dashboard summary).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.summary.locomotivesDueForDailyInspec"],
    safety: "safe",
    triggerPhrases: [
      "daily inspections due",
      "due for daily inspection",
      "locomotivesDueForDailyInspec",
    ],
    exampleQuestions: [
      "How many are due for daily inspection?",
      "Daily inspections due KPI?",
    ],
  },
  INSPECTIONS_COMPLETED_TODAY_COUNT: {
    description:
      "Count of inspections completed today (service timezone day bounds).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllInspectionsCompletedTodayCount",
        args: {},
      },
    ],
    returns: "getAllInspectionsCompletedTodayCount -> number",
    readTheseFields: ["$"],
    safety: "safe",
    triggerPhrases: [
      "inspections completed today",
      "completed today count",
      "today's inspections",
    ],
    exampleQuestions: [
      "How many inspections were completed today?",
      "Inspections completed today?",
    ],
  },
  DAILY_DUE_TODAY_COUNT: {
    description:
      "Count of locomotives due today for daily inspection (service day bounds).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllDailyInspectionLocomotivesCount",
        args: {},
      },
    ],
    returns: "getAllDailyInspectionLocomotivesCount -> number",
    readTheseFields: ["$"],
    safety: "safe",
    triggerPhrases: [
      "daily due today count",
      "due today daily inspection",
      "daily inspection due today",
    ],
    exampleQuestions: [
      "How many locomotives are due today for daily inspection?",
    ],
  },
  LIST_ALL_LOCOS_FROM_DASHBOARD: {
    description: "List all locomotives from dashboard assetData map.",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData",
      "value.assetData.<assetId>.id",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
      "value.assetData.<assetId>.muId",
    ],
    safety: "safe",
    triggerPhrases: [
      "list locomotives",
      "show all locos",
      "all locomotives",
      "fleet list",
    ],
    exampleQuestions: ["List all locomotives.", "Show me the locomotive list."],
  },
  LIST_OUT_OF_SERVICE_LOCOS: {
    description:
      "List locomotives where assetStates.outOfUse is true (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.assetStates.outOfUse",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    safety: "safe",
    notes: "Filter: assetStates.outOfUse === true",
    triggerPhrases: [
      "list out of service",
      "which are out of service",
      "out of use locos",
      "oos list",
    ],
    exampleQuestions: [
      "Which locomotives are out of service?",
      "List out-of-service locomotives.",
    ],
  },
  LIST_AVAILABLE_LOCOS: {
    description:
      "List locomotives where assetStates.outOfUse is false (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.assetStates.outOfUse",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    safety: "safe",
    notes: "Filter: assetStates.outOfUse === false",
    triggerPhrases: [
      "available locomotives",
      "in service locomotives",
      "not out of service",
      "available list",
    ],
    exampleQuestions: [
      "Which locomotives are available?",
      "List locomotives that are not out of service.",
    ],
  },
  LIST_NON_COMPLIANT_LOCOS: {
    description:
      "List locomotives where assetStates.nonCompliant is true (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.assetStates.nonCompliant",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    safety: "safe",
    notes: "Filter: assetStates.nonCompliant === true",
    triggerPhrases: [
      "list non compliant",
      "which are non compliant",
      "noncompliant locomotives",
    ],
    exampleQuestions: [
      "List all non-compliant locomotives.",
      "Which locomotives are non-compliant?",
    ],
  },
  LIST_DAILY_DUE_LOCOS_TODAY: {
    description:
      "List locomotives due today for daily inspection (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.assetStates.dailyDue",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    followUpQuestion:
      "Do you mean due *today* (within the service's day bounds) or a custom date range?",
    safety: "safe",
    notes:
      "Filter: assetStates.dailyDue within startOfDay/endOfDay (US/Eastern), or filter client-side by date range.",
    triggerPhrases: [
      "daily due list",
      "due today list",
      "daily inspection due list",
      "who is due today",
    ],
    exampleQuestions: [
      "Which locomotives are due today for daily inspection?",
      "List daily-due locomotives today.",
    ],
  },
  LIST_LOCOS_MISSING_LAST_INSPECTION: {
    description:
      "List locomotives with missing/empty LastInspec (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.LastInspec",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    safety: "safe",
    notes: "Filter: LastInspec is empty object / null",
    triggerPhrases: [
      "missing last inspection",
      "no last inspection",
      "last inspection missing",
    ],
    exampleQuestions: ["Which locomotives have no last inspection record?"],
  },
  LIST_LOCOS_MISSING_DUE_INSPECTION: {
    description:
      "List locomotives with missing/empty DueInspec (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.DueInspec",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    safety: "safe",
    notes: "Filter: DueInspec is empty object / null",
    triggerPhrases: [
      "missing due inspection",
      "no due inspection",
      "due inspection missing",
    ],
    exampleQuestions: [
      "Which locomotives are missing a due inspection record?",
    ],
  },
  LIST_LOCOS_WITH_OOU_CREDIT_AVAILABLE: {
    description:
      "List locomotives with outOfUseCredit.status indicating available credit (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.outOfUseCredit.status",
      "value.assetData.<assetId>.outOfUseCredit.credit",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    safety: "safe",
    notes: "Filter: outOfUseCredit.status (e.g., 'Available')",
    triggerPhrases: [
      "oou credit available",
      "out of use credit available",
      "credit available list",
    ],
    exampleQuestions: ["Which locomotives have out-of-use credit available?"],
  },
  LIST_LOCOS_WITH_ENGINE_HOURS_OVER_THRESHOLD: {
    description:
      "List locomotives with engine hours over a threshold (client-side filter).",
    requiresLoco: false,
    requiredEntities: ["thresholdHours"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.assetStates.engineHour",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
    ],
    followUpQuestion: "What engine-hour threshold should I use (e.g., 10000)?",
    safety: "safe",
    notes: "Filter: assetStates.engineHour > thresholdHours",
    triggerPhrases: [
      "engine hours over",
      "hours threshold",
      "high engine hours",
      "over threshold hours",
    ],
    exampleQuestions: [
      "List locomotives with engine hours over 10,000.",
      "Which locos exceed 20k engine hours?",
    ],
  },
  LIST_ALL_LOCOS_FROM_ASSET_SERVICE: {
    description:
      "List locomotives from the underlying assets source (raw assets list).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllLocomotives",
        args: {},
      },
    ],
    returns: "getAllLocomotives -> Array<any> (assets list)",
    readTheseFields: ["[].*_id", "[].attributes"],
    safety: "safe",
    triggerPhrases: [
      "assets list",
      "all assets",
      "getAllLocomotives",
      "raw locomotives",
    ],
    exampleQuestions: [
      "Fetch all locomotives from the assets service.",
      "Show raw asset locomotive list.",
    ],
  },
  FIND_LOCO_BY_ASSET_ID: {
    description: "Find a locomotive in dashboard assetData by assetId.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>"],
    followUpQuestion: "What is the locomotive assetId?",
    safety: "safe",
    triggerPhrases: [
      "find by asset id",
      "assetId",
      "lookup asset id",
      "locate asset id",
    ],
    exampleQuestions: [
      "Find locomotive with assetId 68efe....",
      "Show details for assetId XYZ.",
    ],
  },
  FIND_LOCO_BY_LOCO_NUMBER: {
    description:
      "Find locomotive(s) by loco number (client-side search over dashboard assetData).",
    requiresLoco: true,
    requiredEntities: ["locoNo"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.id",
      "value.assetData.<assetId>.name",
    ],
    followUpQuestion: "Which locomotive number (e.g., 4430)?",
    safety: "safe",
    notes:
      "Client-side match: locoNo equals/contains provided locoNo. If multiple, ask user to pick one.",
    triggerPhrases: [
      "loco number",
      "locomotive number",
      "unit number",
      "engine number",
      "locoNo",
    ],
    exampleQuestions: ["Find loco 4430.", "Do we have locomotive number 8772?"],
  },
  FIND_LOCO_BY_NAME: {
    description:
      "Find locomotive(s) by name (client-side search over dashboard assetData).",
    requiresLoco: true,
    requiredEntities: ["name"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.name",
      "value.assetData.<assetId>.id",
      "value.assetData.<assetId>.locoNo",
    ],
    followUpQuestion: "Which locomotive name (or a unique fragment)?",
    safety: "safe",
    notes:
      "Client-side match: name contains provided text. If multiple, ask user to pick one.",
    triggerPhrases: ["loco name", "unitId", "name contains", "search name"],
    exampleQuestions: [
      "Find locomotive named SD70M 4430.",
      "Search locomotives by name 'GP38'.",
    ],
  },
  LOCO_STATUS_OUT_OF_USE: {
    description: "Check whether a locomotive is out of use.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.assetStates.outOfUse"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "out of use status",
      "out of service status",
      "is it out of use",
      "available status",
    ],
    exampleQuestions: [
      "Is loco 4430 out of use?",
      "Out-of-service status for assetId XYZ?",
    ],
  },
  LOCO_OUT_OF_USE_DATE: {
    description: "Get out-of-use date for a locomotive (if present).",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.assetStates.outOfUseDate"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "out of use date",
      "when taken out of service",
      "out of service date",
      "oou date",
    ],
    exampleQuestions: [
      "When was loco 4430 marked out of use?",
      "Out-of-use date for assetId XYZ?",
    ],
  },
  LOCO_STATUS_NON_COMPLIANT: {
    description: "Check whether a locomotive is non-compliant.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.assetStates.nonCompliant"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "non compliant status",
      "is it non compliant",
      "compliance status",
      "violations status",
    ],
    exampleQuestions: [
      "Is loco 8772 non-compliant?",
      "Non-compliant status for assetId XYZ?",
    ],
  },
  LOCO_DAILY_DUE_DATE: {
    description: "Get daily due timestamp/date for a locomotive (if present).",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.assetStates.dailyDue"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "daily due for loco",
      "daily inspection due date",
      "when is daily due",
      "dailyDue",
    ],
    exampleQuestions: [
      "When is loco 4430 due for daily inspection?",
      "Daily due date for assetId XYZ?",
    ],
  },
  LOCO_ENGINE_HOURS: {
    description: "Get engine hours for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.assetStates.engineHour"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "engine hours",
      "hours on engine",
      "engineHour",
      "running hours",
    ],
    exampleQuestions: [
      "How many engine hours does loco 4430 have?",
      "Engine hours for assetId XYZ?",
    ],
  },
  LOCO_AUTO_BLUECARD_INITIALIZE_FLAG: {
    description: "Read autoBlueCardInitialize flag for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.assetStates.autoBlueCardInitialize",
    ],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "auto bluecard",
      "blue card initialize",
      "autoBlueCardInitialize",
    ],
    exampleQuestions: ["Is auto bluecard initialize set for loco 4430?"],
  },
  LOCO_BASIC_METADATA: {
    description: "Read basic locomotive metadata (id, number, name, MU id).",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.id",
      "value.assetData.<assetId>.locoNo",
      "value.assetData.<assetId>.name",
      "value.assetData.<assetId>.muId",
    ],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "loco details",
      "metadata",
      "basic info",
      "id name number",
      "mu id",
    ],
    exampleQuestions: [
      "Show basic info for loco 4430.",
      "What are the details for assetId XYZ?",
    ],
  },
  LOCO_OUT_OF_USE_CREDIT_SUMMARY: {
    description: "Get out-of-use credit summary for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getLocoOutOfUseCredit",
        args: {
          assetId: "$assetId",
        },
      },
    ],
    returns:
      "getLocoOutOfUseCredit -> { credit:number, outOfUseDays:number, status:string }",
    readTheseFields: ["credit", "outOfUseDays", "status"],
    followUpQuestion:
      "Which locomotive assetId (or loco number so I can look it up)?",
    safety: "safe",
    triggerPhrases: [
      "out of use credit",
      "oou credit",
      "credit summary",
      "credit status",
    ],
    exampleQuestions: [
      "What's the out-of-use credit for loco 4430?",
      "Show OOU credit summary for assetId XYZ.",
    ],
  },
  LOCO_OUT_OF_USE_CREDIT_VALUE_ONLY: {
    description: "Get out-of-use credit value for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getLocoOutOfUseCredit",
        args: {
          assetId: "$assetId",
        },
      },
    ],
    returns:
      "getLocoOutOfUseCredit -> { credit:number, outOfUseDays:number, status:string }",
    readTheseFields: ["credit"],
    followUpQuestion:
      "Which locomotive assetId (or loco number so I can look it up)?",
    safety: "safe",
    triggerPhrases: ["credit amount", "oou credit value", "credit balance"],
    exampleQuestions: ["How much out-of-use credit does loco 4430 have?"],
  },
  LOCO_OUT_OF_USE_DAYS_ONLY: {
    description: "Get out-of-use days for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getLocoOutOfUseCredit",
        args: {
          assetId: "$assetId",
        },
      },
    ],
    returns:
      "getLocoOutOfUseCredit -> { credit:number, outOfUseDays:number, status:string }",
    readTheseFields: ["outOfUseDays"],
    followUpQuestion:
      "Which locomotive assetId (or loco number so I can look it up)?",
    safety: "safe",
    triggerPhrases: ["out of use days", "days out of use", "oou days"],
    exampleQuestions: ["How many days has loco 4430 been out of use?"],
  },
  LOCO_OUT_OF_USE_CREDIT_FROM_DASHBOARD: {
    description:
      "Read out-of-use credit values from dashboard-stored assetData.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.outOfUseCredit.credit",
      "value.assetData.<assetId>.outOfUseCredit.outOfUseDays",
      "value.assetData.<assetId>.outOfUseCredit.status",
    ],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "oou credit (dashboard)",
      "credit from dashboard",
      "stored credit",
    ],
    exampleQuestions: ["Show me the stored OOU credit fields for loco 4430."],
  },
  LOCO_NEXT_DUE_INSPECTION: {
    description:
      "Get the next due inspection for a locomotive (service helper).",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getLocoNextDueLocoInspection",
        args: {
          assetId: "$assetId",
        },
      },
    ],
    returns:
      "getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}",
    readTheseFields: ["nextExpiryDate", "title", "testCode"],
    followUpQuestion:
      "Which locomotive assetId (or loco number so I can look it up)?",
    safety: "safe",
    triggerPhrases: [
      "next inspection due",
      "next due inspection",
      "when is next due",
      "upcoming inspection",
      "expiry date",
    ],
    exampleQuestions: [
      "When is loco 4430 due next?",
      "Next inspection due for assetId XYZ?",
    ],
  },
  LOCO_NEXT_DUE_INSPECTION_DATE_ONLY: {
    description: "Get next due inspection date for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getLocoNextDueLocoInspection",
        args: {
          assetId: "$assetId",
        },
      },
    ],
    returns:
      "getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}",
    readTheseFields: ["nextExpiryDate"],
    followUpQuestion:
      "Which locomotive assetId (or loco number so I can look it up)?",
    safety: "safe",
    triggerPhrases: ["next expiry date", "due date only", "when due"],
    exampleQuestions: ["What's the next due date for loco 4430?"],
  },
  LOCO_NEXT_DUE_INSPECTION_TEST_CODE_ONLY: {
    description: "Get next due inspection test code for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getLocoNextDueLocoInspection",
        args: {
          assetId: "$assetId",
        },
      },
    ],
    returns:
      "getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}",
    readTheseFields: ["testCode"],
    followUpQuestion:
      "Which locomotive assetId (or loco number so I can look it up)?",
    safety: "safe",
    triggerPhrases: ["next test code", "due test code", "inspection code"],
    exampleQuestions: [
      "What's the next due inspection test code for loco 4430?",
    ],
  },
  LOCO_NEXT_DUE_INSPECTION_TITLE_ONLY: {
    description: "Get next due inspection title for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getLocoNextDueLocoInspection",
        args: {
          assetId: "$assetId",
        },
      },
    ],
    returns:
      "getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}",
    readTheseFields: ["title"],
    followUpQuestion:
      "Which locomotive assetId (or loco number so I can look it up)?",
    safety: "safe",
    triggerPhrases: [
      "next inspection title",
      "inspection type",
      "due inspection name",
    ],
    exampleQuestions: ["What inspection is due next for loco 4430?"],
  },
  LOCO_DUE_INSPECTION_FROM_DASHBOARD: {
    description: "Read due inspection fields from dashboard-stored assetData.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.DueInspec.nextExpiryDate",
      "value.assetData.<assetId>.DueInspec.title",
      "value.assetData.<assetId>.DueInspec.testCode",
    ],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "due inspection (dashboard)",
      "stored due inspection",
      "DueInspec",
    ],
    exampleQuestions: ["Show stored due inspection fields for loco 4430."],
  },
  LOCO_LAST_INSPECTION_SUMMARY: {
    description:
      "Read last inspection summary from dashboard-stored assetData.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.LastInspec.date",
      "value.assetData.<assetId>.LastInspec.title",
      "value.assetData.<assetId>.LastInspec.testCode",
    ],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "last inspection",
      "most recent inspection",
      "previous inspection",
      "LastInspec",
    ],
    exampleQuestions: [
      "When was loco 4430 last inspected?",
      "Show last inspection for assetId XYZ.",
    ],
  },
  LOCO_LAST_INSPECTION_DATE_ONLY: {
    description: "Read last inspection date from dashboard-stored assetData.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.LastInspec.date"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "last inspection date",
      "date of last inspection",
      "when last inspected",
    ],
    exampleQuestions: ["What's the last inspection date for loco 4430?"],
  },
  LOCO_LAST_INSPECTION_TEST_CODE_ONLY: {
    description:
      "Read last inspection test code from dashboard-stored assetData.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.LastInspec.testCode"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "last test code",
      "previous inspection code",
      "last inspection code",
    ],
    exampleQuestions: ["What was the last inspection test code for loco 4430?"],
  },
  LOCO_LAST_INSPECTION_TITLE_ONLY: {
    description: "Read last inspection title from dashboard-stored assetData.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.LastInspec.title"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: [
      "last inspection title",
      "what inspection was last",
      "previous inspection type",
    ],
    exampleQuestions: ["What was the last inspection type for loco 4430?"],
  },
  LOCO_LAST_INSPECTION_INSPECTOR_NAME: {
    description:
      "Read last inspection inspector name from dashboard-stored assetData.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.LastInspec.user.name"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    notes:
      "PII: name only is typically acceptable; follow your redaction policy.",
    triggerPhrases: [
      "who inspected",
      "inspector name",
      "performed by",
      "inspected by",
    ],
    exampleQuestions: ["Who did the last inspection on loco 4430?"],
  },
  LOCO_LAST_INSPECTION_INSPECTOR_EMAIL: {
    description:
      "Read last inspection inspector email from dashboard-stored assetData (PII).",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.LastInspec.user.email"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    notes:
      "PII: email should be redacted unless explicitly allowed by your policy.",
    triggerPhrases: [
      "inspector email",
      "email of inspector",
      "contact inspector",
    ],
    exampleQuestions: [
      "What's the inspector email for loco 4430's last inspection?",
    ],
  },
  FLEET_LAST_INSPECTION_MAP: {
    description: "Get last inspection record per locomotive (map).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllLocomotiveLastInspectionDate",
        args: {},
      },
    ],
    returns:
      "getAllLocomotiveLastInspectionDate -> Record<assetId,{ assetId,date,title,testCode,user }>",
    readTheseFields: [
      "<assetId>.date",
      "<assetId>.title",
      "<assetId>.testCode",
      "<assetId>.user",
    ],
    safety: "safe",
    triggerPhrases: [
      "fleet last inspection map",
      "all last inspections",
      "last inspections for all",
    ],
    exampleQuestions: [
      "Get last inspection for every locomotive.",
      "Show fleet last inspection map.",
    ],
  },
  FLEET_LAST_INSPECTED_WITHIN_RANGE: {
    description:
      "List locos last-inspected within a date range (client-side filter).",
    requiresLoco: false,
    requiredEntities: ["startDate", "endDate"],
    recommendedCalls: [
      {
        function: "getAllLocomotiveLastInspectionDate",
        args: {},
      },
    ],
    returns: "getAllLocomotiveLastInspectionDate -> map",
    readTheseFields: [
      "<assetId>.date",
      "<assetId>.title",
      "<assetId>.testCode",
    ],
    followUpQuestion: "What date range should I use? (start + end)",
    safety: "safe",
    notes: "Client-side filter: startDate <= date <= endDate",
    triggerPhrases: [
      "last inspected between",
      "inspected within range",
      "inspected from",
      "inspection date range",
    ],
    exampleQuestions: [
      "Which locomotives were inspected between 2025-01-01 and 2025-01-31?",
    ],
  },
  FLEET_LAST_INSPECTION_BY_TEST_CODE: {
    description: "List locos by last inspection testCode (client-side filter).",
    requiresLoco: false,
    requiredEntities: ["testCode"],
    recommendedCalls: [
      {
        function: "getAllLocomotiveLastInspectionDate",
        args: {},
      },
    ],
    returns: "getAllLocomotiveLastInspectionDate -> map",
    readTheseFields: [
      "<assetId>.testCode",
      "<assetId>.date",
      "<assetId>.title",
    ],
    followUpQuestion: "Which test code?",
    safety: "safe",
    notes: "Client-side filter: testCode match",
    triggerPhrases: [
      "last inspection test code",
      "last inspected with code",
      "by testCode last",
    ],
    exampleQuestions: [
      "Which locomotives last had test code AIR?",
      "Show last inspections with test code XYZ.",
    ],
  },
  FLEET_DUE_INSPECTION_MAP: {
    description: "Get due inspection record per locomotive (map).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllLocomotiveDueInspectionDate",
        args: {},
      },
    ],
    returns:
      "getAllLocomotiveDueInspectionDate -> Record<assetId,{ assetId,nextExpiryDate,title,testCode }>",
    readTheseFields: [
      "<assetId>.nextExpiryDate",
      "<assetId>.title",
      "<assetId>.testCode",
    ],
    safety: "safe",
    triggerPhrases: [
      "fleet due inspection map",
      "all due inspections",
      "due inspections for all",
    ],
    exampleQuestions: [
      "Show due inspections for all locomotives.",
      "Get fleet due inspection map.",
    ],
  },
  FLEET_DUE_IN_NEXT_7_DAYS: {
    description:
      "List locos with inspections due in next 7 days (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllLocomotiveDueInspectionDate",
        args: {},
      },
    ],
    returns: "getAllLocomotiveDueInspectionDate -> map",
    readTheseFields: [
      "<assetId>.nextExpiryDate",
      "<assetId>.title",
      "<assetId>.testCode",
    ],
    safety: "safe",
    notes: "Client-side filter: now <= nextExpiryDate <= now+7d",
    triggerPhrases: [
      "due in next 7 days",
      "due within a week",
      "upcoming due this week",
    ],
    exampleQuestions: ["Which locomotives are due in the next 7 days?"],
  },
  FLEET_DUE_IN_NEXT_30_DAYS: {
    description:
      "List locos with inspections due in next 30 days (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllLocomotiveDueInspectionDate",
        args: {},
      },
    ],
    returns: "getAllLocomotiveDueInspectionDate -> map",
    readTheseFields: [
      "<assetId>.nextExpiryDate",
      "<assetId>.title",
      "<assetId>.testCode",
    ],
    safety: "safe",
    notes: "Client-side filter: now <= nextExpiryDate <= now+30d",
    triggerPhrases: [
      "due in next 30 days",
      "due this month",
      "upcoming due within 30 days",
    ],
    exampleQuestions: ["Which locomotives are due in the next 30 days?"],
  },
  FLEET_OVERDUE_INSPECTIONS: {
    description: "List locos with overdue inspections (client-side filter).",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllLocomotiveDueInspectionDate",
        args: {},
      },
    ],
    returns: "getAllLocomotiveDueInspectionDate -> map",
    readTheseFields: [
      "<assetId>.nextExpiryDate",
      "<assetId>.title",
      "<assetId>.testCode",
    ],
    followUpQuestion:
      "Should I exclude locomotives with no due date (missing nextExpiryDate), or list them as 'unknown'?",
    safety: "safe",
    notes: "Client-side filter: nextExpiryDate < now",
    triggerPhrases: [
      "overdue inspections",
      "past due",
      "expired inspections",
      "overdue list",
    ],
    exampleQuestions: ["Which locomotives are overdue for inspection?"],
  },
  FLEET_DUE_BY_TEST_CODE: {
    description:
      "List locos with due inspection for a test code (client-side filter).",
    requiresLoco: false,
    requiredEntities: ["testCode"],
    recommendedCalls: [
      {
        function: "getAllLocomotiveDueInspectionDate",
        args: {},
      },
    ],
    returns: "getAllLocomotiveDueInspectionDate -> map",
    readTheseFields: [
      "<assetId>.testCode",
      "<assetId>.nextExpiryDate",
      "<assetId>.title",
    ],
    followUpQuestion: "Which test code?",
    safety: "safe",
    notes: "Client-side filter: testCode match",
    triggerPhrases: [
      "due by test code",
      "due inspections for code",
      "which are due for test",
    ],
    exampleQuestions: ["Which locomotives are due for test code XYZ?"],
  },
  LIST_TEST_CODES: {
    description: "List all active test codes.",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [
      {
        function: "getAllTestCodes",
        args: {},
      },
    ],
    returns: "getAllTestCodes -> string[]",
    readTheseFields: ["$"],
    safety: "safe",
    triggerPhrases: [
      "list test codes",
      "all test codes",
      "available test codes",
    ],
    exampleQuestions: ["List all test codes.", "What test codes exist?"],
  },
  VALIDATE_TEST_CODE_EXISTS: {
    description:
      "Check if a given test code exists (client-side membership check).",
    requiresLoco: false,
    requiredEntities: ["testCode"],
    recommendedCalls: [
      {
        function: "getAllTestCodes",
        args: {},
      },
    ],
    returns: "getAllTestCodes -> string[]",
    readTheseFields: ["$"],
    followUpQuestion: "Which test code are you checking?",
    safety: "safe",
    notes: "Client-side: check testCode in returned array",
    triggerPhrases: [
      "is test code valid",
      "does test code exist",
      "validate test code",
    ],
    exampleQuestions: ["Is test code ABC valid?", "Does test code XYZ exist?"],
  },
  LOCO_MU_ID_READ: {
    description: "Read MU id for a locomotive (from dashboard).",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.muId"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    triggerPhrases: ["mu id", "multiple unit id", "consist id", "muId"],
    exampleQuestions: [
      "What's the MU id for loco 4430?",
      "MU id for assetId XYZ?",
    ],
  },
  LOCO_MU_ID_MISSING_EXPLAIN: {
    description: "Explain/confirm whether MU id is missing for a locomotive.",
    requiresLoco: true,
    requiredEntities: ["assetId"],
    recommendedCalls: [
      {
        function: "getDashBoardData",
        args: {},
      },
    ],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.muId"],
    followUpQuestion: "Which locomotive (assetId or number)?",
    safety: "safe",
    notes:
      "If muId is null/empty, answer as 'not set' and optionally suggest maintenance update.",
    triggerPhrases: [
      "mu id missing",
      "no mu id",
      "why mu id blank",
      "mu not set",
    ],
    exampleQuestions: [
      "Does loco 4430 have an MU id set?",
      "Why is MU id missing for assetId XYZ?",
    ],
  },
  MAINT_REFRESH_REBUILD_DASHBOARD: {
    description: "Rebuild/refresh the stored dashboard data (bulk write job).",
    requiresLoco: false,
    requiredEntities: ["confirmWrite"],
    recommendedCalls: [
      {
        function: "dashBoardDataBuildUp",
        args: {},
      },
    ],
    returns: "dashBoardDataBuildUp -> (implementation-defined)",
    readTheseFields: ["$"],
    followUpQuestion:
      "This action has side effects. If you really want it, confirm with CONFIRM_WRITE.",
    safety: "maintenance_only",
    notes: "Blocked by default in advisor mode (write/side-effect).",
    triggerPhrases: [
      "rebuild dashboard",
      "refresh dashboard data",
      "recalculate dashboard",
      "build up dashboard",
    ],
    exampleQuestions: [
      "Rebuild the dashboard data.",
      "Refresh the stored dashboard payload.",
    ],
  },
  MAINT_UPDATE_LOCO_STATE_IN_DASHBOARD: {
    description: "Update stored dashboard state for a locomotive (write).",
    requiresLoco: true,
    requiredEntities: ["locoId", "confirmWrite"],
    recommendedCalls: [
      {
        function: "updateDashBoardLocoState",
        args: {
          locoId: "$locoId",
        },
      },
    ],
    returns: "updateDashBoardLocoState -> (implementation-defined)",
    readTheseFields: ["$"],
    followUpQuestion:
      "This action has side effects. Provide locoId and confirm with CONFIRM_WRITE.",
    safety: "maintenance_only",
    notes: "Blocked by default in advisor mode (write/side-effect).",
    triggerPhrases: [
      "update loco state",
      "refresh loco state",
      "recompute loco state",
      "updateDashBoardLocoState",
    ],
    exampleQuestions: [
      "Update the dashboard state for locoId XYZ.",
      "Refresh loco state in dashboard for this loco.",
    ],
  },
  MAINT_RECALC_OOU_CREDIT_AND_SAVE: {
    description:
      "Recalculate and update out-of-use credit for a locomotive (write).",
    requiresLoco: true,
    requiredEntities: ["locoId", "confirmWrite"],
    recommendedCalls: [
      {
        function: "updateLocoOutOfUseCredit",
        args: {
          locoId: "$locoId",
        },
      },
    ],
    returns: "updateLocoOutOfUseCredit -> (implementation-defined)",
    readTheseFields: ["$"],
    followUpQuestion:
      "This action has side effects. Provide locoId and confirm with CONFIRM_WRITE.",
    safety: "maintenance_only",
    notes: "Blocked by default in advisor mode (write/side-effect).",
    triggerPhrases: [
      "recalculate oou credit",
      "update oou credit",
      "recompute credit",
      "updateLocoOutOfUseCredit",
    ],
    exampleQuestions: [
      "Recalculate OOU credit for locoId XYZ.",
      "Update out-of-use credit for this loco.",
    ],
  },
  MAINT_UPDATE_LAST_AND_DUE_INSPECTION_FIELDS: {
    description:
      "Update stored last/due inspection fields in dashboard (write).",
    requiresLoco: true,
    requiredEntities: [
      "date",
      "unitId",
      "title",
      "testCode",
      "userObject",
      "confirmWrite",
    ],
    recommendedCalls: [
      {
        function: "updateDashBoardLocoInspection",
        args: {
          date: "$date",
          unit: {
            id: "$unitId",
          },
          testInfo: {
            title: "$title",
            testCode: "$testCode",
            user: "$userObject",
          },
        },
      },
    ],
    returns: "updateDashBoardLocoInspection -> (implementation-defined)",
    readTheseFields: ["$"],
    followUpQuestion:
      "This action has side effects. Provide date, unitId, test title, test code, user info, and confirm with CONFIRM_WRITE.",
    safety: "maintenance_only",
    notes: "Blocked by default in advisor mode (write/side-effect).",
    triggerPhrases: [
      "update inspection in dashboard",
      "set last inspection",
      "update due inspection",
      "updateDashBoardLocoInspection",
    ],
    exampleQuestions: [
      "Update dashboard inspection fields for unitId XYZ with test code ABC on date 2025-01-01.",
    ],
  },
  MAINT_UPDATE_MU_ID_FIELD: {
    description: "Update stored MU id for a locomotive in dashboard (write).",
    requiresLoco: true,
    requiredEntities: ["locoId", "confirmWrite"],
    recommendedCalls: [
      {
        function: "updateDashBoardLocoMUId",
        args: {
          locoId: "$locoId",
        },
      },
    ],
    returns: "updateDashBoardLocoMUId -> (implementation-defined)",
    readTheseFields: ["$"],
    followUpQuestion:
      "This action has side effects. Provide locoId and confirm with CONFIRM_WRITE.",
    safety: "maintenance_only",
    notes: "Blocked by default in advisor mode (write/side-effect).",
    triggerPhrases: [
      "update mu id",
      "refresh mu id",
      "updateDashBoardLocoMUId",
    ],
    exampleQuestions: ["Update MU id in dashboard for locoId XYZ."],
  },
  INTERNAL_RESOLVE_MU_HEAD_HELPER: {
    description:
      "Internal helper to resolve MU id/head from a locomotive list (not recommended to end users).",
    requiresLoco: true,
    requiredEntities: ["locoId", "locos"],
    recommendedCalls: [
      {
        function: "getLocoMUId",
        args: {
          locoId: "$locoId",
          locos: "$locos",
        },
      },
    ],
    returns: "getLocoMUId -> string | null (internal helper)",
    readTheseFields: ["$"],
    followUpQuestion:
      "This is an internal helper. Provide locoId and a locos array (usually value.assetData values).",
    safety: "maintenance_only",
    notes: "Function exists but is not recommendable in advisor mode.",
    triggerPhrases: ["getLocoMUId helper", "resolve mu head", "mu head helper"],
    exampleQuestions: ["Resolve MU head for locoId XYZ given locos list."],
  },
});

export type IntentId = keyof typeof INTENT_CATALOG;

export const ALL_INTENTS: IntentId[] = Object.keys(
  INTENT_CATALOG
) as IntentId[];

/** Convenience lists */
export const SAFE_INTENTS: IntentId[] = ALL_INTENTS.filter(
  (id) => INTENT_CATALOG[id].safety === "safe"
);

export const MAINTENANCE_INTENTS: IntentId[] = ALL_INTENTS.filter(
  (id) => INTENT_CATALOG[id].safety === "maintenance_only"
);

/**
 * Optional runtime validator you can call in dev/test to ensure
 * there are no stray function names in recommendedCalls.
 */
export function validateIntentCatalog(): void {
  const fnSet = new Set<string>(FUNCTION_NAMES as unknown as string[]);
  for (const [id, spec] of Object.entries(INTENT_CATALOG)) {
    for (const call of spec.recommendedCalls) {
      if (!fnSet.has(call.function)) {
        throw new Error(
          `Intent ${id} references unknown function: ${call.function}`
        );
      }
    }
  }
}
