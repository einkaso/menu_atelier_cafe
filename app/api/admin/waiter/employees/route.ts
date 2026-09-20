import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { adminUsers, waiterEmployees, waiterEmployeeThankYouMedia, waiterSurveyQuestions, waiterTables } from "../../../../../db/schema";
import { isAdmin } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [employees, administrators, tables, surveyQuestions, thankYouMedia] = await Promise.all([
    getDb().select({
      dotykackaId: waiterEmployees.dotykackaId,
      name: waiterEmployees.name,
      enabled: waiterEmployees.enabled,
      deleted: waiterEmployees.deleted,
      accessLevel: waiterEmployees.accessLevel,
      canManageMenuVisibility: waiterEmployees.canManageMenuVisibility,
      pinHash: waiterEmployees.pinHash,
      syncedAt: waiterEmployees.syncedAt,
    }).from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).orderBy(asc(waiterEmployees.name)),
    getDb().select({
      employeeDotykackaId: adminUsers.employeeDotykackaId,
      username: adminUsers.username,
      enabled: adminUsers.enabled,
      lastLoginAt: adminUsers.lastLoginAt,
    }).from(adminUsers),
    getDb().select({
      dotykackaId: waiterTables.dotykackaId,
      name: waiterTables.name,
      display: waiterTables.display,
      deleted: waiterTables.deleted,
      syncedAt: waiterTables.syncedAt,
    }).from(waiterTables).orderBy(asc(waiterTables.name)),
    getDb().select().from(waiterSurveyQuestions).orderBy(asc(waiterSurveyQuestions.sortOrder), asc(waiterSurveyQuestions.id)),
    getDb().select({
      id: waiterEmployeeThankYouMedia.id,
      employeeDotykackaId: waiterEmployeeThankYouMedia.employeeDotykackaId,
      mediaPath: waiterEmployeeThankYouMedia.mediaPath,
      mediaType: waiterEmployeeThankYouMedia.mediaType,
    }).from(waiterEmployeeThankYouMedia).orderBy(asc(waiterEmployeeThankYouMedia.id)),
  ]);
  const adminByEmployee = new Map(administrators.map((administrator) => [administrator.employeeDotykackaId, administrator]));
  const mediaByEmployee = new Map<string, typeof thankYouMedia>();
  for (const media of thankYouMedia) mediaByEmployee.set(media.employeeDotykackaId, [...(mediaByEmployee.get(media.employeeDotykackaId) ?? []), media]);
  return Response.json({
    employees: employees.map(({ pinHash, ...employee }) => {
      const administrator = adminByEmployee.get(employee.dotykackaId);
      return {
        ...employee,
        pinConfigured: Boolean(pinHash),
        adminConfigured: Boolean(administrator?.enabled),
        adminUsername: administrator?.username ?? null,
        adminLastLoginAt: administrator?.lastLoginAt ?? null,
        thankYouMedia: mediaByEmployee.get(employee.dotykackaId) ?? [],
      };
    }),
    tables,
    surveyQuestions,
    posActionsEnabled: process.env.WAITER_POS_ACTIONS_ENABLED === "true",
  });
}
