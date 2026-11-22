import { grantAdministrator } from "../src/lib/access-store";

async function main() {
  const address = process.argv[2];
  if (!address) throw new Error("Uso: npm run access:admin -- correo@ejemplo.com");
  await grantAdministrator(address);
  console.log("Acceso administrativo configurado. La cuenta debe iniciar sesión con su correo verificado en Clerk.");
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
