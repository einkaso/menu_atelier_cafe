export const DEFAULT_EMPLOYEE_THANK_YOU = "Dziękuję i zapraszam ponownie!";

export function employeeThankYouMessage(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_EMPLOYEE_THANK_YOU;
  const message = value.trim();
  if (message.length < 3 || message.length > 280) throw new Error("Treść podziękowania musi mieć od 3 do 280 znaków.");
  return message;
}
