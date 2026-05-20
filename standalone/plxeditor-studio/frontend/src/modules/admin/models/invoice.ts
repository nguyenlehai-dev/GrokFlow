export interface Invoice {
  id: string;
  subscription_id: string | null;
  payment_id: string | null;
  invoice_number: string;
  amount: number | string;
  tax: number | string;
  total: number | string;
  currency: string;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
  line_items: any[];
  billing_info: any;
  pdf_url: string | null;
  created_at: string;
}

export interface AdminInvoice extends Invoice {
  user_id: string;
  user_email: string;
}
