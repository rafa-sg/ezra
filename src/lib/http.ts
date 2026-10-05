import { WorkflowError } from "./workflow";
export function apiError(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Ocurrió un error inesperado." },
    { status: error instanceof WorkflowError ? error.status : 500 },
  );
}
