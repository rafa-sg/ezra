import { configureOwner } from "../src/lib/access-store";

const address = process.argv[2];
if (!address) throw new Error("Uso: npm run access:owner -- correo@ejemplo.com");
configureOwner(address)
  .then(() => {
    console.log(
      "Correo del propietario configurado. Inicia sesión y verifícalo en Clerk para abrir Mi panel.",
    );
  })
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
