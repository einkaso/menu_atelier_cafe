export type CaldavCredentials = { username: string; password: string };

function safeIcloudUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (host !== "caldav.icloud.com" && !host.endsWith("-caldav.icloud.com"))) {
    throw new Error("Połączenie zapisu musi prowadzić do bezpiecznego serwera kalendarza iCloud.");
  }
  return url;
}

function xmlText(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

function property(block: string, name: string) {
  const expression = new RegExp(`<(?:(?:[\\w.-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${name}>`, "i");
  return xmlText(block.match(expression)?.[1]?.replace(/<[^>]+>/g, "") ?? "");
}

function nestedProperty(block: string, parent: string, child: string) {
  const expression = new RegExp(`<(?:(?:[\\w.-]+):)?${parent}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${parent}>`, "i");
  return property(block.match(expression)?.[1] ?? "", child);
}

function responses(xml: string) {
  return xml.match(/<(?:[\w.-]+:)?response\b[\s\S]*?<\/(?:[\w.-]+:)?response>/gi) ?? [];
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function isCalendarResponse(block: string) {
  const resourceType = block.match(/<(?:[\w.-]+:)?resourcetype\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?resourcetype>/i)?.[1] ?? "";
  return /<(?:[\w.-]+:)?calendar(?=[\s/>])[^>]*\/?>/i.test(resourceType);
}

export async function caldavRequest(urlValue: string, credentials: CaldavCredentials, init: RequestInit) {
  const url = safeIcloudUrl(urlValue);
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      ...(init.headers ?? {}),
    },
  });
  safeIcloudUrl(response.url);
  if (response.status === 401 || response.status === 403) throw new Error("iCloud odrzucił dane logowania. Użyj hasła przeznaczonego dla aplikacji.");
  return response;
}

async function propfind(url: string, credentials: CaldavCredentials, depth: "0" | "1", body: string) {
  const response = await caldavRequest(url, credentials, {
    method: "PROPFIND",
    headers: { depth, "content-type": "application/xml; charset=utf-8" },
    body,
  });
  if (response.status !== 207) throw new Error(`iCloud nie udostępnił kalendarza (błąd ${response.status}).`);
  return { xml: await response.text(), url: response.url };
}

export async function discoverIcloudCalendar(username: string, password: string, requestedName: string) {
  const credentials = { username: username.trim(), password: password.trim() };
  const calendarName = requestedName.trim();
  if (!credentials.username || !credentials.password || !calendarName) throw new Error("Podaj konto Apple, hasło dla aplikacji i nazwę kalendarza.");

  const principalResult = await propfind("https://caldav.icloud.com/", credentials, "0", `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`);
  const principalHref = nestedProperty(principalResult.xml, "current-user-principal", "href");
  if (!principalHref) throw new Error("iCloud nie zwrócił adresu konta kalendarza.");
  const principalUrl = new URL(principalHref, principalResult.url).toString();

  const homeResult = await propfind(principalUrl, credentials, "0", `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`);
  const homeHref = nestedProperty(homeResult.xml, "calendar-home-set", "href");
  if (!homeHref) throw new Error("iCloud nie zwrócił listy kalendarzy.");
  const homeUrl = new URL(homeHref, homeResult.url).toString();

  const calendarsResult = await propfind(homeUrl, credentials, "1", `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>`);
  const calendars = responses(calendarsResult.xml).filter(isCalendarResponse).map((block) => ({
    name: property(block, "displayname"),
    href: property(block, "href"),
  })).filter((item) => item.name && item.href);
  const calendar = calendars.find((item) => item.name.localeCompare(calendarName, "pl", { sensitivity: "base" }) === 0);
  if (!calendar) {
    const available = calendars.map((item) => item.name).slice(0, 8).join(", ");
    throw new Error(available ? `Nie znaleziono kalendarza „${calendarName}”. Dostępne: ${available}.` : "Na tym koncie iCloud nie znaleziono kalendarzy.");
  }
  return { username: credentials.username, password: credentials.password, calendarName: calendar.name, calendarUrl: new URL(calendar.href, calendarsResult.url).toString() };
}

export async function findIcloudEventUrl(calendarUrl: string, credentials: CaldavCredentials, uid: string) {
  const response = await caldavRequest(calendarUrl, credentials, {
    method: "REPORT",
    headers: { depth: "1", "content-type": "application/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="UTF-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:prop-filter name="UID"><c:text-match collation="i;octet">${xmlEscape(uid)}</c:text-match></c:prop-filter></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
  });
  if (response.status !== 207) throw new Error(`iCloud nie odnalazł wydarzenia do edycji (błąd ${response.status}).`);
  const xml = await response.text();
  const block = responses(xml).find((item) => property(item, "calendar-data").includes(`UID:${uid}`));
  const href = block ? property(block, "href") : "";
  return href ? new URL(href, response.url).toString() : null;
}
