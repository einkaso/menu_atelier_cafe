import { boolean, date, index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const menuCategories = pgTable("menu_categories", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  name: text("name").notNull(),
  display: boolean("display").notNull().default(true),
  sortOrder: integer("sort_order"),
  menuSortOrder: integer("menu_sort_order"),
  shelfSortOrder: integer("shelf_sort_order"),
  showCatalogCodes: boolean("show_catalog_codes"),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("menu_categories_dotykacka_id_uq").on(table.dotykackaId)]);

export const menuProducts = pgTable("menu_products", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  dotykackaCategoryId: text("dotykacka_category_id"),
  name: text("name").notNull(),
  wineCode: text("wine_code"),
  catalogCode: text("catalog_code"),
  pluCodes: jsonb("plu_codes").$type<string[]>().notNull().default([]),
  licenseCodes: jsonb("license_codes").$type<string[]>().notNull().default([]),
  dotykackaSupplierId: text("dotykacka_supplier_id"),
  supplierDetectedAt: timestamp("supplier_detected_at", { withTimezone: true }),
  supplierProductCode: text("supplier_product_code"),
  eanCodes: jsonb("ean_codes").$type<string[]>().notNull().default([]),
  sourceDescription: text("source_description"),
  priceWithVat: numeric("price_with_vat", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("PLN"),
  display: boolean("display").notNull().default(true),
  deleted: boolean("deleted").notNull().default(false),
  stockDeduct: boolean("stock_deduct").notNull().default(false),
  stockOverdraft: text("stock_overdraft").notNull().default("ALLOW"),
  stockQuantity: numeric("stock_quantity", { precision: 14, scale: 3 }),
  stockUnit: text("stock_unit"),
  salesCount30d: numeric("sales_count_30d", { precision: 14, scale: 3 }).notNull().default("0"),
  salesSyncedAt: timestamp("sales_synced_at", { withTimezone: true }),
  sourceSortOrder: integer("source_sort_order"),
  menuSortOrder: integer("menu_sort_order"),
  menuGroup: text("menu_group"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  allergens: jsonb("allergens").$type<number[]>().notNull().default([]),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  menuTagged: boolean("menu_tagged").notNull().default(false),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("menu_products_dotykacka_id_uq").on(table.dotykackaId)]);

export const menuGroupOrders = pgTable("menu_group_orders", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => menuCategories.id, { onDelete: "cascade" }),
  groupName: text("group_name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("menu_group_orders_category_group_uq").on(table.categoryId, table.groupName)]);

export const menuOfferSettings = pgTable("menu_offer_settings", {
  key: text("key").primaryKey().default("main"),
  season: text("season"),
  specialEnabled: boolean("special_enabled").notNull().default(false),
  specialNamePl: text("special_name_pl"),
  specialNameEn: text("special_name_en"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("suppliers_dotykacka_id_uq").on(table.dotykackaId)]);

export const productContent = pgTable("product_content", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => menuProducts.id, { onDelete: "cascade" }),
  nameEn: text("name_en"),
  descriptionPl: text("description_pl"),
  descriptionEn: text("description_en"),
  countryEn: text("country_en"),
  regionEn: text("region_en"),
  wineStyleEn: text("wine_style_en"),
  tastingNotesEn: text("tasting_notes_en"),
  autoTranslate: boolean("auto_translate").notNull().default(true),
  translationSourceHash: text("translation_source_hash"),
  imagePath: text("image_path"),
  galleryPaths: jsonb("gallery_paths").$type<string[]>().notNull().default([]),
  imageSourceUrl: text("image_source_url"),
  detailBackdropPath: text("detail_backdrop_path"),
  detailBackdropSourceUrl: text("detail_backdrop_source_url"),
  featured: boolean("featured").notNull().default(false),
  featuredSortOrder: integer("featured_sort_order"),
  contentApproved: boolean("content_approved").notNull().default(false),
  hideWhenOutOfStock: boolean("hide_when_out_of_stock").notNull().default(false),
  manualHidden: boolean("manual_hidden").notNull().default(false),
  waiterVisibilityOverride: boolean("waiter_visibility_override"),
  country: text("country"),
  region: text("region"),
  grapes: text("grapes"),
  wineStyle: text("wine_style"),
  wineColor: text("wine_color"),
  sparklingType: text("sparkling_type").$type<"SPARKLING" | "NATURALLY_SPARKLING">(),
  sweetness: text("sweetness"),
  veganStatus: text("vegan_status").notNull().default("UNKNOWN"),
  tastingNotes: text("tasting_notes"),
  attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
  staffInstructions: text("staff_instructions"),
  staffMedia: jsonb("staff_media").$type<StaffManualMedia[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("product_content_product_id_uq").on(table.productId)]);

export type StaffManualMedia = {
  id: string;
  path: string;
  type: "IMAGE" | "VIDEO";
  name: string;
};

export type WineSourceProposal = {
  descriptionPl?: string | null;
  imageSourceUrl?: string | null;
  country?: string | null;
  region?: string | null;
  grapes?: string | null;
  wineStyle?: string | null;
  wineColor?: string | null;
  sparklingType?: "SPARKLING" | "NATURALLY_SPARKLING" | null;
  sweetness?: string | null;
  veganStatus?: "YES" | "NO" | "UNKNOWN" | null;
  tastingNotes?: string | null;
  attributes?: Record<string, string>;
  sourceUrls?: string[];
  imageCandidates?: Array<{ url: string; sourceUrl: string; label?: string }>;
};

export const wineSources = pgTable("wine_sources", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => menuProducts.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  fingerprint: text("fingerprint").notNull(),
  sourceUrl: text("source_url"),
  sourceKind: text("source_kind").notNull().default("DOTYKACKA"),
  ean: text("ean"),
  supplierProductCode: text("supplier_product_code"),
  proposedContent: jsonb("proposed_content").$type<WineSourceProposal>(),
  status: text("status").notNull().default("PENDING"),
  decision: text("decision"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (table) => [uniqueIndex("wine_sources_product_fingerprint_uq").on(table.productId, table.fingerprint)]);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(),
  productsSeen: integer("products_seen").notNull().default(0),
  productsImported: integer("products_imported").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const dotykackaConnections = pgTable("dotykacka_connections", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("dotykacka"),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  cloudId: text("cloud_id").notNull(),
  warehouseId: text("warehouse_id"),
  branchId: text("branch_id"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("dotykacka_connections_provider_uq").on(table.provider)]);

export const dotykackaStockEvents = pgTable("dotykacka_stock_events", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  cloudId: text("cloud_id"),
  warehouseId: text("warehouse_id"),
  dotykackaProductId: text("dotykacka_product_id"),
  dotykackaSupplierId: text("dotykacka_supplier_id"),
  quantity: numeric("quantity", { precision: 14, scale: 3 }),
  eventType: text("event_type"),
  status: text("status").notNull().default("RECEIVED"),
  rawPayload: jsonb("raw_payload").$type<unknown>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
}, (table) => [uniqueIndex("dotykacka_stock_events_fingerprint_uq").on(table.fingerprint)]);

export const menuAddons = pgTable("menu_addons", {
  id: serial("id").primaryKey(),
  parentDotykackaId: text("parent_dotykacka_id").notNull(),
  customizationDotykackaId: text("customization_dotykacka_id"),
  addonDotykackaId: text("addon_dotykacka_id").notNull(),
  groupName: text("group_name"),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  descriptionPl: text("description_pl"),
  descriptionEn: text("description_en"),
  priceWithVat: numeric("price_with_vat", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("PLN"),
  sortOrder: integer("sort_order"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("menu_addons_parent_addon_uq").on(table.parentDotykackaId, table.addonDotykackaId)]);

export const waiterEmployees = pgTable("waiter_employees", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  deleted: boolean("deleted").notNull().default(false),
  accessLevel: text("access_level"),
  requirePinAlways: boolean("require_pin_always").notNull().default(false),
  canManageMenuVisibility: boolean("can_manage_menu_visibility").notNull().default(false),
  pinHash: text("pin_hash"),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("waiter_employees_dotykacka_id_uq").on(table.dotykackaId)]);

export const menuVisibilityEvents = pgTable("menu_visibility_events", {
  id: serial("id").primaryKey(),
  productId: integer("product_id"),
  productDotykackaId: text("product_dotykacka_id").notNull(),
  productName: text("product_name").notNull(),
  categoryName: text("category_name").notNull(),
  previousVisible: boolean("previous_visible").notNull(),
  visible: boolean("visible").notNull(),
  reason: text("reason").notNull(),
  employeeDotykackaId: text("employee_dotykacka_id").notNull(),
  employeeName: text("employee_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("menu_visibility_events_created_idx").on(table.createdAt),
  index("menu_visibility_events_employee_idx").on(table.employeeDotykackaId),
  index("menu_visibility_events_product_idx").on(table.productDotykackaId),
]);

export const waiterEmployeeThankYouMedia = pgTable("waiter_employee_thank_you_media", {
  id: serial("id").primaryKey(),
  employeeDotykackaId: text("employee_dotykacka_id").notNull(),
  mediaPath: text("media_path").notNull(),
  mediaType: text("media_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("waiter_employee_thanks_employee_idx").on(table.employeeDotykackaId),
  uniqueIndex("waiter_employee_thanks_media_path_uq").on(table.mediaPath),
]);

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  employeeDotykackaId: text("employee_dotykacka_id").notNull(),
  employeeName: text("employee_name").notNull(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("admin_users_employee_dotykacka_id_uq").on(table.employeeDotykackaId),
  uniqueIndex("admin_users_username_uq").on(table.username),
  index("admin_users_enabled_idx").on(table.enabled),
]);

export const waiterTables = pgTable("waiter_tables", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  name: text("name").notNull(),
  display: boolean("display").notNull().default(true),
  deleted: boolean("deleted").notNull().default(false),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("waiter_tables_dotykacka_id_uq").on(table.dotykackaId)]);

export const waiterExtraProducts = pgTable("waiter_extra_products", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  categorySortOrder: integer("category_sort_order"),
  productSortOrder: integer("product_sort_order"),
  priceWithVat: numeric("price_with_vat", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("PLN"),
  stockDeduct: boolean("stock_deduct").notNull().default(false),
  stockOverdraft: text("stock_overdraft").notNull().default("ALLOW"),
  stockQuantity: numeric("stock_quantity", { precision: 14, scale: 3 }),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("waiter_extra_products_dotykacka_id_uq").on(table.dotykackaId)]);

export type WaiterOrderItem = {
  productId: string;
  localProductId: number;
  name: string;
  quantity: number;
  unitPrice: string;
  note?: string;
  customizations?: Array<{ customizationId: string; productId: string; name: string; price: string }>;
};

export type WaiterSurveyAnswer = {
  questionId: number;
  question: string;
  answer: string;
};

export const waiterSurveyQuestions = pgTable("waiter_survey_questions", {
  id: serial("id").primaryKey(),
  prompt: text("prompt").notNull(),
  kind: text("kind").notNull().default("YES_NO"),
  options: jsonb("options").$type<string[]>().notNull().default([]),
  required: boolean("required").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const waiterOrders = pgTable("waiter_orders", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull(),
  employeeDotykackaId: text("employee_dotykacka_id").notNull(),
  tableDotykackaId: text("table_dotykacka_id").notNull(),
  guestCount: integer("guest_count").notNull().default(1),
  note: text("note"),
  items: jsonb("items").$type<WaiterOrderItem[]>().notNull(),
  surveyAnswers: jsonb("survey_answers").$type<WaiterSurveyAnswer[]>().notNull().default([]),
  status: text("status").notNull().default("DRAFT"),
  dotykackaOrderId: text("dotykacka_order_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [uniqueIndex("waiter_orders_external_id_uq").on(table.externalId)]);

export type GuestSurveyAnswer = { questionId: number; question: string; answer: string };

export const guestSurveyQuestions = pgTable("guest_survey_questions", {
  id: serial("id").primaryKey(),
  prompt: text("prompt").notNull(),
  kind: text("kind").notNull().default("SINGLE_CHOICE"),
  options: jsonb("options").$type<string[]>().notNull().default([]),
  required: boolean("required").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guestSurveyResponses = pgTable("guest_survey_responses", {
  id: serial("id").primaryKey(),
  dotykackaOrderId: text("dotykacka_order_id").notNull(),
  documentNumber: text("document_number").notNull(),
  tableDotykackaId: text("table_dotykacka_id"),
  presentedByEmployeeDotykackaId: text("presented_by_employee_dotykacka_id").notNull(),
  answers: jsonb("answers").$type<GuestSurveyAnswer[]>().notNull().default([]),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("guest_survey_responses_order_uq").on(table.dotykackaOrderId)]);

export type WaiterSettlementCorrection = {
  direction: "CARD_TO_CASH" | "CASH_TO_CARD";
  amount: string;
  reason: string;
};

export type WaiterSettlementExpense = {
  description: string;
  amount: string;
  receiptNumber?: string;
  receiptIncluded: boolean;
};

export type WaiterSettlementTip = {
  key: string;
  paymentMethod: "CASH" | "CARD";
  amount: string;
  note?: string;
  allocations: Array<{ employeeDotykackaId: string; employeeName: string; amount: string }>;
};

export type WaiterCashPaymentSnapshot = Array<{
  typeId: number;
  count: number;
  total: string;
  currency: string | null;
}>;

export const waiterCashDays = pgTable("waiter_cash_days", {
  id: serial("id").primaryKey(),
  businessDate: date("business_date").notNull(),
  cashDesk: text("cash_desk").notNull(),
  status: text("status").notNull().default("OPEN"),
  expectedOpeningCash: numeric("expected_opening_cash", { precision: 12, scale: 2 }).notNull(),
  countedOpeningCash: numeric("counted_opening_cash", { precision: 12, scale: 2 }).notNull(),
  openingDifference: numeric("opening_difference", { precision: 12, scale: 2 }).notNull(),
  openingNote: text("opening_note"),
  openingPosCash: numeric("opening_pos_cash", { precision: 12, scale: 2 }).notNull(),
  openingPosCard: numeric("opening_pos_card", { precision: 12, scale: 2 }).notNull(),
  openingSnapshotAt: timestamp("opening_snapshot_at", { withTimezone: true }).notNull(),
  openingSnapshotFrom: timestamp("opening_snapshot_from", { withTimezone: true }).notNull(),
  openingSnapshotDetails: jsonb("opening_snapshot_details").$type<WaiterCashPaymentSnapshot>().notNull().default([]),
  carryoverCashDayId: integer("carryover_cash_day_id"),
  carryoverDeclaredByDotykackaId: text("carryover_declared_by_dotykacka_id"),
  carryoverDeclaredByName: text("carryover_declared_by_name"),
  carryoverDeclaredAt: timestamp("carryover_declared_at", { withTimezone: true }),
  openedByDotykackaId: text("opened_by_dotykacka_id").notNull(),
  openedByName: text("opened_by_name").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  finalCashLeft: numeric("final_cash_left", { precision: 12, scale: 2 }),
  closedByDotykackaId: text("closed_by_dotykacka_id"),
  closedByName: text("closed_by_name"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("waiter_cash_days_date_desk_uq").on(table.businessDate, table.cashDesk),
  index("waiter_cash_days_status_idx").on(table.status),
]);

export const waiterSettlements = pgTable("waiter_settlements", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull(),
  businessDate: date("business_date").notNull(),
  shiftName: text("shift_name").notNull(),
  cashDesk: text("cash_desk").notNull(),
  cashDayId: integer("cash_day_id").references(() => waiterCashDays.id, { onDelete: "restrict" }),
  checkpointType: text("checkpoint_type").notNull().default("LEGACY"),
  priorSettlementId: integer("prior_settlement_id"),
  employeeDotykackaId: text("employee_dotykacka_id").notNull(),
  employeeName: text("employee_name").notNull(),
  openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).notNull(),
  posCash: numeric("pos_cash", { precision: 12, scale: 2 }).notNull(),
  posCard: numeric("pos_card", { precision: 12, scale: 2 }).notNull(),
  terminalCard: numeric("terminal_card", { precision: 12, scale: 2 }).notNull(),
  countedCash: numeric("counted_cash", { precision: 12, scale: 2 }).notNull(),
  cashLeft: numeric("cash_left", { precision: 12, scale: 2 }).notNull(),
  envelopeCash: numeric("envelope_cash", { precision: 12, scale: 2 }).notNull(),
  envelopeNumber: text("envelope_number"),
  corrections: jsonb("corrections").$type<WaiterSettlementCorrection[]>().notNull().default([]),
  expenses: jsonb("expenses").$type<WaiterSettlementExpense[]>().notNull().default([]),
  tips: jsonb("tips").$type<WaiterSettlementTip[]>().notNull().default([]),
  expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }).notNull(),
  cashDifference: numeric("cash_difference", { precision: 12, scale: 2 }).notNull(),
  expectedTerminal: numeric("expected_terminal", { precision: 12, scale: 2 }).notNull(),
  terminalDifference: numeric("terminal_difference", { precision: 12, scale: 2 }).notNull(),
  expensesTotal: numeric("expenses_total", { precision: 12, scale: 2 }).notNull(),
  tipsTotal: numeric("tips_total", { precision: 12, scale: 2 }).notNull(),
  posSnapshotCash: numeric("pos_snapshot_cash", { precision: 12, scale: 2 }),
  posSnapshotCard: numeric("pos_snapshot_card", { precision: 12, scale: 2 }),
  posSnapshotAt: timestamp("pos_snapshot_at", { withTimezone: true }),
  posSnapshotFrom: timestamp("pos_snapshot_from", { withTimezone: true }),
  posSnapshotDetails: jsonb("pos_snapshot_details").$type<WaiterCashPaymentSnapshot>().notNull().default([]),
  discrepancyNote: text("discrepancy_note"),
  employeeNote: text("employee_note"),
  status: text("status").notNull().default("SUBMITTED"),
  adminNote: text("admin_note"),
  verifiedBy: text("verified_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("waiter_settlements_external_id_uq").on(table.externalId),
  index("waiter_settlements_business_date_idx").on(table.businessDate),
  index("waiter_settlements_employee_idx").on(table.employeeDotykackaId),
  index("waiter_settlements_cash_day_idx").on(table.cashDayId),
]);

export const waiterTipAllocations = pgTable("waiter_tip_allocations", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull().references(() => waiterSettlements.id, { onDelete: "cascade" }),
  tipKey: text("tip_key").notNull(),
  employeeDotykackaId: text("employee_dotykacka_id").notNull(),
  employeeName: text("employee_name").notNull(),
  paymentMethod: text("payment_method").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  payoutStatus: text("payout_status").notNull().default("DUE"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("waiter_tip_allocations_employee_idx").on(table.employeeDotykackaId),
  index("waiter_tip_allocations_settlement_idx").on(table.settlementId),
]);

export const waiterTipAdjustments = pgTable("waiter_tip_adjustments", {
  id: serial("id").primaryKey(),
  employeeDotykackaId: text("employee_dotykacka_id").notNull(),
  employeeName: text("employee_name").notNull(),
  businessDate: date("business_date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  payoutStatus: text("payout_status").notNull().default("DUE"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedBy: text("voided_by"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("waiter_tip_adjustments_employee_idx").on(table.employeeDotykackaId),
  index("waiter_tip_adjustments_date_idx").on(table.businessDate),
  index("waiter_tip_adjustments_status_idx").on(table.payoutStatus),
]);

export const waiterSettlementEvents = pgTable("waiter_settlement_events", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull().references(() => waiterSettlements.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("waiter_settlement_events_settlement_idx").on(table.settlementId)]);

export const inventoryCatalogCategories = pgTable("inventory_catalog_categories", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  name: text("name").notNull(),
  display: boolean("display").notNull().default(true),
  deleted: boolean("deleted").notNull().default(false),
  sortOrder: integer("sort_order"),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("inventory_catalog_categories_dotykacka_id_uq").on(table.dotykackaId)]);

export const inventoryCatalogProducts = pgTable("inventory_catalog_products", {
  id: serial("id").primaryKey(),
  dotykackaId: text("dotykacka_id").notNull(),
  categoryDotykackaId: text("category_dotykacka_id"),
  name: text("name").notNull(),
  display: boolean("display").notNull().default(true),
  deleted: boolean("deleted").notNull().default(false),
  stockDeduct: boolean("stock_deduct").notNull().default(false),
  inventoryTracked: boolean("inventory_tracked").notNull().default(false),
  inventoryCountingMode: text("inventory_counting_mode").notNull().default("QUANTITY"),
  servingsPerContainer: integer("servings_per_container"),
  stockQuantity: numeric("stock_quantity", { precision: 14, scale: 3 }),
  unit: text("unit"),
  priceWithVat: numeric("price_with_vat", { precision: 12, scale: 2 }),
  eanCodes: jsonb("ean_codes").$type<string[]>().notNull().default([]),
  pluCodes: jsonb("plu_codes").$type<string[]>().notNull().default([]),
  wineCode: text("wine_code"),
  catalogCode: text("catalog_code"),
  imageSourceUrl: text("image_source_url"),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("inventory_catalog_products_dotykacka_id_uq").on(table.dotykackaId),
  index("inventory_catalog_products_category_idx").on(table.categoryDotykackaId),
]);

export const inventoryStages = pgTable("inventory_stages", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("ASSIGNED"),
  categoryDotykackaId: text("category_dotykacka_id").notNull(),
  categoryName: text("category_name").notNull(),
  assignedEmployeeDotykackaId: text("assigned_employee_dotykacka_id").notNull(),
  assignedEmployeeName: text("assigned_employee_name").notNull(),
  locations: jsonb("locations").$type<string[]>().notNull().default([]),
  dueAt: timestamp("due_at", { withTimezone: true }),
  expectedSnapshotAt: timestamp("expected_snapshot_at", { withTimezone: true }).notNull(),
  workerNote: text("worker_note"),
  adminNote: text("admin_note"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("inventory_stages_external_id_uq").on(table.externalId),
  index("inventory_stages_status_idx").on(table.status),
  index("inventory_stages_employee_status_idx").on(table.assignedEmployeeDotykackaId, table.status),
  index("inventory_stages_category_created_idx").on(table.categoryDotykackaId, table.createdAt),
]);

export const inventoryStageItems = pgTable("inventory_stage_items", {
  id: serial("id").primaryKey(),
  stageId: integer("stage_id").notNull().references(() => inventoryStages.id, { onDelete: "cascade" }),
  productLocalId: integer("product_local_id"),
  productDotykackaId: text("product_dotykacka_id").notNull(),
  productName: text("product_name").notNull(),
  imagePath: text("image_path"),
  eanCodes: jsonb("ean_codes").$type<string[]>().notNull().default([]),
  pluCodes: jsonb("plu_codes").$type<string[]>().notNull().default([]),
  wineCode: text("wine_code"),
  catalogCode: text("catalog_code"),
  unit: text("unit").notNull().default("szt."),
  countingMode: text("counting_mode").notNull().default("QUANTITY"),
  servingsPerContainer: integer("servings_per_container"),
  expectedQuantity: numeric("expected_quantity", { precision: 14, scale: 3 }).notNull(),
  countedQuantity: numeric("counted_quantity", { precision: 14, scale: 3 }),
  referencePrice: numeric("reference_price", { precision: 12, scale: 2 }),
  countStatus: text("count_status").notNull().default("PENDING"),
  reasonCode: text("reason_code"),
  workerNote: text("worker_note"),
  adminNote: text("admin_note"),
  countedAt: timestamp("counted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("inventory_stage_items_stage_product_uq").on(table.stageId, table.productDotykackaId),
  index("inventory_stage_items_stage_idx").on(table.stageId),
  index("inventory_stage_items_product_idx").on(table.productDotykackaId),
]);

export const inventoryCountEntries = pgTable("inventory_count_entries", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => inventoryStageItems.id, { onDelete: "cascade" }),
  location: text("location").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  wholeContainers: integer("whole_containers"),
  looseServings: integer("loose_servings"),
  note: text("note"),
  createdByDotykackaId: text("created_by_dotykacka_id"),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("inventory_count_entries_item_idx").on(table.itemId)]);

export const inventoryEvents = pgTable("inventory_events", {
  id: serial("id").primaryKey(),
  stageId: integer("stage_id").notNull().references(() => inventoryStages.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("inventory_events_stage_created_idx").on(table.stageId, table.createdAt)]);

export type InventoryExportPayload = {
  note: string;
  stockTakingDate: string;
  items: Array<{ _productId: number; quantity: number }>;
};

export const inventoryExports = pgTable("inventory_exports", {
  id: serial("id").primaryKey(),
  stageId: integer("stage_id").notNull().references(() => inventoryStages.id, { onDelete: "restrict" }),
  externalId: text("external_id").notNull(),
  status: text("status").notNull().default("READY"),
  payload: jsonb("payload").$type<InventoryExportPayload>().notNull(),
  payloadHash: text("payload_hash").notNull(),
  stockTransactionId: text("stock_transaction_id"),
  statusWebhookUrl: text("status_webhook_url"),
  error: text("error"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("inventory_exports_stage_uq").on(table.stageId),
  uniqueIndex("inventory_exports_external_id_uq").on(table.externalId),
  index("inventory_exports_status_idx").on(table.status),
]);
