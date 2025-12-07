import path from "path";
import { fileURLToPath } from "url";

const __dirnameResolved = typeof __dirname === "undefined"
  ? path.dirname(fileURLToPath(import.meta.url))
  : __dirname;

// Подключаем сертификаты Минцифры
process.env.NODE_EXTRA_CA_CERTS = path.resolve(
  __dirnameResolved,
  "certs",
  "russian_trusted_root_ca_pem.crt"
);

// ⚠️ Replit иногда не поддерживает ГОСТ TLS. 
// Если будут ошибки CERT_VERIFY_FAILED — включим fallback.
if (!process.env.DISABLE_TLS_REJECT_UNAUTHORIZED) {
  console.log("[Certs] TLS verification enabled.");
} else {
  console.log("[Certs] TLS verification DISABLED (NOT secure).");
}
