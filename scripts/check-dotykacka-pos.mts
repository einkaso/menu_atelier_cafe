import { DotykackaClient } from "../lib/dotykacka/client";
import { getDotykackaConfig } from "../lib/dotykacka/config";

const config = await getDotykackaConfig();
if (!config.branchId) throw new Error("Nie wybrano oddziału Dotykački.");
const response = await new DotykackaClient(config).posAction({ action: "order/hello" });
if (response.code !== 0) throw new Error(response.localizedMessage || response.message || `POS hello failed (${response.code})`);
console.log(JSON.stringify({ status: "ok", branchConfigured: true, registerReachable: true }));
