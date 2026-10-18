export type PaymentStatus = 'open' | 'paid';

export type Payment = {
  id: number;
  payer_id: number;
  amount_cents: number;
  status: 'succeeded';
  provider_reference: string;
  created_at: string;
};

export type PaymentRequest = {
  id: number;
  student: { id: number; name: string };
  parent: { id: number; name: string };
  created_by: number;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: 'NZD';
  due_date: string | null;
  status: PaymentStatus;
  created_at: string;
  paid_at: string | null;
  payment: Payment | null;
};

export type PaymentRequestList = { items: PaymentRequest[] };

export type DemoParent = { id: number; name: string };

export const DEMO_PARENTS: DemoParent[] = [
  { id: 2, name: 'Parent A' },
  { id: 3, name: 'Parent B' },
];
