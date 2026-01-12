/**
 * Guards module - safety enforcement
 */

export {
  CatalogGuard,
  createCatalogGuard,
  validateAgainstCatalog,
  type CatalogGuardConfig,
  type FunctionCatalogJson as CatalogFunctionCatalogJson,
  type ValidationError,
  type GuardResult,
} from "./catalogGuard";

export {
  FieldGuard,
  createFieldGuard,
  validateFieldsAgainstCatalog,
  type FieldGuardConfig,
  type FunctionCatalogJson as FieldFunctionCatalogJson,
  type FieldValidationError,
  type FieldGuardResult,
} from "./fieldGurad";
