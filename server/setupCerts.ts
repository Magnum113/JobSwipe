import path from "path";

// Подключаем сертификаты Минцифры
process.env.NODE_EXTRA_CA_CERTS = path.resolve(
  __dirname,
  "certs",
  "russian_trusted_root_ca_pem.crt"
);

// ⚠️ Replit иногда не поддерживает ГОСТ TLS. 
// Если будут ошибки CERT_VERIFY_FAILED — включим fallback.
if (!process.env.DISABLE_TLS_REJECT_UNAUTHORIZED) {
  console.log("[Certs] TLS verification enabled.");
} else {
  console.log("[Certs] TLS verification DISABLED (NOT secure).");
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
