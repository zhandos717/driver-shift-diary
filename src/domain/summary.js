import { PAYMENT_METHODS } from './trip.js';

export function summarize(trips) {
  const byPayment = Object.fromEntries(PAYMENT_METHODS.map((p) => [p, { count: 0, amount: 0 }]));
  let revenue = 0, commission = 0;
  for (const t of trips) {
    revenue += t.amount;
    commission += t.commission;
    byPayment[t.payment].count++;
    byPayment[t.payment].amount += t.amount;
  }
  return { count: trips.length, revenue, commission, net: revenue - commission, ...byPayment };
}
