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
export declare const FUNCTION_NAMES: readonly ["getAllLocomotives", "getAllTestCodes", "getAllLocomotivesCount", "getAllOutOfServiceLocomotivesCount", "getAllNonCompliantLocomotives", "getAllInspectionsCompletedTodayCount", "getAllDailyInspectionLocomotivesCount", "getAllLocomotiveLastInspectionDate", "getAllLocomotiveDueInspectionDate", "getLocoOutOfUseCredit", "updateDashBoardLocoState", "updateLocoOutOfUseCredit", "getLocoNextDueLocoInspection", "updateDashBoardLocoInspection", "getLocoMUId", "updateDashBoardLocoMUId", "getDashBoardData", "dashBoardDataBuildUp"];
export type FunctionName = (typeof FUNCTION_NAMES)[number];
export type SafetyMode = "safe" | "maintenance_only";
/**
 * Entities the router/extractor may produce.
 * Keep this list tight to reduce hallucinated fields.
 */
export declare const REQUIRED_ENTITIES: readonly ["assetId", "confirmWrite", "date", "endDate", "locoId", "locoNo", "locos", "name", "startDate", "testCode", "thresholdHours", "title", "unitId", "userObject"];
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
/**
 * Canonical intent catalog.
 * Your chatbot should ONLY recommend calls that appear here.
 */
export declare const INTENT_CATALOG: {
    DASHBOARD_OVERVIEW: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_SIZE_TOTAL: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllLocomotivesCount";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_SIZE_TOTAL_FROM_DASHBOARD: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    OUT_OF_SERVICE_COUNT: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllOutOfServiceLocomotivesCount";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    OUT_OF_SERVICE_COUNT_FROM_DASHBOARD: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    NON_COMPLIANT_COUNT: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllNonCompliantLocomotives";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    NON_COMPLIANT_COUNT_FROM_DASHBOARD: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    COMPLIANT_COUNT: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    DAILY_INSPECTIONS_COMPLETED_KPI: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    DAILY_INSPECTIONS_DUE_KPI: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    INSPECTIONS_COMPLETED_TODAY_COUNT: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllInspectionsCompletedTodayCount";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    DAILY_DUE_TODAY_COUNT: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllDailyInspectionLocomotivesCount";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_ALL_LOCOS_FROM_DASHBOARD: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_OUT_OF_SERVICE_LOCOS: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_AVAILABLE_LOCOS: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_NON_COMPLIANT_LOCOS: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_DAILY_DUE_LOCOS_TODAY: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_LOCOS_MISSING_LAST_INSPECTION: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_LOCOS_MISSING_DUE_INSPECTION: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_LOCOS_WITH_OOU_CREDIT_AVAILABLE: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_LOCOS_WITH_ENGINE_HOURS_OVER_THRESHOLD: {
        description: string;
        requiresLoco: false;
        requiredEntities: "thresholdHours"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_ALL_LOCOS_FROM_ASSET_SERVICE: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllLocomotives";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FIND_LOCO_BY_ASSET_ID: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FIND_LOCO_BY_LOCO_NUMBER: {
        description: string;
        requiresLoco: true;
        requiredEntities: "locoNo"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FIND_LOCO_BY_NAME: {
        description: string;
        requiresLoco: true;
        requiredEntities: "name"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_STATUS_OUT_OF_USE: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_OUT_OF_USE_DATE: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_STATUS_NON_COMPLIANT: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_DAILY_DUE_DATE: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_ENGINE_HOURS: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_AUTO_BLUECARD_INITIALIZE_FLAG: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_BASIC_METADATA: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_OUT_OF_USE_CREDIT_SUMMARY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getLocoOutOfUseCredit";
            args: {
                assetId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_OUT_OF_USE_CREDIT_VALUE_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getLocoOutOfUseCredit";
            args: {
                assetId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_OUT_OF_USE_DAYS_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getLocoOutOfUseCredit";
            args: {
                assetId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_OUT_OF_USE_CREDIT_FROM_DASHBOARD: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_NEXT_DUE_INSPECTION: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getLocoNextDueLocoInspection";
            args: {
                assetId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_NEXT_DUE_INSPECTION_DATE_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getLocoNextDueLocoInspection";
            args: {
                assetId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_NEXT_DUE_INSPECTION_TEST_CODE_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getLocoNextDueLocoInspection";
            args: {
                assetId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_NEXT_DUE_INSPECTION_TITLE_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getLocoNextDueLocoInspection";
            args: {
                assetId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_DUE_INSPECTION_FROM_DASHBOARD: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_LAST_INSPECTION_SUMMARY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_LAST_INSPECTION_DATE_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_LAST_INSPECTION_TEST_CODE_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_LAST_INSPECTION_TITLE_ONLY: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_LAST_INSPECTION_INSPECTOR_NAME: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_LAST_INSPECTION_INSPECTOR_EMAIL: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_LAST_INSPECTION_MAP: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllLocomotiveLastInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_LAST_INSPECTED_WITHIN_RANGE: {
        description: string;
        requiresLoco: false;
        requiredEntities: ("endDate" | "startDate")[];
        recommendedCalls: {
            function: "getAllLocomotiveLastInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_LAST_INSPECTION_BY_TEST_CODE: {
        description: string;
        requiresLoco: false;
        requiredEntities: "testCode"[];
        recommendedCalls: {
            function: "getAllLocomotiveLastInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_DUE_INSPECTION_MAP: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllLocomotiveDueInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_DUE_IN_NEXT_7_DAYS: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllLocomotiveDueInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_DUE_IN_NEXT_30_DAYS: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllLocomotiveDueInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_OVERDUE_INSPECTIONS: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllLocomotiveDueInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    FLEET_DUE_BY_TEST_CODE: {
        description: string;
        requiresLoco: false;
        requiredEntities: "testCode"[];
        recommendedCalls: {
            function: "getAllLocomotiveDueInspectionDate";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LIST_TEST_CODES: {
        description: string;
        requiresLoco: false;
        requiredEntities: never[];
        recommendedCalls: {
            function: "getAllTestCodes";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    VALIDATE_TEST_CODE_EXISTS: {
        description: string;
        requiresLoco: false;
        requiredEntities: "testCode"[];
        recommendedCalls: {
            function: "getAllTestCodes";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_MU_ID_READ: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    LOCO_MU_ID_MISSING_EXPLAIN: {
        description: string;
        requiresLoco: true;
        requiredEntities: "assetId"[];
        recommendedCalls: {
            function: "getDashBoardData";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "safe";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    MAINT_REFRESH_REBUILD_DASHBOARD: {
        description: string;
        requiresLoco: false;
        requiredEntities: "confirmWrite"[];
        recommendedCalls: {
            function: "dashBoardDataBuildUp";
            args: {};
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "maintenance_only";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    MAINT_UPDATE_LOCO_STATE_IN_DASHBOARD: {
        description: string;
        requiresLoco: true;
        requiredEntities: ("confirmWrite" | "locoId")[];
        recommendedCalls: {
            function: "updateDashBoardLocoState";
            args: {
                locoId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "maintenance_only";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    MAINT_RECALC_OOU_CREDIT_AND_SAVE: {
        description: string;
        requiresLoco: true;
        requiredEntities: ("confirmWrite" | "locoId")[];
        recommendedCalls: {
            function: "updateLocoOutOfUseCredit";
            args: {
                locoId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "maintenance_only";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    MAINT_UPDATE_LAST_AND_DUE_INSPECTION_FIELDS: {
        description: string;
        requiresLoco: true;
        requiredEntities: ("confirmWrite" | "date" | "testCode" | "title" | "unitId" | "userObject")[];
        recommendedCalls: {
            function: "updateDashBoardLocoInspection";
            args: {
                date: string;
                unit: {
                    id: string;
                };
                testInfo: {
                    title: string;
                    testCode: string;
                    user: string;
                };
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "maintenance_only";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    MAINT_UPDATE_MU_ID_FIELD: {
        description: string;
        requiresLoco: true;
        requiredEntities: ("confirmWrite" | "locoId")[];
        recommendedCalls: {
            function: "updateDashBoardLocoMUId";
            args: {
                locoId: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "maintenance_only";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
    INTERNAL_RESOLVE_MU_HEAD_HELPER: {
        description: string;
        requiresLoco: true;
        requiredEntities: ("locoId" | "locos")[];
        recommendedCalls: {
            function: "getLocoMUId";
            args: {
                locoId: string;
                locos: string;
            };
        }[];
        returns: string;
        readTheseFields: string[];
        followUpQuestion: string;
        safety: "maintenance_only";
        notes: string;
        triggerPhrases: string[];
        exampleQuestions: string[];
    };
};
export type IntentId = keyof typeof INTENT_CATALOG;
export declare const ALL_INTENTS: IntentId[];
/** Convenience lists */
export declare const SAFE_INTENTS: IntentId[];
export declare const MAINTENANCE_INTENTS: IntentId[];
/**
 * Optional runtime validator you can call in dev/test to ensure
 * there are no stray function names in recommendedCalls.
 */
export declare function validateIntentCatalog(): void;
