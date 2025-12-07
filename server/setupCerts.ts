import path from "path";
import fs from "fs";

// Определяем путь к сертификатам
function getCertPath(): string {
  const prodPath = path.join(process.cwd(), "dist/certs/russian_trusted_root_ca_pem.crt");
  if (fs.existsSync(prodPath)) return prodPath;
  const devPath = path.join(process.cwd(), "server/certs/russian_trusted_root_ca_pem.crt");
  if (fs.existsSync(devPath)) return devPath;
  return prodPath;
}

// Подключаем сертификаты Минцифры
process.env.NODE_EXTRA_CA_CERTS = getCertPath();

// ⚠️ Replit иногда не поддерживает ГОСТ TLS. 
// Если будут ошибки CERT_VERIFY_FAILED — включим fallback.
if (!process.env.DISABLE_TLS_REJECT_UNAUTHORIZED) {
  console.log("[Certs] TLS verification enabled.");
} else {
  console.log("[Certs] TLS verification DISABLED (NOT secure).");
}
