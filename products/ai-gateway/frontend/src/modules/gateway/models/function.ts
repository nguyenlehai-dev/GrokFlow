export interface GwFunction {
  id: string;
  code: string;
  name: string;
  function_type: string;
  description: string | null;
  status: string;
  created_at: string;
}

/** Lighter projection used by dropdowns. */
export interface GwFunctionRef {
  id: string;
  code: string;
  name: string;
  function_type?: string;
}
