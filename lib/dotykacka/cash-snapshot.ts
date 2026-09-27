import "server-only";
import { businessDayStart, reportPaymentTotals, type CashSnapshot } from "../cash-day";
import { DotykackaClient } from "./client";
import { getDotykackaConfig } from "./config";

export async function fetchCashSnapshot(businessDate: string): Promise<CashSnapshot> {
  const capturedAt = new Date();
  const config = await getDotykackaConfig();
  if (!config.branchId) throw new Error("W konfiguracji Dotykački nie wybrano oddziału.");
  const periodFrom = businessDayStart(businessDate);
  const report = await new DotykackaClient(config).salesReportRange(periodFrom, capturedAt);
  if (!report) throw new Error("Dotykačka nie zwróciła raportu sprzedaży dla wybranego oddziału.");
  const totals = reportPaymentTotals(report);
  return {
    ...totals,
    capturedAt: capturedAt.toISOString(),
    periodFrom: periodFrom.toISOString(),
    periodTo: capturedAt.toISOString(),
  };
}
