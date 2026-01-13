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
    description: "Get when a locomotive went out of use",
    requiresLoco: true,
    followUpQuestion: "Which locomotive (assetId or number)?",
    requiredEntities: [],
    recommendedCalls: [{ function: "getDashBoardData", args: {} }],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData.<assetId>.assetStates.outOfUseDate",
      "value.assetData.<assetId>.assetStates.outOfUse",
    ],
    safety: "safe",
    triggerPhrases: [
      "out of use date",
      "when did go out of use",
      "outofusedate",
      "out of use start",
      "when out of use",
      "go out of use",
      "went out of use",
    ],
    exampleQuestions: ["When did locomotive 8778 go out of use?"],
  },
  LOCO_ENGINE_HOURS: {
    description: "Get engine hours for a locomotive",
    requiresLoco: true,
    followUpQuestion: "Which locomotive (assetId or number)?",
    requiredEntities: [],
    recommendedCalls: [{ function: "getDashBoardData", args: {} }],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.assetStates.engineHour"],
    safety: "safe",
    triggerPhrases: [
      "engine hours",
      "enginehour",
      "engine hour",
      "hours for locomotive",
      "what are the engine hours",
      "show engine hours",
    ],
    exampleQuestions: ["What are the engine hours for locomotive 4430?"],
  },
  LOCO_AUTO_BLUE_CARD: {
    description: "Check autoBlueCardInitialize setting for a locomotive",
    requiresLoco: true,
    followUpQuestion: "Which locomotive (assetId or number)?",
    requiredEntities: [],
    recommendedCalls: [{ function: "getDashBoardData", args: {} }],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.assetStates.autoBlueCardInitialize"],
    safety: "safe",
    triggerPhrases: [
      "autobluecardinitiialize",
      "auto blue card",
      "blue card",
      "bluecard",
      "auto blue card initialize",
      "blue card initialize",
      "blue card enabled",
    ],
    exampleQuestions: ["Is autoBlueCardInitialize enabled for locomotive 8778?"],
  },
  LIST_DAILY_DUE: {
    description: "List locomotives that are daily due for inspection",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [{ function: "getDashBoardData", args: {} }],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: [
      "value.assetData",
      "value.summary.locomotivesDueForDailyInspec",
    ],
    safety: "safe",
    triggerPhrases: [
      "daily due",
      "dailydue",
      "which are daily due",
      "locomotives daily due",
      "daily inspection due",
      "due for daily inspection",
      "daily due list",
      "which locomotives are daily due",
    ],
    exampleQuestions: ["Which locomotives are daily due?"],
  },

  // Add these intents or update existing ones:

  LOCO_NAME_LOOKUP: {
    description: "Get the name of a specific locomotive",
    requiresLoco: true,
    followUpQuestion: "Which locomotive number (e.g., 4430)?",
    requiredEntities: [],
    recommendedCalls: [{ function: "getDashBoardData", args: {} }],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>.Locomotive.name"],
    safety: "safe",
    triggerPhrases: [
      "name of locomotive",
      "locomotive name",
      "loco name",
      "what is the name",
      "name for loco",
      "name for locomotive",
    ],
    exampleQuestions: ["What is the name of locomotive 4430?"],
  },

  LOCO_FIND_BY_NUMBER: {
    description: "Find a locomotive by its loco number",
    requiresLoco: true,
    followUpQuestion: "Which locomotive number?",
    requiredEntities: [],
    recommendedCalls: [{ function: "getDashBoardData", args: {} }],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData.<assetId>"],
    safety: "safe",
    triggerPhrases: [
      "find locomotive",
      "find loco",
      "find the locomotive",
      "find the loco",
      "locomotive with locono",
      "loco with number",
      "search for loco",
      "search locomotive",
    ],
    exampleQuestions: ["Find the locomotive with locoNo 8778"],
  },
  LIST_NULL_MUID: {
    description: "List locomotives with null muId",
    requiresLoco: false,
    requiredEntities: [],
    recommendedCalls: [{ function: "getDashBoardData", args: {} }],
    returns: "getDashBoardData -> dashboard payload",
    readTheseFields: ["value.assetData"],
    safety: "safe",
    triggerPhrases: [
      "null muid",
      "muid null",
      "null mu id",
      "no muid",
      "missing muid",
      "which locomotives have null",
      "locomotives null muid",
      "which have null muid",
    ],
    exampleQuestions: ["Which locomotives have a null muId?"],
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
  (id) => (INTENT_CATALOG[id].safety as SafetyMode) === "maintenance_only"
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
